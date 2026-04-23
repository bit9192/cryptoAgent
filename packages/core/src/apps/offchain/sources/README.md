# 链下数据源统一管理架构

## 概述

统一管理链下数据接口（CoinGecko、ChainList、Llama、Etherscan 等），支持：
- ✅ 多源容错（故障自动转移）
- ✅ 智能缓存（按能力配置 TTL）
- ✅ 健康检查（定时监控）
- ✅ 性能监控（指标收集）
- ✅ 优先级路由（可配置源顺序）

## 架构

```
应用层
  ↓
OffchainDataSourceManager (统一入口)
  ├─ 缓存管理
  ├─ 容错转移
  └─ 性能监控
  ↓
DataSourceRegistry (注册中心)
  ├─ 源注册/注销
  ├─ 健康检查
  ├─ 故障转移
  └─ 优先级路由
  ↓
数据源实例群
  ├─ CoinGeckoSource
  ├─ ChainListSource
  ├─ LlamaSource (可选)
  └─ EtherscanSource (可选)
```

## 快速开始

### 1. 创建数据源

```javascript
// 继承基类实现数据源
import { DataSourceBase } from "./base.mjs";

export class MySource extends DataSourceBase {
  metadata = {
    name: "mysource",
    version: "1.0.0",
    description: "My custom data source",
    capabilities: ["getPrice", "getTokenInfo"],
    cacheTTL: 60000,
  };

  async init(config) {
    // 初始化逻辑
  }

  async healthCheck() {
    // 健康检查逻辑
  }

  async getPrice(tokens) {
    // 实现价格获取
  }

  async getTokenInfo(token) {
    // 实现 Token 信息获取
  }
}
```

### 2. 初始化管理器

```javascript
import { OffchainDataSourceManager } from "./sources/index.mjs";
import { CoinGeckoSource } from "./sources/coingecko/index.mjs";
import { ChainListSource } from "./sources/chainlist/index.mjs";

// 创建源实例
const coingecko = new CoinGeckoSource();
const chainlist = new ChainListSource();

// 初始化管理器
const manager = new OffchainDataSourceManager({
  logger: console,
  healthCheckInterval: 60000, // 1 分钟检查一次
});

await manager.init([coingecko, chainlist]);
```

### 3. 执行查询

```javascript
// 获取价格（自动容错、缓存）
const prices = await manager.getPrice(["bitcoin", "ethereum"]);
// {
//   bitcoin: { usd: 42500, usd_24h_change: 2.5 },
//   ethereum: { usd: 2200, usd_24h_change: 1.8 }
// }

// 获取 Token 信息
const tokenInfo = await manager.getTokenInfo("bitcoin");
// {
//   id: "bitcoin",
//   symbol: "BTC",
//   name: "Bitcoin",
//   marketCap: 850000000000,
//   ...
// }

// 获取链信息
const chainInfo = await manager.getChainInfo(1);
// {
//   chainId: 1,
//   name: "Ethereum",
//   nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
//   rpc: ["https://eth-rpc1.example.com", ...],
//   ...
// }
```

### 4. 监控和维护

```javascript
// 获取健康状态
const health = await manager.getHealthStatus();
// {
//   timestamp: 1234567890,
//   totalSources: 2,
//   healthySources: 2,
//   results: {
//     coingecko: { ok: true, responseTime: 234 },
//     chainlist: { ok: true, responseTime: 156 }
//   }
// }

// 获取性能指标
const metrics = manager.getMetrics();
// {
//   totalRequests: 1024,
//   totalFailures: 2,
//   totalFallbacks: 1,
//   failureRate: "0.20%",
//   sourceStatus: [...]
// }

// 查看所有源
const sources = manager.listSources();

// 关闭管理器
await manager.shutdown();
```

## 配置

### 数据源配置 (config.mjs)

```javascript
export const dataSourceConfigs = {
  coingecko: {
    enabled: true,
    priority: 1,           // 优先级
    apiKey: process.env.COINGECKO_API_KEY,
    timeout: 5000,
    cacheTTL: 60000,       // 缓存时间
    retryAttempts: 3,      // 重试次数
  },
  // ...
};
```

### 故障转移规则 (config.mjs)

```javascript
export const fallbackRules = {
  getPrice: ["coingecko", "llama", "oneInch"],    // 能力 -> 源列表
  getChainInfo: ["chainlist", "llama"],
  getTokenInfo: ["coingecko", "etherscan"],
  // ...
};
```

### 缓存策略 (config.mjs)

```javascript
export const cachePolicies = {
  getPrice: 60000,        // 价格 1 分钟
  getChainInfo: 600000,   // 链信息 10 分钟
  getTokenInfo: 600000,   // Token 信息 10 分钟
  // ...
};
```

## 工作流程

### 容错查询流程

```
用户查询 "getPrice(tokens)"
  ↓
1. 检查缓存 → 有效则返回
  ↓
2. 查找支持该能力的源（排序优先级）
  ↓
3. 依次尝试源（按优先级）
   ├─ 源 1: 执行 → 成功? 返回 + 缓存
   ├─ 源 1: 执行 → 超时? 尝试源 2
   ├─ 源 2: 执行 → 失败? 尝试源 3
   ├─ 源 3: 执行 → 成功! 返回 + 缓存 + 记录转移
   └─ 所有源都失败? 返回错误
  ↓
4. 后台：更新源状态，记录指标
```

### 状态转移

```
初始化
  ↓
┌─────────────────┐
│    UNKNOWN      │ (待检查)
└────────┬────────┘
         │ healthCheck()
         ↓
┌─────────────────┐      responseTooSlow
│    HEALTHY      │◄──────┐
└────────┬────────┘       │
         │               │
         │ recordSuccess  │
         │ (快速) ────────┘
         │
         │ recordFailure
         ↓
┌─────────────────┐
│    DEGRADED     │ (响应慢)
└────────┬────────┘
         │ 3次连续失败
         ↓
┌─────────────────┐
│   UNHEALTHY     │ (标记故障，停用)
└─────────────────┘
         │ (30分钟后重新启用)
         ↓ reset()
      UNKNOWN
```

## 最佳实践

### 1. 数据源实现

```javascript
class MySource extends DataSourceBase {
  // ✅ DO: 实现所有必要方法
  async init(config) { /* ... */ }
  async healthCheck() { /* 轻量级检查 */ }
  
  // ✅ DO: 使用 preCheck() 和 recordSuccess/Failure()
  async getPrice(tokens) {
    await this.preCheck();
    const startTime = Date.now();
    try {
      const result = await this.fetchData(tokens);
      this.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  // ❌ DON'T: 长期阻塞操作
  // async init() { while(true) { } } 

  // ❌ DON'T: 跳过错误处理
  // async getPrice() { return fetch(url); }
}
```

### 2. 缓存策略

```javascript
// ✅ DO: 根据数据特性设置合理的 TTL
const cachePolicies = {
  getPrice: 60000,           // 实时数据：1 分钟
  getChainInfo: 600000,      // 静态数据：10 分钟
  getSwapQuote: 10000,       // 超实时：10 秒
};

// ❌ DON'T: 所有数据都用同一个 TTL
const cachePolicies = {
  "*": 300000,  // 不推荐
};
```

### 3. 源的优先级

```javascript
// ✅ DO: 根据 SLA 和稳定性设置优先级
export const dataSourceConfigs = {
  fastAndStable: { priority: 1 },   // 首选
  reliable: { priority: 2 },         // 备选
  budget: { priority: 3 },           // 低优先级
};

// ❌ DON'T: 所有源优先级相同
export const dataSourceConfigs = {
  source1: { priority: 5 },
  source2: { priority: 5 },  // 路由不明确
};
```

### 4. 错误处理

```javascript
// ✅ DO: 捕获并处理查询异常
try {
  const price = await manager.getPrice("bitcoin");
} catch (error) {
  // 所有源都失败了
  console.error("无法获取价格:", error.message);
  // 使用备用数据或返回错误
}

// ❌ DON'T: 忽略失败
const price = await manager.getPrice("bitcoin"); // 可能失败

// ✅ DO: 支持禁用缓存的强制刷新
const freshPrice = await manager.getPrice("bitcoin", {
  useCache: false,
});
```

### 5. 监控

```javascript
// ✅ DO: 定期检查性能指标
setInterval(() => {
  const metrics = manager.getMetrics();
  console.log("失败率:", metrics.failureRate);
  if (metrics.failureRate > "5%") {
    sendAlert("Offchain API 故障率过高");
  }
}, 60000);

// ✅ DO: 监听健康状态
setInterval(async () => {
  const health = await manager.getHealthStatus();
  const unhealthy = Object.values(health.results)
    .filter(r => !r.ok);
  if (unhealthy.length > 0) {
    console.warn("⚠️ 故障源:", unhealthy);
  }
}, 300000);
```

## 环境变量

```bash
# CoinGecko (可选，限制速率为 10-50/min)
COINGECKO_API_KEY=xxx

# Etherscan
ETHERSCAN_API_KEY=xxx

# 1Inch
ONE_INCH_API_KEY=xxx
```

## 添加新数据源

### 步骤

1. 在 `sources/yourapi/` 创建新目录
2. 继承 `DataSourceBase`：

```javascript
// sources/yourapi/index.mjs
import { DataSourceBase } from "../base.mjs";

export class YourApiSource extends DataSourceBase {
  metadata = {
    name: "yourapi",
    capabilities: ["getPrice", "getTokenInfo"],
    // ...
  };

  async init(config) { /* ... */ }
  async healthCheck() { /* ... */ }
  async getPrice(tokens) { /* ... */ }
  async getTokenInfo(token) { /* ... */ }
}
```

3. 添加到 `config.mjs` 的 `dataSourceConfigs` 和 `fallbackRules`

4. 在 `index.mjs` 导入注册

## 故障排查

### 源无法连接

```javascript
// 检查源的状态
const sources = manager.listSources();
sources.forEach(s => {
  console.log(`${s.name}: ${s.status.state}`);
});
```

### 缓存问题

```javascript
// 清除特定缓存
manager.clearCache("price:bitcoin");

// 清除所有缓存
manager.clearCache();

// 强制刷新（跳过缓存）
const fresh = await manager.getPrice("bitcoin", {
  useCache: false,
});
```

### 调试慢查询

```javascript
// 查看每个源的响应时间
const metrics = manager.getMetrics();
metrics.sourceStatus.forEach(s => {
  console.log(`${s.name}: ${s.responseTime}ms`);
});
```

## 参考

- [CoinGecko API](https://www.coingecko.com/api)
- [ChainList](https://chainid.network/)
- [Llama](https://llama.fi/)
- [Etherscan](https://etherscan.io/apis)
