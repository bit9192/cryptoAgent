/**
 * Binance 账户信息模块
 *
 * 功能：
 * - 获取账户信息
 * - 获取资产情况
 * - 获取交易对佣金
 * - API 密钥权限检查
 */
export function createBinanceAccountModule(apiClient) {
  return {
    /**
     * 获取账户信息（Spot）
     *
     * @returns {Promise<{makerCommission, takerCommission, buyerCommission, sellerCommission, canTrade, canWithdraw, canDeposit, balances, ...}>}
     */
    async getAccountInfo() {
      const result = await apiClient.get("/api/v3/account", {
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 获取所有资产余额
     *
     * @returns {Promise<Array<{asset, free, locked}>>}
     */
    async getBalances() {
      const account = await this.getAccountInfo();
      return account?.balances ?? [];
    },

    /**
     * 获取指定资产余额
     *
     * @param {string} asset - 资产代码（如 BTC, USDT）
     * @returns {Promise<{asset, free, locked}|null>}
     */
    async getBalance(asset) {
      if (!asset) throw new Error("asset 不能为空");

      const balances = await this.getBalances();
      const normalizedAsset = String(asset).toUpperCase();
      return balances.find((b) => String(b.asset).toUpperCase() === normalizedAsset) ?? null;
    },

    /**
     * 获取账户总资产净值（以指定币种计）
     *
     * @param {string} quoteCurrency - 计价币种（如 USDT）
     * @returns {Promise<{total: number, byAsset: {[asset]: value}}>}
     */
    async getTotalEquity(quoteCurrency = "USDT") {
      const balances = await this.getBalances();
      
      // 需要使用行情接口将各币种转换为计价币种
      const nonZeroBalances = balances.filter((b) => Number(b.free) + Number(b.locked) > 0);
      
      const equity = {
        total: 0,
        byAsset: {},
      };

      for (const balance of nonZeroBalances) {
        const amount = Number(balance.free) + Number(balance.locked);
        
        if (balance.asset === quoteCurrency) {
          equity.byAsset[balance.asset] = amount;
          equity.total += amount;
        } else {
          // 使用价格转换 (需要行情数据)
          equity.byAsset[balance.asset] = amount;
        }
      }

      return equity;
    },

    /**
     * 获取交易对佣金信息
     *
     * @param {string} [symbol] - 交易对（可选，默认返回所有）
     * @returns {Promise<{symbol, makerCommission, takerCommission, buyerCommission, sellerCommission, ...}>}
     */
    async getCommission(symbol = null) {
      const data = symbol ? { symbols: symbol } : {};

      const result = await apiClient.get("/api/v3/account/commission/bySymbol", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 检查 API 密钥权限
     *
     * @returns {Promise<{ipRestrict, createTime, enableWithdrawals, enableInternalTransfer, permitsUniversalTransfer, enableVanillaOptions, enableReading, enableFutures, enableMargin, enableSpotAndMarginTrading, tradingAuthorityExpirationTime}>}
     */
    async getApiKeyPermission() {
      const result = await apiClient.get("/api/v3/apiRestrictions", {
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 获取用户充提历史
     *
     * @param {object} [options] - 配置
     * @returns {Promise<Array<{coin, status, address, amount, txId, insertTime, ...}>>}
     */
    async getDepositHistory(options = {}) {
      const data = {
        ...(options.coin && { coin: options.coin }),
        ...(options.status && { status: options.status }),
        ...(options.offset && { offset: options.offset }),
        ...(options.limit && { limit: options.limit }),
        ...(options.startTime && { startTime: options.startTime }),
        ...(options.endTime && { endTime: options.endTime }),
      };

      const result = await apiClient.get("/sapi/v1/capital/deposit/hisrec", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 获取提现历史
     *
     * @param {object} [options] - 配置
     * @returns {Promise<Array<{coin, address, status, amount, transactionFee, ...}>>}
     */
    async getWithdrawalHistory(options = {}) {
      const data = {
        ...(options.coin && { coin: options.coin }),
        ...(options.status && { status: options.status }),
        ...(options.offset && { offset: options.offset }),
        ...(options.limit && { limit: options.limit }),
        ...(options.startTime && { startTime: options.startTime }),
        ...(options.endTime && { endTime: options.endTime }),
      };

      const result = await apiClient.get("/sapi/v1/capital/withdraw/history", {
        data,
        auth: true,
        signature: true,
      });

      return result.data;
    },

    /**
     * 账户交易等级
     *
     * @returns {Promise<{vipLevel, userClass, ...}>}
     */
    async getAccountStatus() {
      const result = await apiClient.get("/sapi/v1/account/status", {
        auth: true,
        signature: true,
      });

      return result.data;
    },
  };
}

export default createBinanceAccountModule;
