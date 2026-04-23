# 链下数据源架构设计

## 设计理念

采用 **"分散实现 + 统一管理"** 模式：
- 每个数据源独立实现（解耦）
- 统一配置中心管理（易维护）
- 支持动态注册、健康检查、故障转移

## 架构图

```
┌─────────────────────────────────────────────────────┐
│          offchain/                                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ sources/                                      │   │
│  │ ├── coingecko/        (独立实现)              │   │
│  │ │   ├── index.mjs                            │   │
│  │ │   ├── api.mjs                              │   │
│  │ │   └── cache.mjs                            │   │
│  │ ├── llama/            (独立实现)              │   │
│  │ │   ├── index.mjs                            │   │
│  │ │   └── api.mjs                              │   │
│  │ ├── chainlist/        (独立实现)              │   │
│  │ │   ├── index.mjs                            │   │
│  │ │   └── api.mjs                              │   │
│  │ └── etherscan/        (独立实现)              │   │
│  │     ├── index.mjs                            │   │
│  │     └── api.mjs                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ registry.mjs          (统一注册中心)          │   │
│  │ - register()                                 │   │
│  │ - getSource()                                │   │
│  │ - listSources()                              │   │
│  │ - healthCheck()                              │   │
│  │ - findFallback()                             │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ config.mjs            (全局配置)              │   │
│  │ - dataSourceConfigs                          │   │
│  │ - cachePolicies                              │   │
│  │ - retryStrategies                            │   │
│  │ - fallbackRules                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ index.mjs             (统一入口)              │   │
│  │ - createDataSourceRegistry()                 │   │
│  │ - getPrice()                                 │   │
│  │ - getChainInfo()                             │   │
│  │ - getTokenInfo()                             │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## 核心特性

### 1. 独立实现（Source）

每个数据源自包含：
```javascript
// sources/coingecko/index.mjs
export class CoinGeckoSource {
  metadata = {
    name: "coingecko",
    version: "1.0.0",
    capabilities: ["getPrice", "getTokenInfo", "getMarketData"],
    rateLimit: { requests: 10, period: 60000 }, // 10/min
    cacheTTL: 60000, // 1 min
  };

  async init(config) { /* 初始化 */ }
  async healthCheck() { /* 健康检查 */ }
  async getPrice(tokens) { /* 实现 */ }
  async getTokenInfo(token) { /* 实现 */ }
  async shutdown() { /* 清理资源 */ }
}
```

### 2. 统一注册中心（Registry）

管理所有数据源的生命周期：
```javascript
// registry.mjs
class DataSourceRegistry {
  async register(source, config) { /* 注册 */ }
  async getSource(name) { /* 获取活跃源 */ }
  async healthCheck() { /* 全量检查 */ }
  async findFallback(capability, exclude) { /* 查询备用 */ }
  async query(capability, ...args) { /* 自动选源+重试 */ }
}
```

### 3. 全局配置（Config）

```javascript
// config.mjs
export const dataSourceConfigs = {
  coingecko: {
    enabled: true,
    priority: 1,        // 优先级 1-10，数字越小优先级越高
    apiKey: process.env.COINGECKO_API_KEY,
    timeout: 5000,
    cache: true,
    cacheTTL: 60000,
    retryAttempts: 3,
  },
  llama: {
    enabled: true,
    priority: 2,
    baseUrl: "https://api.llama.fi",
    timeout: 5000,
    cache: true,
    fallback: true,     // 作为备用源
  },
  chainlist: {
    enabled: true,
    priority: 3,
    timeout: 3000,
  },
};

export const fallbackRules = {
  getPrice: ["coingecko", "llama", "chainlist"],     // 优先级顺序
  getChainInfo: ["chainlist", "llama"],
  getTokenInfo: ["coingecko", "etherscan"],
};

export const cachePolicies = {
  getPrice: 60000,      // 价格信息缓存 1 分钟
  getChainInfo: 300000, // 链信息缓存 5 分钟
  getTokenInfo: 600000, // token 信息缓存 10 分钟
};
```

## 调用流程

### 普通调用（单一源）
```
应用 → Registry.getSource("coingecko") 
    → CoinGecko.getPrice(tokens) 
    → Cache Hit → 返回结果
```

### 容错调用（多源备用）
```
应用 → Registry.query("getPrice", tokens)
    ├─ 尝试 coingecko (优先级 1)
    │  ├─ 若失败/超时 → 重试
    │  └─ 若重试失败 → 转下一源
    │
    ├─ 尝试 llama (优先级 2, fallback)
    │  └─ 若成功 → 返回，同时缓存结果
    │
    └─ 若所有源都失败 → 返回错误，提示所有源故障
```

### 健康检查流程
```
定时任务 → Registry.healthCheck()
    ├─ 并发 ping 所有已注册源
    ├─ 更新每个源的状态（健康/故障/降级）
    ├─ 调整优先级或标记为不可用
    └─ 记录日志、发送告警
```

## 状态机

每个数据源有三个状态：

```
         ┌────────────┐
         │  HEALTHY   │
         └────────────┘
               ▲    ▼
    init()     │    │ healthCheck() fail
               │    │ or timeout
         ┌────────────┐
         │  DEGRADED  │ (可用但响应慢)
         └────────────┘
               ▲    ▼
               │    │ consecutive failures
         ┌────────────┐
         │  UNHEALTHY │ (标记故障，停止调用)
         └────────────┘
```

## 优势

✅ **解耦** - 每个源独立，不相互依赖
✅ **容错** - 支持自动故障转移和备用源
✅ **易扩展** - 新增源只需实现 Source 接口并注册
✅ **易维护** - 配置集中，统一管理 TTL、超时、重试
✅ **可观测** - 健康检查、性能监控、故障告警
✅ **高效** - 多层缓存、智能选源、竞速选优

## 适用场景

- ✓ 多个外部 API 数据源
- ✓ 需要故障转移和备用源
- ✓ 对数据可用性要求高
- ✓ 需要统一配置管理
- ✓ 需要性能监控和告警
