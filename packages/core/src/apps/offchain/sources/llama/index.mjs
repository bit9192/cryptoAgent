/**
 * Llama (DefiLlama) 数据源
 * 提供 DeFi 协议 TVL、链信息、Protocol 数据
 * 
 * 官网: https://llama.fi
 * API: https://api.llama.fi/docs
 */

import { DataSourceBase } from "../base.mjs";

export class LlamaSource extends DataSourceBase {
  metadata = {
    name: "llama",
    version: "1.0.0",
    description: "DefiLlama - DeFi protocols TVL and chain data",
    capabilities: ["getProtocolTVL", "getChainTVL", "getTokenInfo", "getChainInfo"],
    baseUrl: "https://api.llama.fi",
    rateLimit: { requests: 100, period: 60000 }, // 100/min
    cacheTTL: 600000, // 10 min for TVL data
    timeout: 10000,
    supportedChains: [
      "ethereum", "bsc", "polygon", "arbitrum", "optimism", "avalanche",
      "fantom", "harmony", "celo", "gnosis", "arbitrum", "tron"
    ],
  };

  constructor() {
    super();
    this.protocolCache = new Map();
    this.chainCache = new Map();
  }

  async init(config = {}) {
    this.config = { ...this.metadata, ...config };
    console.log(`[Llama] 初始化完成 - 支持 ${this.metadata.supportedChains.length} 条链`);
  }

  async healthCheck() {
    try {
      const startTime = Date.now();
      const response = await fetch(`${this.config.baseUrl}/protocols`, {
        signal: AbortSignal.timeout(this.config.timeout),
        headers: { "Accept": "application/json" },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const responseTime = Date.now() - startTime;
      if (responseTime > 5000) {
        this.recordFailure(new Error("Slow response"));
      } else {
        this.recordSuccess(responseTime);
      }
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * 获取单个协议的 TVL
   * @param {string} protocolName - 协议名称（如 "aave", "uniswap"）
   * @returns {Promise<Object>} TVL 数据
   */
  async getProtocolTVL(protocolName) {
    await this.preCheck();
    
    const cacheKey = `llama:protocol:${protocolName}`;
    if (this.cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey).data;
    }

    try {
      const startTime = Date.now();
      const response = await fetch(
        `${this.config.baseUrl}/protocol/${protocolName}`,
        { signal: AbortSignal.timeout(this.config.timeout) }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Protocol not found`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;

      // 提取关键数据
      const result = {
        name: data.name,
        symbol: data.symbol,
        description: data.description,
        url: data.url,
        logo: data.logo,
        tvl: data.tvl || 0,
        change_1h: data.change_1h,
        change_1d: data.change_1d,
        change_7d: data.change_7d,
        chainTVLs: data.chainTvls || {},
        audits: data.audits || [],
        lastUpdate: data.lastUpdate,
      };

      this.recordSuccess(responseTime);

      if (this.cache) {
        this.cache.set(cacheKey, { data: result, expiry: Date.now() + this.config.cacheTTL });
      }

      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * 获取链上所有协议的总 TVL
   * @param {string} chain - 链名称（"ethereum", "bsc", "polygon" 等）
   * @returns {Promise<Object>} 链上 TVL 数据
   */
  async getChainTVL(chain) {
    await this.preCheck();

    const cacheKey = `llama:chain:${chain}`;
    if (this.cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey).data;
    }

    try {
      const startTime = Date.now();
      const response = await fetch(
        `${this.config.baseUrl}/chains`,
        { signal: AbortSignal.timeout(this.config.timeout) }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const chains = await response.json();
      const chainData = chains.find(c => 
        c.name?.toLowerCase() === chain.toLowerCase() || 
        c.gecko_id?.toLowerCase() === chain.toLowerCase()
      );

      if (!chainData) {
        throw new Error(`Chain '${chain}' not found`);
      }

      const responseTime = Date.now() - startTime;

      const result = {
        name: chainData.name,
        tvl: chainData.tvl,
        mcap: chainData.mcap,
        tokenSymbol: chainData.tokenSymbol,
        cmcId: chainData.cmcId,
        geckoId: chainData.gecko_id,
        change_1h: chainData.change_1h,
        change_1d: chainData.change_1d,
        change_7d: chainData.change_7d,
      };

      this.recordSuccess(responseTime);

      if (this.cache) {
        this.cache.set(cacheKey, { data: result, expiry: Date.now() + this.config.cacheTTL });
      }

      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * 获取所有协议列表
   * @returns {Promise<Array>} 协议列表
   */
  async getAllProtocols() {
    const cacheKey = "llama:protocols:all";
    if (this.cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey).data;
    }

    try {
      const startTime = Date.now();
      const response = await fetch(
        `${this.config.baseUrl}/protocols`,
        { signal: AbortSignal.timeout(this.config.timeout) }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const protocols = await response.json();
      const responseTime = Date.now() - startTime;

      // 简化数据，只返回必要字段
      const result = protocols.map(p => ({
        id: p.id,
        name: p.name,
        symbol: p.symbol,
        category: p.category,
        tvl: p.tvl,
        change_1d: p.change_1d,
      }));

      this.recordSuccess(responseTime);

      if (this.cache) {
        this.cache.set(cacheKey, { data: result, expiry: Date.now() + this.config.cacheTTL });
      }

      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * 获取所有链的 TVL
   * @returns {Promise<Array>} 链列表和 TVL
   */
  async getAllChains() {
    const cacheKey = "llama:chains:all";
    if (this.cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey).data;
    }

    try {
      const startTime = Date.now();
      const response = await fetch(
        `${this.config.baseUrl}/chains`,
        { signal: AbortSignal.timeout(this.config.timeout) }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const chains = await response.json();
      const responseTime = Date.now() - startTime;

      const result = chains.map(c => ({
        name: c.name,
        tvl: c.tvl,
        mcap: c.mcap,
        tokenSymbol: c.tokenSymbol,
        change_1d: c.change_1d,
      }));

      this.recordSuccess(responseTime);

      if (this.cache) {
        this.cache.set(cacheKey, { data: result, expiry: Date.now() + this.config.cacheTTL });
      }

      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * 按 TVL 排序获取顶部协议
   * @param {number} limit - 返回个数
   * @returns {Promise<Array>} 顶部协议列表
   */
  async getTopProtocols(limit = 20) {
    try {
      const protocols = await this.getAllProtocols();
      return protocols
        .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
        .slice(0, limit);
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * 获取某个类别的协议
   * @param {string} category - 类别（"dexes", "lending", "derivatives" 等）
   * @returns {Promise<Array>} 协议列表
   */
  async getProtocolsByCategory(category) {
    try {
      const protocols = await this.getAllProtocols();
      return protocols.filter(p => p.category?.toLowerCase() === category.toLowerCase());
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * 实现基类要求的 getTokenInfo 方法
   * Llama 不直接提供 Token 信息，返回相关链接
   */
  async getTokenInfo(token) {
    // Llama 不直接提供 Token 信息，但可以搜索相关协议
    const protocols = await this.getAllProtocols();
    const related = protocols.filter(p => 
      p.name?.toLowerCase().includes(token.toLowerCase()) ||
      p.symbol?.toLowerCase() === token.toLowerCase()
    );
    
    if (related.length === 0) {
      throw new Error(`No protocols found for token: ${token}`);
    }

    return {
      source: "llama",
      query: token,
      relatedProtocols: related.slice(0, 5),
      note: "Use getProtocolTVL for detailed protocol information",
    };
  }

  /**
   * 实现基类要求的 getChainInfo 方法
   * 返回链的 TVL 信息
   */
  async getChainInfo(chainId) {
    // Llama 使用链名而非 chainId
    const chainNameMap = {
      1: "ethereum",
      56: "bsc",
      137: "polygon",
      42161: "arbitrum",
      10: "optimism",
      43114: "avalanche",
      250: "fantom",
      1666600000: "harmony",
      42220: "celo",
      100: "gnosis",
      /**  Tron 相关 */
      195: "tron",
    };

    const chainName = chainNameMap[chainId] || Object.keys(chainNameMap)
      .find(id => parseInt(id) === chainId);

    if (!chainName) {
      throw new Error(`Chain ID ${chainId} not supported by Llama`);
    }

    return this.getChainTVL(chainName);
  }

  /**
   * 获取链的历史 TVL 数据
   * @param {string} chain - 链名称
   * @returns {Promise<Array>} 历史 TVL 数据点
   */
  async getChainTVLHistory(chain) {
    try {
      const startTime = Date.now();
      const response = await fetch(
        `${this.config.baseUrl}/v2/historicalChainTvl/${chain}`,
        { signal: AbortSignal.timeout(this.config.timeout) }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;

      this.recordSuccess(responseTime);
      return data;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  async shutdown() {
    console.log("[Llama] 清理资源");
    this.protocolCache.clear();
    this.chainCache.clear();
  }
}

export default LlamaSource;
