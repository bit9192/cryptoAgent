/**
 * 数据源注册中心 - 统一管理所有外部 API 源
 *
 * 职责：
 * - 注册/注销数据源
 * - 路由查询请求到合适的源
 * - 故障转移和备用源选择
 * - 健康检查和状态管理
 * - 性能监控和指标收集
 */
import { DataSourceBase } from "./base.mjs";

export class DataSourceRegistry {
  constructor(config = {}) {
    this.sources = new Map(); // name -> { instance, config, priority }
    this.fallbackRules = config.fallbackRules ?? {};
    this.cachePolicies = config.cachePolicies ?? {};
    this.logger = config.logger ?? console;
    this.healthCheckInterval = config.healthCheckInterval ?? 60000; // 1 分钟
    this.healthCheckTimer = null;
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalFallbacks: 0,
    };
  }

  /**
   * 注册数据源
   */
  async register(source, config = {}) {
    if (!(source instanceof DataSourceBase)) {
      throw new Error("数据源必须继承 DataSourceBase");
    }

    const name = source.metadata.name;
    if (!name) {
      throw new Error("数据源 metadata.name 不能为空");
    }

    if (this.sources.has(name)) {
      throw new Error(`数据源已存在: ${name}`);
    }

    // 初始化源
    try {
      await source.init(config);
    } catch (error) {
      this.logger.error(`初始化数据源 ${name} 失败:`, error.message);
      throw error;
    }

    // 存储源和配置
    this.sources.set(name, {
      instance: source,
      config,
      priority: config.priority ?? 10,
      enabled: config.enabled !== false,
    });

    this.logger.info(`✓ 注册数据源: ${name}`);
    return source;
  }

  /**
   * 注销数据源
   */
  async unregister(name) {
    const entry = this.sources.get(name);
    if (!entry) {
      return false;
    }

    try {
      await entry.instance.shutdown();
    } catch (error) {
      this.logger.warn(`清理数据源 ${name} 失败:`, error.message);
    }

    this.sources.delete(name);
    this.logger.info(`✓ 注销数据源: ${name}`);
    return true;
  }

  /**
   * 获取单个源
   */
  getSource(name) {
    const entry = this.sources.get(name);
    return entry?.instance ?? null;
  }

  /**
   * 列出所有源
   */
  listSources(filter = {}) {
    const entries = Array.from(this.sources.entries());

    let filtered = entries.map(([name, entry]) => ({
      name,
      ...entry.instance.metadata,
      priority: entry.priority,
      enabled: entry.enabled,
      status: entry.instance.getStatus(),
    }));

    // 按优先级排序
    filtered.sort((a, b) => a.priority - b.priority);

    return filtered;
  }

  /**
   * 单个源的健康检查
   */
  async checkSourceHealth(name, options = {}) {
    const entry = this.sources.get(name);
    if (!entry) {
      throw new Error(`未找到数据源: ${name}`);
    }

    const instance = entry.instance;
    const startTime = Date.now();

    try {
      const timeout = options.timeout ?? 10000;
      const signal = AbortSignal.timeout(timeout);

      await Promise.race([
        instance.healthCheck(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), timeout)
        ),
      ]);

      const responseTime = Date.now() - startTime;
      instance.recordSuccess(responseTime);

      return { ok: true, responseTime };
    } catch (error) {
      instance.recordFailure(error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * 全量健康检查
   */
  async healthCheck(options = {}) {
    this.logger.info("🏥 开始全量健康检查...");

    const results = {};
    const promises = Array.from(this.sources.keys()).map((name) =>
      this.checkSourceHealth(name, options)
        .then((result) => {
          results[name] = result;
        })
        .catch((error) => {
          results[name] = { ok: false, error: error.message };
        })
    );

    await Promise.all(promises);

    const summary = {
      timestamp: Date.now(),
      totalSources: this.sources.size,
      healthySources: Object.values(results).filter((r) => r.ok).length,
      results,
    };

    this.logger.info(`✓ 健康检查完成: ${summary.healthySources}/${summary.totalSources} 源正常`);

    return summary;
  }

  /**
   * 启动定时健康检查
   */
  startHealthCheckTimer(interval = this.healthCheckInterval) {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.healthCheck().catch((error) => {
        this.logger.error("健康检查异常:", error.message);
      });
    }, interval);

    this.logger.info(`✓ 启动定时健康检查 (间隔 ${interval}ms)`);
  }

  /**
   * 停止定时健康检查
   */
  stopHealthCheckTimer() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 查找支持能力的源
   */
  findSourcesForCapability(capability) {
    const candidates = Array.from(this.sources.entries())
      .filter(([, entry]) => entry.enabled && entry.instance.supports(capability))
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([name]) => name);

    return candidates;
  }

  /**
   * 查询一个能力，支持故障转移
   */
  async query(capability, executor, options = {}) {
    const sources = options.sources ?? this.findSourcesForCapability(capability);

    if (sources.length === 0) {
      throw new Error(`没有源支持能力: ${capability}`);
    }

    let lastError;
    let fallbackCount = 0;

    for (let i = 0; i < sources.length; i += 1) {
      const sourceName = sources[i];
      const entry = this.sources.get(sourceName);

      if (!entry || !entry.enabled) {
        continue;
      }

      try {
        await entry.instance.preCheck();

        const startTime = Date.now();
        const result = await executor(entry.instance);
        const responseTime = Date.now() - startTime;

        entry.instance.recordSuccess(responseTime);

        this.metrics.totalRequests += 1;
        if (i > 0) {
          this.metrics.totalFallbacks += 1;
          this.logger.warn(`📍 已转移到备用源 ${i}: ${sourceName}`);
        }

        return result;
      } catch (error) {
        entry.instance.recordFailure(error);
        lastError = error;

        if (i < sources.length - 1) {
          this.logger.warn(`⚠️  源 ${sourceName} 失败，尝试备用源... (${error.message})`);
        }

        if (i > 0) {
          fallbackCount = i;
        }
      }
    }

    this.metrics.totalFailures += 1;
    const failedSources = sources.join(", ");
    throw new Error(`所有源均失败 [${failedSources}]: ${lastError?.message ?? "未知错误"}`);
  }

  /**
   * 获取指标信息
   */
  getMetrics() {
    const sourceStatus = Array.from(this.sources.entries()).map(([name, entry]) => ({
      name,
      state: entry.instance.state,
      responseTime: entry.instance.responseTime,
    }));

    return {
      timestamp: Date.now(),
      totalRequests: this.metrics.totalRequests,
      totalFailures: this.metrics.totalFailures,
      totalFallbacks: this.metrics.totalFallbacks,
      failureRate: this.metrics.totalRequests > 0 
        ? ((this.metrics.totalFailures / this.metrics.totalRequests) * 100).toFixed(2) + "%"
        : "0%",
      sourceStatus,
    };
  }

  /**
   * 清理所有资源
   */
  async shutdown() {
    this.stopHealthCheckTimer();

    const promises = Array.from(this.sources.keys()).map((name) =>
      this.unregister(name).catch((error) => {
        this.logger.error(`注销源 ${name} 失败:`, error.message);
      })
    );

    await Promise.all(promises);
    this.logger.info("✓ 注册中心已关闭");
  }
}

export default DataSourceRegistry;
