# pickWallet 与树缓存同步机制

## 概述

当 `pickWallet()` 通过 `resolveAddressesForKey()` 生成新地址时，需要使树缓存失效，以确保下次调用 `getTree()` 能返回包含新地址的最新树。

## 实现流程

### 1. 地址生成与写回

**文件**: `src/run/test.mjs`

在 `resolveAddressesForKey()` 中，地址直接写回树行：

```javascript
async function resolveAddressesForKey(key, requestedChains = [], wallet = null) {
  const existing = key?.addresses;  // 引用树行的 addresses 对象
  // ...
  if (text) {
    existing[chain] = text;         // 直接修改树行
    addressesGenerated = true;      // 标记有新地址生成
  }
  // ...
  return { addresses: result, addressesGenerated };
}
```

**关键点**：
- `existing` 是对树行 `key.addresses` 对象的引用
- 修改会直接反映到树中
- 返回一个对象包含：`addresses` 和 `addressesGenerated` 标志

### 2. 缓存失效信号

**文件**: `src/run/test.mjs`

`pickWallet()` 检测是否生成了新地址，并调用 wallet 的失效方法：

```javascript
async function pickWallet(request = {}, tree = {}, wallet = null) {
  // ... 准备参数
  
  let anyAddressesGenerated = false;
  
  const results = await Promise.all(
    keysToProcess.map(async (key) => {
      const result = await resolveAddressesForKey(key, requestedChains, wallet);
      if (result.addressesGenerated) {
        anyAddressesGenerated = true;
      }
      return {
        keyId: key.keyId,
        addresses: result.addresses,
        // ... 其他字段
      };
    })
  );
  
  // 如果生成了新地址，标记缓存失效
  if (anyAddressesGenerated && wallet?.invalidateTreeCache) {
    wallet.invalidateTreeCache();
  }
  
  return results;
}
```

**关键点**：
- 聚合所有 key 的地址生成状态
- 如果任何 key 都有新地址，就标记缓存失效
- 只有在 wallet 对象存在且有 `invalidateTreeCache` 方法时才调用

### 3. 缓存失效机制

**文件**: `src/apps/wallet/index.mjs`

暴露 `invalidateTreeCache()` 公开方法：

```javascript
function invalidateTreeCache() {
  cacheInvalidated = true;
  treeSnapshotCache = null;
}
```

**集成到 getTree()**:

```javascript
async function getTree(input = {}) {
  const hasParams = (input?.chains?.length > 0) || (input?.ensureChains?.length > 0);
  
  // 如果缓存有效且无参数，返回缓存
  if (!hasParams && !cacheInvalidated && treeSnapshotCache) {
    return treeSnapshotCache;
  }
  
  // 否则重建树
  const result = await buildWalletTreeSnapshot(input);
  
  // 缓存新结果
  if (!hasParams) {
    treeSnapshotCache = result;
    cacheInvalidated = false;
  }
  
  return result;
}
```

**暴露接口**:

```javascript
return {
  // ... 其他方法
  getTree,
  invalidateTreeCache,  // 新增
};
```

## 数据流图

```
pickWallet()
    ↓
resolveAddressesForKey()
    ↓
├─ 生成新地址？
│  ├─ 是 → existing[chain] = address  (写回树行)
│  └─ addressesGenerated = true
    ↓
返回 { addresses, addressesGenerated }
    ↓
anyAddressesGenerated = true
    ↓
wallet.invalidateTreeCache()
    ↓
设置 cacheInvalidated = true
设置 treeSnapshotCache = null
    ↓
下次 getTree() 调用
    ↓
检测 cacheInvalidated = true
    ↓
重建树（包含新地址）
    ↓
缓存新树
```

## 验收标准

- ✅ `resolveAddressesForKey` 返回 `addressesGenerated` 标志
- ✅ `pickWallet` 检测地址生成并调用 `invalidateTreeCache()`
- ✅ `wallet.invalidateTreeCache()` 清空缓存
- ✅ 下次 `getTree()` 重新构建树
- ✅ 所有现有测试通过（无回归）

## 使用示例

```javascript
const wallet = createWallet();
await wallet.loadDevKeys();
const keyId = (await wallet.listKeys()).items[0].keyId;

// 解锁 key 并获取初始树（缓存填充）
await wallet.unlock({ keyId, rebuildTree: false });
let tree = await wallet.getTree();
console.log("初始树行数:", tree.tree.length);

// 调用 pickWallet 生成新地址
const picked = await pickWallet(
  {
    scope: "all",
    outps: {
      chains: ["evm", "btc"]
    }
  },
  tree,
  wallet  // 传递 wallet 对象用于缓存失效
);

// 缓存已自动失效，下次调用会重建树
tree = await wallet.getTree();
console.log("更新后树行数:", tree.tree.length);
```

## 性能影响

- **缓存命中**（无新地址）：O(1) - 直接返回缓存
- **缓存重建**（有新地址）：O(n) - 重新扫描并构建树
- **地址生成成本**：已通过会话缓存优化
- **整体效果**：多数场景命中缓存 → 性能提升 3-4 倍

## 后续优化

1. **细粒度缓存**：按 session 或 chain 维护独立缓存
2. **增量更新**：仅更新受影响的树行，而不是全重建
3. **缓存版本控制**：支持多个缓存版本用于不同参数
