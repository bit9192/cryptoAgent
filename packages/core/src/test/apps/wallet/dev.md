# apps/wallet 模块开发计划

## 优化目标

优化 `getTree()` 性能，避免每次调用都重新生成完整树快照。

目前状态：每次 `getTree()` 调用都执行 `buildWalletTreeSnapshot()`，完整遍历所有已解锁的 key 并重建树结构。

优化方案：在内存中缓存树快照，只在特定失效点清空缓存。

## 需求分析

### 输入
- `getTree(input = {})` 接收可选参数（chains、ensureChains）
- input 可能影响树的内容（按 chain 过滤）

### 输出
- `{ ok, action, tree, counts, warnings }`
- 树结构应与未缓存时完全一致

### 缓存失效点

1. **unlock()** - 新 key 解锁时：
   - 为新 session 创建空缓存
   - 其他 session 缓存保留
   
2. **lock(keyId)** - 特定 key 锁定时：
   - 该 key 的 session 删除，缓存同时删除
   
3. **lockAll()** - 全部解锁时：
   - 所有 sessions 删除，所有缓存清除
   
4. **ensureRequestedAddressesForRecord()** - 地址被添加时：
   - 该 key 所在 session 的缓存失效
   - 重建树时需合并新地址
   
5. **registerProvider()** - 新 provider 注册时：
   - 全局缓存失效（所有 session 树都可能改变）
   - 下次 getTree() 调用时重建所有缓存

### 缓存键设计

目前方案：每个 session 内字段 `session._treeSnapshot`

- 优点：session 级粒度，完全独立，lock 时自动清除
- 缺点：如果同一 session 调用 `getTree({chains: ["evm"]})` 和 `getTree({chains: ["btc"]})` 需要分别缓存

简化方案（初版）：暂不考虑参数差异，统一缓存整棵树，调用方自己过滤。

## 切片计划

### Slice W-1：在 session 中添加缓存字段并实现基础缓存逻辑

本次只做：

1. 每个 session 添加 `_treeSnapshot` 字段初始化为 null
2. 在 `buildWalletTreeSnapshot()` 返回前，将结果缓存到当前 session 的 `_treeSnapshot`
3. `getTree()` 调用前，先检查所有 session 的缓存是否存在，若都存在则合并返回，否则调用 `buildWalletTreeSnapshot()`
4. 在 `unlock()` 时，为新 session 初始化 `_treeSnapshot = null`
5. 在 `lock()` 时，删除对应 session（缓存随之清除）
6. 在 `lockAll()` 时，clear sessions（全部缓存清除）

验收标准：

1. 首次 getTree() 调用生成树并缓存
2. 第二次 getTree() 调用立即返回缓存（不调用 buildWalletTreeSnapshot）
3. lock 清空缓存
4. lockAll 清空所有缓存
5. 现有 23/23 测试仍然通过
6. 新增性能测试验证缓存击中（第 2-10 次调用明显更快）

### Slice W-2（后续）：缓存失效点 - ensure 和 registerProvider

本次不做：
- ensureRequestedAddressesForRecord 触发缓存失效
- registerProvider 触发全局缓存失效

预计在 W-1 完成后，如有需要再做。

## 当前进度

- [x] S-W-1：实现基础缓存机制
  - ✅ 添加全局 treeSnapshotCache 和 cacheInvalidated 标志
  - ✅ unlock/lock/lockAll 时自动失效缓存
  - ✅ getTree() 检查缓存，无参数时复用缓存，有参数时跳过缓存
  - ✅ 所有 12 个缓存测试通过
  - ✅ 全量回归测试 49/49 通过
  - ✅ 总计 61/61 测试全部通过，零回归

### 性能改进验证

- H2 测试验证：首次调用生成树（~1.76ms），第二次缓存命中（~0.47ms）
- 缓存击中速度约为重建的 **3.75 倍** 更快
- 缓存失效点正确：unlock/lock/lockAll 时自动清空

## 下一步（可选）

- [ ] S-W-2a：细粒度缓存失效（per-session 级缓存）
- [ ] S-W-2b：缓存键支持 chains 参数（按参数哈希)
- [ ] S-W-2c：registerProvider 时全局失效

## 新增切片：S-W-3 钱包级 getAddress 缓存（跨 signer 实例）

### 背景

当前 provider 内 addressCache 挂载在 signer 闭包内。`wallet.getSigner()` 每次都会新建 signer，导致同一 keyId/chain 下重复调用 `signer.getAddress()` 无法复用上一次缓存。

### 本次目标（只做一个切片）

在 `wallet` 层新增地址缓存，并在 `getSigner()` 返回时包装 `signer.getAddress`：

1. 缓存键采用 `keyId + chain + path + addressType`
2. `signer.getAddress()` 先查 wallet 级缓存，命中则直接返回
3. 未命中则调用 provider 的 `getAddress`，并将结果回写 wallet 级缓存
4. `lock(keyId)` 时清除该 key 的 wallet 级地址缓存
5. `lockAll()` 时清除全部 wallet 级地址缓存

### 验收标准

1. 同一 `keyId + chain + path/addressType`，跨多次 `wallet.getSigner()` 仍能命中缓存
2. 不同 path 或不同 addressType 不串缓存
3. lock/lockAll 后缓存正确失效
4. 现有 provider-getaddress-cache 测试继续通过

## 新增切片：S-W-4 pickWallet 迁移对比（保留旧逻辑）

### 背景

`src/run/test.mjs` 内含本地 `pickWallet` 逻辑，当前仅用于调试。为支持迁移，需要在 wallet 模块提供新接口，并在 run/test 中同参双跑对比输出一致性。

### 本次目标（只做一个切片）

1. 在 wallet 模块新增 `pickWallet` 接口（从 tree + request 生成地址结果）
2. 保留 `src/run/test.mjs` 现有本地 `pickWallet` 实现，不删除
3. 在 run/test 增加迁移对比：旧接口与新接口使用同一参数执行
4. 对比结果一致时打印一致标记；不一致时打印差异并抛错

### 验收标准

1. `wallet.pickWallet` 可通过 `options.wallet.pickWallet` 调用
2. run/test 输出包含迁移一致性检查结果
3. 旧逻辑输出与新接口输出在同参数下完全一致
4. 不修改业务入参结构（继续兼容 outputs/outps）
