/**
 * 链下数据源统一入口
 *
 * 职责：
 * - 初始化并管理所有数据源
 * - 提供统一的查询接口
 * - 处理缓存、重试、故障转移
 * - 性能监控和日志
 */

import DataSourceRegistry from "./registry.mjs";
import { DataSourceBase } from "./base.mjs";
import { dataSourceConfigs, fallbackRules, cachePolicies } from "./config.mjs";

export class OffchainDataSourceManager {
  constructor(options = {}) {
    this.registry = new DataSourceRegistry({
      fallbackRules,
      cachePolicies,
      logger: options.logger ?? console,
      healthCheckInterval: options.healthCheckInterval ?? 60000,
    });

    this.cache = new Map();
    this.cacheConfig = cachePolicies;
    this.logger = options.logger ?? console;
  }

  /**
   * 初始化所有数据源
   */
  async init(sources = []) {
    this.logger.info("🚀 初始化链下数据源管理器...");

    for (const sourceInstance of sources) {
      const name = sourceInstance.metadata.name;
      const config = dataSourceConfigs[name] ?? {};

      if (config.enabled !== false) {
        try {
          await this.registry.register(sourceInstance, config);
        } catch (error) {
          this.logger.error(`⚠️  注册数据源 ${name} 失败:`, error.message);
        }
      }
    }

    // 启动定时健康检查
    this.registry.startHealthCheckTimer();

    this.logger.info("✓ 链下数据源管理器初始化完成");
  }

  /**
   * 获取缓存
   */
  getCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * 设置缓存
   */
  setCache(key, value, ttl) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * 清除缓存
   */
  clearCache(key = null) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 执行查询 - 通用方法
   *
   * @param {string} capability - 能力名称
   * @param {Function} executor - 执行函数
   * @param {object} options - 选项
   */
  async queryWithFallback(capability, executor, options = {}) {
    const cacheKey = options.cacheKey ?? `${capability}:${JSON.stringify(options.params ?? {})}`;
    const cacheTTL = this.cacheConfig[capability] ?? 60000;
    const useCache = options.useCache !== false;

    // 尝试从缓存读取
    if (useCache) {
      const cached = this.getCache(cacheKey);
      if (cached) {
        this.logger.debug(`✓ 缓存命中: ${cacheKey}`);
        return cached;
      }
    }

    // 执行查询（带故障转移）
    try {
      const result = await this.registry.query(capability, executor, options);

      // 缓存结果
      if (useCache) {
        this.setCache(cacheKey, result, cacheTTL);
      }

      return result;
    } catch (error) {
      this.logger.error(`❌ 查询失败 [${capability}]:`, error.message);
      throw error;
    }
  }

  /**
   * 获取代币价格
   */
  async getPrice(tokens, options = {}) {
    return this.queryWithFallback(
      "getPrice",
      async (source) => this.callSourceMethod(source, "getPrice", tokens),
      { ...options, cacheKey: `price:${tokens.join(",")}` }
    );
  }

  /**
   * 获取 Token 信息
   */
  async getTokenInfo(token, options = {}) {
    return this.queryWithFallback(
      "getTokenInfo",
      async (source) => this.callSourceMethod(source, "getTokenInfo", token),
      { ...options, cacheKey: `tokenInfo:${token}` }
    );
  }

  /**
   * 获取链信息
   */
  async getChainInfo(chainId, options = {}) {
    return this.queryWithFallback(
      "getChainInfo",
      async (source) => this.callSourceMethod(source, "getChainInfo", chainId),
      { ...options, cacheKey: `chainInfo:${chainId}` }
    );
  }

  /**
   * 获取 DEX Pair 信息
   */
  async getPairInfo(chainId, pairAddress, options = {}) {
    return this.queryWithFallback(
      "getPairInfo",
      async (source) => this.callSourceMethod(source, "getPairInfo", chainId, pairAddress),
      { ...options, cacheKey: `pairInfo:${chainId}:${pairAddress}` }
    );
  }

  /**
   * 调用源的方法
   */
  async callSourceMethod(source, method, ...args) {
    if (typeof source[method] !== "function") {
      throw new Error(`源 ${source.name} 不支持方法 ${method}`);
    }

    return source[method](...args);
  }

  /**
   * 获取健康状态
   */
  async getHealthStatus() {
    return this.registry.healthCheck();
  }

  /**
   * 获取指标信息
   */
  getMetrics() {
    return this.registry.getMetrics();
  }

  /**
   * 列出所有源
   */
  listSources(filter) {
    return this.registry.listSources(filter);
  }

  /**
   * 关闭管理器
   */
  async shutdown() {
    this.clearCache();
    await this.registry.shutdown();
    this.logger.info("✓ 链下数据源管理器已关闭");
  }
}

/**
 * 工厂函数 - 创建管理器
 */
export async function createOffchainManager(sources = [], options = {}) {
  const manager = new OffchainDataSourceManager(options);
  await manager.init(sources);
  return manager;
}

export default createOffchainManager;
