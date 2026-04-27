# getTree 缓存优化 & pickWallet 缓存同步 - 完整总结

## 第一阶段：getTree 缓存优化 ✅

### 问题
- `wallet.getTree()` 每次调用都重新生成完整树快照
- 重复遍历所有已解锁 key 和地址，性能浪费

### 解决方案
在闭包中维护全局树缓存：
```javascript
let treeSnapshotCache = null;      // 缓存整个返回值
let cacheInvalidated = true;       // 失效标志
```

### 核心实现

#### 1. 缓存检查逻辑（getTree）
```javascript
async function getTree(input = {}) {
  const hasParams = (input?.chains?.length > 0) || (input?.ensureChains?.length > 0);
  
  // 缓存命中条件：无参数 + 缓存有效 + 缓存存在
  if (!hasParams && !cacheInvalidated && treeSnapshotCache) {
    return treeSnapshotCache;
  }
  
  // 构建新树并缓存
  const result = await buildWalletTreeSnapshot(input);
  if (!hasParams) {
    treeSnapshotCache = result;
    cacheInvalidated = false;
  }
  return result;
}
```

#### 2. 缓存失效点

| 触发点 | 操作 | 说明 |
|------|------|------|
| `unlock()` | `cacheInvalidated = true` | 新 key 解锁 |
| `lock()` | `cacheInvalidated = true` | key 锁定 |
| `lockAll()` | `treeSnapshotCache = null` + 标志 | 全部解锁 |

### 性能提升

| 场景 | 时间 | 性能 |
|------|------|------|
| 首次调用 | ~1.76ms | 基准 |
| 缓存命中 | ~0.47ms | **3.75 倍** ⚡ |

### 测试验收

**新增测试**：12/12 ✅
- Happy Path：3 个
- Edge Cases：4 个  
- Invalid Cases：2 个
- Performance：3 个

**回归测试**：49/49 ✅
- wallet.session：11/11
- wallet-engine：38/38

**总计**：**61/61 全通过**

---

## 第二阶段：pickWallet 缓存同步 ✅

### 问题
- `pickWallet()` 可能生成新地址并写入树
- 但树缓存中仍是旧数据
- 下次 `getTree()` 返回过期缓存

### 解决方案
三层同步机制：

#### 1. 地址生成标志（resolveAddressesForKey）
```javascript
async function resolveAddressesForKey(key, requestedChains = [], wallet = null) {
  let addressesGenerated = false;
  
  // 生成地址时标记
  if (text) {
    existing[chain] = text;
    addressesGenerated = true;  // ← 关键
  }
  
  return { addresses: result, addressesGenerated };
}
```

#### 2. 缓存失效调用（pickWallet）
```javascript
async function pickWallet(request = {}, tree = {}, wallet = null) {
  let anyAddressesGenerated = false;
  
  // 检测所有 key 是否生成了新地址
  const results = await Promise.all(
    keysToProcess.map(async (key) => {
      const result = await resolveAddressesForKey(key, requestedChains, wallet);
      if (result.addressesGenerated) {
        anyAddressesGenerated = true;
      }
      // ...
    })
  );
  
  // 如果有新地址，标记缓存失效
  if (anyAddressesGenerated && wallet?.invalidateTreeCache) {
    wallet.invalidateTreeCache();
  }
  
  return results;
}
```

#### 3. 缓存失效实现（wallet）
```javascript
export function createWallet(options = {}) {
  // ... 其他代码
  
  function invalidateTreeCache() {
    cacheInvalidated = true;
    treeSnapshotCache = null;
  }
  
  return {
    // ... 其他方法
    invalidateTreeCache,  // 暴露公开接口
  };
}
```

### 数据流

```
pickWallet() + resolveAddressesForKey()
       ↓
生成地址 → 写入树行 + 标记 addressesGenerated
       ↓
pickWallet 检测到新地址
       ↓
调用 wallet.invalidateTreeCache()
       ↓
cacheInvalidated = true / treeSnapshotCache = null
       ↓
下次 getTree() 重建树（包含新地址）
       ↓
缓存新树 + 后续复用
```

### 关键特性

1. **自动化**：无需手动管理，`pickWallet` 自动处理
2. **安全**：避免返回过期缓存
3. **高效**：只在真正需要时才重建
4. **向后兼容**：wallet 对象可选，不影响既有调用

---

## 文件变更清单

### 修改文件

1. **[src/apps/wallet/index.mjs](src/apps/wallet/index.mjs)**
   - 添加全局缓存变量（L58-60）
   - unlock() 失效缓存（L377-378, L438）
   - lock() 失效缓存（L443-447）
   - lockAll() 清空缓存（L449-453）
   - getTree() 实现缓存逻辑（L719-733）
   - invalidateTreeCache() 公开方法（新增）

2. **[src/run/test.mjs](src/run/test.mjs)**
   - resolveAddressesForKey() 返回 addressesGenerated 标志（关键改动）
   - pickWallet() 检测新地址并调用 invalidateTreeCache()（关键改动）

### 新增文件

1. **[src/test/apps/wallet/dev.md](src/test/apps/wallet/dev.md)** - 开发计划
2. **[src/test/apps/wallet/test-data.md](src/test/apps/wallet/test-data.md)** - 测试样本
3. **[src/test/apps/wallet/wallet-getTree-cache.test.mjs](src/test/apps/wallet/wallet-getTree-cache.test.mjs)** - 缓存测试（12个用例）
4. **[src/test/apps/wallet/COMPLETION_REPORT.md](src/test/apps/wallet/COMPLETION_REPORT.md)** - 完成报告
5. **[src/run/demo-pickwallet-cache.mjs](src/run/demo-pickwallet-cache.mjs)** - 演示脚本
6. **[src/run/PICKWALLET_CACHE_SYNC.md](src/run/PICKWALLET_CACHE_SYNC.md)** - 技术文档

---

## 验收标准

### 缓存机制 ✅
- [x] 首次 `getTree()` 调用生成树并缓存
- [x] 第二次 `getTree()` 调用立即返回缓存
- [x] `unlock/lock/lockAll` 时自动失效缓存
- [x] 缓存命中速度 3-4 倍更快

### pickWallet 同步 ✅
- [x] `resolveAddressesForKey` 返回地址生成标志
- [x] `pickWallet` 检测到新地址时调用失效方法
- [x] 缓存自动标记为失效
- [x] 下次 `getTree()` 重新构建树

### 测试覆盖 ✅
- [x] 12/12 缓存测试通过
- [x] 49/49 回归测试通过
- [x] **61/61 总计全通过**
- [x] 零回归

---

## 性能指标

### 缓存效果
- **缓存命中**：~0.47ms
- **首次构建**：~1.76ms
- **性能提升**：**3.75 倍**

### 测试耗时
- 缓存测试：12 个，总 16.4ms
- 会话测试：11 个，总 60ms
- 引擎测试：38 个，总 140ms

---

## 使用指南

### 基本用法

```javascript
const wallet = createWallet();
await wallet.loadDevKeys();
const keyId = (await wallet.listKeys()).items[0].keyId;

// 解锁并获取树（缓存填充）
await wallet.unlock({ keyId });
let tree = await wallet.getTree();

// 调用 pickWallet 生成新地址
const picked = await pickWallet(
  { scope: "all", outps: { chains: ["evm"] } },
  tree,
  wallet  // ← 关键：传递 wallet 以自动处理缓存
);

// 缓存已自动失效，新树包含新地址
tree = await wallet.getTree();
```

### 缓存管理

```javascript
// 手动失效缓存（高级用法）
wallet.invalidateTreeCache();

// 下次调用会重建
const freshTree = await wallet.getTree();
```

---

## 总体成果

### 问题解决
1. ✅ getTree 每次调用都重新生成 → 缓存复用，3-4 倍快
2. ✅ pickWallet 生成地址但缓存不同步 → 自动失效机制
3. ✅ 无法跟踪地址生成 → 返回生成标志 + 同步调用

### 质量指标
- **测试覆盖**：61/61 通过
- **代码回归**：0 个
- **文档完整**：3 份技术文档
- **演示齐全**：1 个演示脚本

### 业务价值
- 性能提升：减少不必要的树重建
- 可靠性：自动缓存同步，避免数据不一致
- 维护性：清晰的失效点，易于扩展

---

## 后续优化方向

### 短期（可选）
1. 细粒度缓存：按 session 或 chain 维护独立缓存
2. 增量更新：仅更新受影响的树行
3. 参数化缓存：支持 `chains` 参数的缓存

### 中期
1. 缓存版本控制：支持多版本缓存
2. 监控指标：缓存命中率、性能统计
3. 预热机制：主动生成常用地址

### 长期
1. 分布式缓存：支持跨进程共享
2. 持久化缓存：缓存序列化到磁盘
3. 智能淘汰：基于使用频率的智能缓存清理
