import { classifyBtcAddress } from "./address-classifier.mjs";
import { createAddressAggregator } from "./address-aggregator.mjs";

/**
 * SearchEngine-compatible BTC address search provider。
 *
 * 职责：
 * 1. 参数验证（address 不能为空）
 * 2. 地址分类（格式 / 网络 / 能力判断）
 * 3. 委托 aggregator 按能力并发查询各协议资产
 * 4. 返回统一 SearchItem[]
 *
 * @param {object} options
 * @param {object} [options.nativeResolver]  覆盖默认 native-balance-resolver（测试用）
 * @param {object} [options.brc20Resolver]   覆盖默认 brc20-balance-resolver（测试用）
 * @returns {SearchProvider}
 */
export function createBtcAddressSearchProvider(options = {}) {
  const aggregator = createAddressAggregator({
    nativeResolver: options.nativeResolver,
    brc20Resolver: options.brc20Resolver,
  });

  async function searchAddress(input = {}) {
    const query = String(input?.query ?? "").trim();
    if (!query) {
      throw new TypeError("address 不能为空");
    }

    // 地址分类：解析格式/网络/能力，必要时转换 network
    const classified = classifyBtcAddress(query, input.network ?? null);

    return await aggregator.aggregate(classified);
  }

  return {
    id: "btc-address",
    chain: "btc",
    networks: ["mainnet", "testnet", "signet", "regtest"],
    capabilities: ["address"],
    searchAddress,
  };
}

export default {
  createBtcAddressSearchProvider,
};
