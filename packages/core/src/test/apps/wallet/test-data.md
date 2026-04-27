# wallet 模块测试样本

## 测试场景：getTree 缓存优化

### Happy Path - 缓存命中

#### H1：首次调用 getTree 生成树
- 操作：unlock key，然后调用 getTree()
- 期望：返回有效树，session._treeSnapshot 被填充
- 验证：`tree.ok === true && tree.tree.keys.length > 0`

#### H2：第二次调用 getTree 返回缓存
- 操作：同一 session，调用 getTree() 第二次
- 期望：返回同一树对象（缓存命中），执行时间明显更短
- 验证：`result1 === result2 || JSON.stringify(result1) === JSON.stringify(result2)`

#### H3：多个 session 独立缓存
- 操作：unlock key1，unlock key2，都调用 getTree()
- 期望：每个 session 都有独立缓存
- 验证：两个 session._treeSnapshot 分别存在且不同

### Edge Cases - 缓存失效

#### E1：unlock 后缓存失效
- 操作：unlock key1 → getTree()（缓存），然后 unlock key2 → getTree()
- 期望：key1 的缓存保留，key2 生成新树
- 验证：`key1_session._treeSnapshot` 继续有效，`key2_session._treeSnapshot` 新生成

#### E2：lock 清空缓存
- 操作：unlock key → getTree()（缓存），然后 lock(key) → getTree() 应报错
- 期望：lock 后 session 删除，缓存同时清除
- 验证：lock 后 getTree() 抛错"key 未解锁"

#### E3：lockAll 清空所有缓存
- 操作：unlock k1, k2 → getTree()（两个缓存），然后 lockAll()
- 期望：所有缓存清除，所有 sessions 删除
- 验证：`sessions.size === 0`

#### E4：指定 chains 参数时缓存可复用
- 操作：getTree() → getTree({chains: ["evm"]})
- 期望：两次可能复用缓存或根据参数调整，不重建整棵树
- 验证：缓存策略明确（同参数复用，不同参数重建）

### Invalid Cases - 缓存异常

#### I1：缓存中途被手动修改应仍有效
- 操作：getTree() 获得缓存，再调用一次
- 期望：缓存内容一致（验证缓存的不可变性）
- 验证：`JSON.stringify(cache1) === JSON.stringify(cache2)`

#### I2：ensureRequestedAddressesForRecord 后缓存失效
- 操作：getTree() → 调用 deriveConfiguredAddresses() 或内部 ensure → getTree()
- 期望：地址改变后缓存自动失效
- 验证：第二次 getTree() 结果包含新地址

### Performance - 缓存效果

#### P1：缓存击中性能对比
- 操作：unlock key，调用 getTree() 10 次，测量执行时间
- 期望：第 1 次 ~50-200ms，第 2-10 次 ~1-5ms（缓存命中）
- 验证：缓存命中速度至少快 10 倍

