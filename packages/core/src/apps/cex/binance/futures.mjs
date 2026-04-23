/**
 * Binance 合约交易模块 (USDT futures)
 *
 * 功能：  
 * - 下单（限价、市价）
 * - 持仓管理（杠杆、止损）
 * - 查询持仓
 * - 成交历史
 */
export function createBinanceFuturesModule(apiClient) {
  // Futures API 基础路径
  const basePath = "/fapi/v1";

  return {
    /**
     * 下限价期货单
     *
     * @param {string} symbol - 合约对（如 BTCUSDT）
     * @param {string} side - 买卖方向（BUY / SELL）
     * @param {string} positionSide - 持仓方向（LONG / SHORT）
     * @param {number} quantity - 合约数量
     * @param {number} price - 价格
     * @param {object} [options] - 其他选项
     * @returns {Promise<{symbol, orderId, clientOrderId, ...}>}
     */
    async placeLimitOrder(symbol, side, positionSide, quantity, price, options = {}) {
      if (!symbol || !side || !positionSide || !quantity || !price) {
        throw new Error("symbol, side, positionSide, quantity, price 不能为空");
      }

      const data = {
        symbol,
        side: String(side).toUpperCase(),
        positionSide: String(positionSide).toUpperCase(),
        type: "LIMIT",
        timeInForce: options.timeInForce ?? "GTC",
        quantity,
        price,
        ...options,
      };

      const result = await apiClient.post(`${basePath}/order`, {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 下市价期货单
     *
     * @param {string} symbol - 合约对
     * @param {string} side - 买卖方向
     * @param {string} positionSide - 持仓方向
     * @param {number} quantity - 合约数量
     * @param {object} [options] - 其他选项
     * @returns {Promise<{symbol, orderId, ...}>}
     */
    async placeMarketOrder(symbol, side, positionSide, quantity, options = {}) {
      if (!symbol || !side || !positionSide || !quantity) {
        throw new Error("symbol, side, positionSide, quantity 不能为空");
      }

      const data = {
        symbol,
        side: String(side).toUpperCase(),
        positionSide: String(positionSide).toUpperCase(),
        type: "MARKET",
        quantity,
        ...options,
      };

      const result = await apiClient.post(`${basePath}/order`, {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 查询期货订单
     *
     * @param {string} symbol - 合约对
     * @param {number} [orderId] - 订单 ID
     * @param {string} [clientOrderId] - 客户端订单 ID
     * @returns {Promise<{...}>}
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

      const result = await apiClient.get(`${basePath}/order`, {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 取消期货订单
     *
     * @param {string} symbol - 合约对
     * @param {number} [orderId] - 订单 ID
     * @param {string} [clientOrderId] - 客户端订单 ID
     * @returns {Promise<{...}>}
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

      const result = await apiClient.delete(`${basePath}/order`, {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 获取持仓
     *
     * @returns {Promise<Array<{symbol, positionAmt, entryPrice, markPrice, unRealizedProfit, ...}>>}
     */
    async getPositions() {
      const result = await apiClient.get(`${basePath}/account`, {
        auth: true,
        signature: true,
      });

      return result.data?.positions ?? [];
    },

    /**
     * 获取特定合约持仓
     *
     * @param {string} symbol - 合约对
     * @returns {Promise<{symbol, positionAmt, entryPrice, ...}>}
     */
    async getPosition(symbol) {
      if (!symbol) throw new Error("symbol 不能为空");

      const positions = await this.getPositions();
      return positions.find((p) => p.symbol === symbol) ?? null;
    },

    /**
     * 设置杠杆倍数
     *
     * @param {string} symbol - 合约对
     * @param {number} leverage - 杠杆倍数（1-125）
     * @returns {Promise<{symbol, leverage, ...}>}
     */
    async setLeverage(symbol, leverage) {
      if (!symbol || !leverage) {
        throw new Error("symbol 和 leverage 不能为空");
      }

      const data = { symbol, leverage };

      const result = await apiClient.post(`${basePath}/leverage`, {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 设置持仓模式（单向 / 双向）
     *
     * @param {boolean} dualSidePosition - true: 双向, false: 单向
     * @returns {Promise<{...}>}
     */
    async setPositionMode(dualSidePosition = true) {
      const data = { dualSidePosition };

      const result = await apiClient.post(`${basePath}/positionSide/dual`, {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 设置止损止盈
     *
     * @param {string} symbol - 合约对
     * @param {string} side - BUY / SELL
     * @param {number} [stopPrice] - 止损价格
     * @param {number} [takeProfit] - 止盈百分比 (0-100)
     * @returns {Promise<{...}>}
     */
    async setStopLoss(symbol, side, stopPrice = null, takeProfit = null) {
      if (!symbol || !side) {
        throw new Error("symbol 和 side 不能为空");
      }

      const data = {
        symbol,
        side: String(side).toUpperCase(),
        ...(stopPrice && { stopPrice }),
        ...(takeProfit && { takeProfit }),
      };

      const result = await apiClient.post(`${basePath}/order`, {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 获取成交历史
     *
     * @param {string} symbol - 合约对
     * @param {object} [options] - 其他选项
     * @returns {Promise<Array<{symbol, orderId, side, executedQty, ...}>>}
     */
    async getTradeHistory(symbol, options = {}) {
      if (!symbol) throw new Error("symbol 不能为空");

      const data = {
        symbol,
        limit: Math.min(options.limit ?? 500, 1000),
        ...(options.startTime && { startTime: options.startTime }),
        ...(options.endTime && { endTime: options.endTime }),
      };

      const result = await apiClient.get(`${basePath}/userTrades`, {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },
  };
}

export default createBinanceFuturesModule;
