/**
 * Binance 行情数据模块
 *
 * 功能：
 * - 获取交易对信息  
 * - 获取 K 线数据
 * - 获取实时行情
 * - 获取订单簿深度
 */
export function createBinanceMarketModule(apiClient) {
  return {
    /**
     * 获取 24h 价格变化统计
     * 
     * @param {string} symbol - 交易对（如 BTCUSDT）
     * @returns {Promise<{symbol, price, priceChange, priceChangePercent, ...}>}
     */
    async get24hTicker(symbol) {
      if (!symbol) throw new Error("symbol 不能为空");
      const result = await apiClient.get("/api/v3/ticker/24hr", { data: { symbol } });
      return result.data;
    },

    /**
     * 获取最新价格
     *
     * @param {string} symbol - 交易对
     * @returns {Promise<{symbol, price}>}
     */
    async getLatestPrice(symbol) {
      if (!symbol) throw new Error("symbol 不能为空");
      const result = await apiClient.get("/api/v3/ticker/price", { data: { symbol } });
      return result.data;
    },

    /**
     * 获取最佳买卖价
     *
     * @param {string} symbol - 交易对
     * @returns {Promise<{symbol, bidPrice, bidQty, askPrice, askQty}>}
     */
    async getBestPrice(symbol) {
      if (!symbol) throw new Error("symbol 不能为空");
      const result = await apiClient.get("/api/v3/ticker/bookTicker", { data: { symbol } });
      return result.data;
    },

    /**
     * 获取订单簿深度
     *
     * @param {string} symbol - 交易对
     * @param {number} [limit=100] - 深度档位（5, 10, 20, 50, 100）
     * @returns {Promise<{bids, asks, lastUpdateId}>}
     */
    async getOrderBook(symbol, limit = 100) {
      if (!symbol) throw new Error("symbol 不能为空");
      const result = await apiClient.get("/api/v3/depth", {
        data: { symbol, limit },
      });
      return result.data;
    },

    /**
     * 获取最近成交
     *
     * @param {string} symbol - 交易对
     * @param {number} [limit=100] - 数量（最多 1000）
     * @returns {Promise<Array<{id, price, qty, time, ...}>>}
     */
    async getRecentTrades(symbol, limit = 100) {
      if (!symbol) throw new Error("symbol 不能为空");
      const result = await apiClient.get("/api/v3/trades", {
        data: { symbol, limit: Math.min(limit, 1000) },
      });
      return result.data;
    },

    /**
     * 获取 K 线数据
     *
     * @param {string} symbol - 交易对
     * @param {string} [interval='1h'] - 时间间隔（1m, 5m, 1h, 1d 等）
     * @param {object} [options] - 其他选项（startTime, endTime, limit）
     * @returns {Promise<Array<[time, open, high, low, close, volume, ...]>>}
     */
    async getKlines(symbol, interval = "1h", options = {}) {
      if (!symbol) throw new Error("symbol 不能为空");
      const result = await apiClient.get("/api/v3/klines", {
        data: {
          symbol,
          interval,
          startTime: options.startTime,
          endTime: options.endTime,
          limit: Math.min(options.limit ?? 500, 1000),
        },
      });
      return result.data;
    },

    /**
     * 获取交易对信息
     *
     * @param {string} symbol - 交易对（可选）
     * @returns {Promise<Array<{symbol, baseAsset, quoteAsset, ...}>>}
     */
    async getExchangeInfo(symbol = null) {
      const data = symbol ? { symbol } : {};
      const result = await apiClient.get("/api/v3/exchangeInfo", { data });
      return result.data;
    },

    /**
     * 获取平均价格
     *
     * @param {string} symbol - 交易对
     * @returns {Promise<{mins, price}>}
     */
    async getAveragePrice(symbol) {
      if (!symbol) throw new Error("symbol 不能为空");
      const result = await apiClient.get("/api/v3/avgPrice", { data: { symbol } });
      return result.data;
    },
  };
}

export default createBinanceMarketModule;
