/**
 * Binance 现货交易模块
 *
 * 功能：
 * - 下单（限价、市价）
 * - 取消订单
 * - 查询订单状态
 * - 获取账户持仓
 */
export function createBinanceSpotModule(apiClient) {
  return {
    /**
     * 下限价单
     *
     * @param {string} symbol - 交易对（如 BTCUSDT）
     * @param {string} side - 买卖方向（BUY / SELL）
     * @param {number} quantity - 数量
     * @param {number} price - 价格
     * @param {object} [options] - 其他选项
     * @returns {Promise<{symbol, orderId, clientOrderId, ...}>}
     */
    async placeLimitOrder(symbol, side, quantity, price, options = {}) {
      if (!symbol || !side || !quantity || !price) {
        throw new Error("symbol, side, quantity, price 不能为空");
      }

      const data = {
        symbol,
        side: String(side).toUpperCase(),
        type: "LIMIT",
        timeInForce: options.timeInForce ?? "GTC", // GTC: 成交或取消, IOC: 立即成交或取消, FOK: 全部成交或全部取消
        quantity,
        price,
        ...options,
      };

      const result = await apiClient.post("/api/v3/order", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 下市价单
     *
     * @param {string} symbol - 交易对
     * @param {string} side - 买卖方向
     * @param {number} quantity - 数量
     * @param {object} [options] - 其他选项
     * @returns {Promise<{symbol, orderId, ...}>}
     */
    async placeMarketOrder(symbol, side, quantity, options = {}) {
      if (!symbol || !side || !quantity) {
        throw new Error("symbol, side, quantity 不能为空");
      }

      const data = {
        symbol,
        side: String(side).toUpperCase(),
        type: "MARKET",
        quantity,
        ...options,
      };

      const result = await apiClient.post("/api/v3/order", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 查询订单
     *
     * @param {string} symbol - 交易对
     * @param {number} [orderId] - 订单 ID
     * @param {string} [clientOrderId] - 客户端订单 ID
     * @returns {Promise<{symbol, orderId, clientOrderId, price, origQty, executedQty, status, ...}>}
     */
    async queryOrder(symbol, orderId = null, clientOrderId = null) {
      if (!symbol || (!orderId && !clientOrderId)) {
        throw new Error("symbol 和 (orderId 或 clientOrderId) 至少一个不能为空");
      }

      const data = {
        symbol,
        ...(orderId && { orderId }),
        ...(clientOrderId && { origClientOrderId: clientOrderId }),
      };

      const result = await apiClient.get("/api/v3/order", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 取消订单
     *
     * @param {string} symbol - 交易对
     * @param {number} [orderId] - 订单 ID
     * @param {string} [clientOrderId] - 客户端订单 ID
     * @returns {Promise<{symbol, orderId, clientOrderId, ...}>}
     */
    async cancelOrder(symbol, orderId = null, clientOrderId = null) {
      if (!symbol || (!orderId && !clientOrderId)) {
        throw new Error("symbol 和 (orderId 或 clientOrderId) 至少一个不能为空");
      }

      const data = {
        symbol,
        ...(orderId && { orderId }),
        ...(clientOrderId && { origClientOrderId: clientOrderId }),
      };

      const result = await apiClient.delete("/api/v3/order", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 获取订单历史（打开的订单）
     *
     * @param {string} [symbol] - 交易对（可选）
     * @param {number} [limit=500] - 数量限制
     * @returns {Promise<Array<{symbol, orderId, ...}>>}
     */
    async getOpenOrders(symbol = null, limit = 500) {
      const data = {
        ...(symbol && { symbol }),
        limit: Math.min(limit, 1000),
      };

      const result = await apiClient.get("/api/v3/openOrders", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 获取所有订单
     *
     * @param {string} symbol - 交易对
     * @param {object} [options] - 其他选项（orderId, startTime, endTime, limit）
     * @returns {Promise<Array<{symbol, orderId, ...}>>}
     */
    async getAllOrders(symbol, options = {}) {
      if (!symbol) throw new Error("symbol 不能为空");

      const data = {
        symbol,
        ...(options.orderId && { orderId: options.orderId }),
        ...(options.startTime && { startTime: options.startTime }),
        ...(options.endTime && { endTime: options.endTime }),
        limit: Math.min(options.limit ?? 500, 1000),
      };

      const result = await apiClient.get("/api/v3/allOrders", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 获取账户持仓
     *
     * @returns {Promise<{balances: Array<{asset, free, locked}>}>}
     */
    async getBalances() {
      const result = await apiClient.get("/api/v3/account", {
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 获取特定资产余额
     *
     * @param {string} asset - 资产（如 BTC, USDT）
     * @returns {Promise<{asset, free, locked}>}
     */
    async getBalance(asset) {
      if (!asset) throw new Error("asset 不能为空");

      const result = await apiClient.get("/api/v3/account", {
        auth: true,
        signature: true,
      });

      const balances = result.data?.balances ?? [];
      return balances.find((b) => String(b.asset).toUpperCase() === String(asset).toUpperCase()) ?? null;
    },

    /**
     * 账户成交历史
     *
     * @param {string} symbol - 交易对
     * @param {object} [options] - 其他选项（startTime, endTime, limit）
     * @returns {Promise<Array<{symbol, orderId, id, price, qty, commission, ...}>>}
     */
    async getTradeHistory(symbol, options = {}) {
      if (!symbol) throw new Error("symbol 不能为空");

      const data = {
        symbol,
        ...(options.startTime && { startTime: options.startTime }),
        ...(options.endTime && { endTime: options.endTime }),
        limit: Math.min(options.limit ?? 500, 1000),
      };

      const result = await apiClient.get("/api/v3/myTrades", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },
  };
}

export default createBinanceSpotModule;
