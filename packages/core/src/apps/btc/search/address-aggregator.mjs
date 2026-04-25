import { createNativeBalanceResolver } from "./protocols/native-balance-resolver.mjs";
import { createBrc20BalanceResolver } from "./protocols/brc20-balance-resolver.mjs";

/**
 * BTC 地址资产聚合器。
 *
 * 根据 classifier 返回的 capabilities 决定调用哪些 resolver：
 * - "native" → 始终调用 native-balance-resolver
 * - "brc20"  → 仅当 P2TR (Taproot) 时调用 brc20-balance-resolver
 *
 * 各 resolver 并发执行，单点失败优雅降级（返回 []），不影响其他资产查询。
 */
export function createAddressAggregator(options = {}) {
  const nativeResolver = options.nativeResolver ?? createNativeBalanceResolver();
  const brc20Resolver = options.brc20Resolver ?? createBrc20BalanceResolver();
  // 预留：runesResolver 等其他协议 resolver

  /**
   * @param {object} classified  classifyBtcAddress 返回结果
   * @returns {Promise<SearchItem[]>}
   */
  async function aggregate(classified = {}) {
    const { address, network, capabilities = [] } = classified;

    const promises = [];

    // native 查询：所有地址类型都执行
    if (capabilities.includes("native")) {
      promises.push(
        (async () => {
          try {
            return await nativeResolver.resolve({ address, network });
          } catch {
            return [];
          }
        })(),
      );
    }

    // BRC20 查询：仅 P2TR (Taproot) 执行
    if (capabilities.includes("brc20")) {
      promises.push(
        (async () => {
          try {
            return await brc20Resolver.resolve({ address, network });
          } catch {
            return [];
          }
        })(),
      );
    }

    const results = await Promise.all(promises);
    return results.flat();
  }

  return { aggregate };
}

export default {
  createAddressAggregator,
};
