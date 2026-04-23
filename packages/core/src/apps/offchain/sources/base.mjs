/**
 * 数据源基类 - 所有外部数据源都应继承此类
 */
export class DataSourceBase {
  /**
   * 数据源元数据 (子类应覆盖)
   */
  metadata = {
    name: "base",
    version: "1.0.0",
    description: "Base data source",
    capabilities: [], // 支持的操作: ["getPrice", "getTokenInfo", ...]
    rateLimit: { requests: 10, period: 60000 }, // 10 请求/分钟
    cacheTTL: 60000, // 默认缓存 1 分钟
  };

  /**
   * 状态枚举
   */
  static State = {
    HEALTHY: "healthy",      // 正常
    DEGRADED: "degraded",    // 降级（响应慢）
    UNHEALTHY: "unhealthy",  // 故障
    UNKNOWN: "unknown",      // 未知
  };

  constructor(options = {}) {
    this.name = this.metadata.name;
    this.state = DataSourceBase.State.UNKNOWN;
    this.lastCheck = null;
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.responseTime = 0;
    this.config = options;
  }

  /**
   * 初始化数据源
   */
  async init() {
    throw new Error(`${this.name}: init() 必须实现`);
  }

  /**
   * 健康检查 (子类应实现)
   */
  async healthCheck() {
    throw new Error(`${this.name}: healthCheck() 必须实现`);
  }

  /**
   * 检查能力是否支持
   */
  supports(capability) {
    return this.metadata.capabilities.includes(capability);
  }

  /**
   * 调用前钩子 - 检查状态
   */
  async preCheck() {
    if (this.state === DataSourceBase.State.UNHEALTHY) {
      throw new Error(`${this.name} 已标记为故障`);
    }

    if (this.responseTime > (this.config.timeout ?? 5000)) {
      // 响应时间过长，标记为降级
      this.state = DataSourceBase.State.DEGRADED;
    }

    return true;
  }

  /**
   * 调用后钩子 - 更新状态
   */
  recordSuccess(responseTime = 0) {
    this.responseTime = responseTime;
    this.consecutiveFailures = 0;
    
    if (responseTime > (this.config.timeout ?? 5000) * 0.8) {
      this.state = DataSourceBase.State.DEGRADED;
    } else {
      this.state = DataSourceBase.State.HEALTHY;
    }
    
    this.lastCheck = Date.now();
  }

  /**
   * 记录失败
   */
  recordFailure(error) {
    this.consecutiveFailures += 1;
    this.lastError = error;
    this.lastCheck = Date.now();

    // 连续失败 3 次以上，标记为故障
    if (this.consecutiveFailures >= 3) {
      this.state = DataSourceBase.State.UNHEALTHY;
    }
  }

  /**
   * 重置状态（恢复）
   */
  reset() {
    this.state = DataSourceBase.State.UNKNOWN;
    this.consecutiveFailures = 0;
    this.lastError = null;
  }

  /**
   * 清理资源
   */
  async shutdown() {
    // 默认空实现，子类可覆盖
  }

  /**
   * 获取状态信息
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      lastCheck: this.lastCheck,
      responseTime: this.responseTime,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError?.message ?? null,
    };
  }
}

export default DataSourceBase;
