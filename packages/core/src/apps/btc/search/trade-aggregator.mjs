import { createBestInSlotTradeSource } from "./sources/bestinslot-trade-source.mjs";
import { createCoinpaprikaTradeSource } from "./sources/coinpaprika-trade-source.mjs";

/**
 * BTC trade 顺序降级聚合器。
 *
 * 策略：前一个 source 有结果就直接返回，不再调下一个。
 *
 *   BestInSlot（有 key）→ Coinpaprika（免费兜底）→ []
 *
 * 任何 source 抛错都会被捕获，视为"无结果"，继续降级。
 */
export function createTradeAggregator(options = {}) {
  const bestInSlot = options.bestInSlotSource ?? createBestInSlotTradeSource();
  const coinpaprika = options.coinpaprikaSource ?? createCoinpaprikaTradeSource();

  // 顺序 source 链，可通过 options 注入 mock（测试用）
  const sources = [bestInSlot, coinpaprika];

  /**
   * @param {string} ticker  BRC20 ticker（已正规化为小写）
   * @param {string} network BTC network
   * @returns {Promise<TradeItem[]>}
   */
  async function search(ticker, network) {
    for (const source of sources) {
      let item = null;
      try {
        item = await source.fetch(ticker, network);
      } catch {
        // source 抛错 → 继续下一个
      }
      if (item != null) {
        return [item];
      }
    }
    return [];
  }

  return { search };
}

export default { createTradeAggregator };
