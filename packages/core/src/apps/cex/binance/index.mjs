import BinanceApiClient from "./api.mjs";
import createBinanceMarketModule from "./market.mjs";
import createBinanceSpotModule from "./spot.mjs";
import createBinanceFuturesModule from "./futures.mjs";
import createBinanceAccountModule from "./account.mjs";

/**
 * 创建 Binance CEX 客户端
 *
 * @param {object} options
 * @param {string} options.apiKey - API Key
 * @param {string} options.apiSecret - API Secret
 * @param {string} [options.baseUrl] - 基础 URL（默认 https://api.binance.com）
 * @param {number} [options.timeout] - 请求超时（默认 5000ms）
 * @returns {object} Binance 客户端实例
 *
 * 示例：
 * ```javascript
 * const binance = createBinanceClient({
 *   apiKey: process.env.BINANCE_API_KEY,
 *   apiSecret: process.env.BINANCE_API_SECRET,
 * });
 *
 * // 获取行情
 * const price = await binance.market.getLatestPrice("BTCUSDT");
 * console.log(price); // { symbol: "BTCUSDT", price: "43521.50" }
 *
 * // 下单
 * const order = await binance.spot.placeLimitOrder("BTCUSDT", "BUY", 0.01, 43000);
 *
 * // 查询账户余额
 * const balances = await binance.account.getBalances();
 * ```
 */
export function createBinanceClient(options = {}) {
  if (!options.apiKey || !options.apiSecret) {
    throw new Error("apiKey 和 apiSecret 不能为空");
  }

  const apiClient = new BinanceApiClient(options);

  return {
    // 配置和状态
    config: {
      apiKey: options.apiKey,
      baseUrl: apiClient.baseUrl,
      timeout: apiClient.timeout,
    },

    // 行情数据接口
    market: createBinanceMarketModule(apiClient),

    // 现货交易接口
    spot: createBinanceSpotModule(apiClient),

    // 合约交易接口（USDT Futures）
    futures: createBinanceFuturesModule(apiClient),

    // 账户和资产接口
    account: createBinanceAccountModule(apiClient),

    // 原始 API 客户端（用于自定义请求）
    api: apiClient,
  };
}

// 默认导出
export default createBinanceClient;

// 命名导出
export { BinanceApiClient };
export { createBinanceMarketModule };
export { createBinanceSpotModule };
export { createBinanceFuturesModule };
export { createBinanceAccountModule };
