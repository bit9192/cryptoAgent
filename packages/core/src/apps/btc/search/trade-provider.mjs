import { createTradeAggregator } from "./trade-aggregator.mjs";

/**
 * SearchEngine-compatible BTC trade search provider。
 *
 * 职责：
 * 1. 参数验证（query 不能为空）
 * 2. 规范化 ticker + network
 * 3. 委托 trade-aggregator 顺序降级查询（BestInSlot → Coinpaprika）
 * 4. 返回统一 TradeItem[]
 *
 * query = BRC20 ticker，如 "ordi"、"SATS"（大小写不敏感）
 * network 默认 "mainnet"（BRC20 只在 mainnet 有市场）
 *
 * @param {object} [options]
 * @param {object} [options.bestInSlotSource]   覆盖默认 BestInSlot source（测试用）
 * @param {object} [options.coinpaprikaSource]  覆盖默认 Coinpaprika source（测试用）
 */
export function createBtcTradeSearchProvider(options = {}) {
  const aggregator = createTradeAggregator({
    bestInSlotSource: options.bestInSlotSource,
    coinpaprikaSource: options.coinpaprikaSource,
  });

  async function searchTrade(input = {}) {
    const query = String(input?.query ?? "").trim();
    if (!query) {
      throw new TypeError("query 不能为空");
    }

    const ticker = query.toLowerCase();
    const network = String(input?.network ?? "mainnet").trim().toLowerCase() || "mainnet";

    return await aggregator.search(ticker, network);
  }

  return {
    id: "btc-trade",
    chain: "btc",
    networks: ["mainnet"],
    capabilities: ["trade"],
    searchTrade,
  };
}

export default { createBtcTradeSearchProvider };
