# 🚀 链下数据源 - 快速参考卡片

## 一行初始化

```javascript
const manager = new OffchainDataSourceManager();
await manager.init([new CoinGeckoSource(), new ChainListSource()]);
```

## 常用方法

| 方法 | 作用 | 示例 |
|------|------|------|
| `getPrice(tokens)` | 获取加密货币价格 | `manager.getPrice(["bitcoin"])` |
| `getTokenInfo(token)` | 获取 Token 详细信息 | `manager.getTokenInfo("ethereum")` |
| `getChainInfo(chainId)` | 获取链元数据 | `manager.getChainInfo(1)` |
| `getHealthStatus()` | 获取源健康状态 | `await manager.getHealthStatus()` |
| `getMetrics()` | 获取性能指标 | `manager.getMetrics()` |
| `clearCache(key)` | 清除缓存 | `manager.clearCache("price:bitcoin")` |

## 处理错误

```javascript
try {
  const price = await manager.getPrice("bitcoin");
} catch (error) {
  // 所有源都失败了
  console.error("无法获取价格:", error.message);
  // 使用备用数据或返回错误给用户
}
```

## 强制刷新（跳过缓存）

```javascript
const freshPrice = await manager.getPrice("bitcoin", {
  useCache: false,
});
```

## Registry 高级用法

```javascript
// 明确指定源和顺序
const result = await registry.query(
  "getPrice",
  async (source) => source.getPrice(["bitcoin"]),
  { sources: ["coingecko", "llama"] }  // 首先尝试 coingecko，失败则尝试 llama
);
```

## 配置数据源

编辑 `config.mjs`：

```javascript
export const dataSourceConfigs = {
  yourapi: {
    enabled: true,
    priority: 1,              // 数字越小优先级越高
    apiKey: process.env.YOUR_API_KEY,
    timeout: 5000,
    cacheTTL: 60000,          // 缓存时间（毫秒）
  },
};

export const fallbackRules = {
  getPrice: ["yourapi", "coingecko", "llama"],  // 故障转移链
};

export const cachePolicies = {
  getPrice: 60000,            // 价格缓存 1 分钟
};
```

## 添加新数据源

1. 创建 `sources/myapi/index.mjs`：

```javascript
import { DataSourceBase } from "../base.mjs";

export class MyApiSource extends DataSourceBase {
  metadata = {
    name: "myapi",
    capabilities: ["getPrice", "getTokenInfo"],
  };

  async init(config) {
    // 初始化逻辑
  }

  async healthCheck() {
    // 验证 API 连接
  }

  async getPrice(tokens) {
    await this.preCheck();
    try {
      const data = await fetch(...);
      this.recordSuccess();
      return data;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  async getTokenInfo(token) {
    // 实现...
  }
}
```

2. 在 `config.mjs` 中注册
3. 在 `index.mjs` 中导入

## 监控和告警

```javascript
// 定时检查故障率
setInterval(async () => {
  const metrics = manager.getMetrics();
  const failureRate = parseFloat(metrics.failureRate);
  
  if (failureRate > 5) {
    /* 发送告警 */
    console.warn("⚠️ 高故障率:", metrics.failureRate);
  }
  
  // 检查健康状态
  const health = await manager.getHealthStatus();
  console.log(`✓ ${health.healthySources} / ${health.totalSources} 源正常`);
}, 60000);
```

## 状态机

```
UNKNOWN ─→ HEALTHY ----→ DEGRADED ─→ UNHEALTHY
  ↑                         ↑
  └─────────────────────────┘
     (3 次连续成功恢复)
```

- **HEALTHY** ✅ 正常运行（响应快速）
- **DEGRADED** ⚠️ 响应缓慢（仍可用）
- **UNHEALTHY** ✗ 标记故障（不使用）
- **UNKNOWN** ❓ 待检查

## 环境变量

```bash
# .env 文件
COINGECKO_API_KEY=your_key_here
ETHERSCAN_API_KEY=your_key_here
LLAMA_API_KEY=your_key_here
```

## 性能指标

```javascript
const metrics = manager.getMetrics();
// {
//   totalRequests: 1024,
//   totalFailures: 2,
//   totalFallbacks: 1,
//   failureRate: "0.20%",
//   sourceStatus: [
//     { name: "coingecko", requests: 900, failures: 0 },
//     { name: "chainlist", requests: 124, failures: 2 },
//   ]
// }
```

## 文件位置

```
packages/core/src/apps/offchain/sources/
├── README.md                      ← 完整文档
├── base.mjs                       ← 基类
├── registry.mjs                   ← 注册中心
├── config.mjs                     ← 配置
├── index.mjs                      ← 管理器
├── registry.test.mjs              ← 测试
├── coingecko/index.mjs            ← CoinGecko
└── chainlist/index.mjs            ← ChainList
```

## 常见问题

**Q: 缓存时间太长导致数据过期？**
A: 在 `config.mjs` 的 `cachePolicies` 中减小 TTL 值。

**Q: 某个源经常失败？**
A: 调低其 `priority` 值（数字更大），让其他源优先。

**Q: 如何禁用缓存？**
A: 在查询时传递 `{ useCache: false }`。

**Q: 如何知道发生了故障转移？**
A: 检查日志或使用 `getMetrics()` 查看 `totalFallbacks` 计数。

**Q: 支持自定义数据源吗？**
A: 是的！继承 `DataSourceBase` 并注册即可。

## 快速命令

```bash
# 运行集成示例
node packages/core/src/apps/offchain/sources/integration-examples.mjs

# 运行测试
node --test packages/core/src/apps/offchain/sources/registry.test.mjs

# 检查语法
node --check packages/core/src/apps/offchain/sources/index.mjs
```

## 故障排查

### 所有源都失败
```javascript
try {
  const result = await manager.getPrice("bitcoin");
} catch (error) {
  // error 包含所有失败源的信息
  console.error(error.message); 
}
```

### 缓存未更新
```javascript
// 检查缓存
console.log(manager.getCache("price:bitcoin"));

// 清除缓存
manager.clearCache("price:bitcoin");

// 或清除所有缓存
manager.clearCache();
```

### 源状态异常
```javascript
const health = await manager.getHealthStatus();
console.log(health);  // 查看每个源的状态和响应时间
```

## 关键优势

✅ **自动转移** - 某个 API 宕机自动切换
✅ **智能缓存** - 减少API 调用，提升性能
✅ **完全监控** - 实时掌握系统健康度
✅ **零配置** - 开箱即用
✅ **易于扩展** - 添加新源只需继承一个类

---

📖 详细文档请见 [README.md](README.md)
