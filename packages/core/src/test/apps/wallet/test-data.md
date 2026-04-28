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

---

## 测试场景：wallet 级 signer.getAddress 缓存（S-W-3）

### Happy Path

#### H1：跨 getSigner 实例命中缓存
- 操作：同一 keyId/chain/path 调用两次 `wallet.getSigner().signer.getAddress()`
- 期望：第二次命中 wallet 级缓存，不触发 provider 实际计算
- 验证：provider getAddress 调用计数保持不变

#### H2：同 keyId 同 chain 不同 path 不命中
- 操作：path0、path1 分别调用 getAddress
- 期望：两次都走 provider 计算
- 验证：调用计数 +2

#### H3：BTC 同 path 不同 addressType 不命中
- 操作：同一路径分别请求 p2wpkh、p2tr
- 期望：按 addressType 分桶缓存
- 验证：调用计数 +2

### Edge Cases

#### E1：lock(keyId) 后缓存失效
- 操作：命中缓存后 lock，再 unlock，再同参数 getAddress
- 期望：重新计算一次
- 验证：provider 调用计数增加

#### E2：lockAll() 后缓存失效
- 操作：命中缓存后 lockAll，再 unlock，再同参数 getAddress
- 期望：重新计算一次
- 验证：provider 调用计数增加

### Invalid Cases

#### I1：provider 返回非字符串地址对象时仍可回写缓存
- 操作：provider 返回 `{ address, addresses }`
- 期望：wallet 缓存可从对象结构提取并回写
- 验证：同参数二次调用命中缓存

---

## 测试场景：S-W-4 pickWallet 迁移一致性（旧接口 vs wallet 新接口）

### Happy Path

#### H1：同参双跑结果一致
- 操作：旧 `pickWallet` 与新 `wallet.pickWallet` 使用同一 request/tree/wallet 调用
- 期望：输出结果深度一致
- 验证：`JSON.stringify(legacy) === JSON.stringify(modern)`

### Edge Cases

#### E1：scope=single 与 scope=all 一致性
- 操作：分别以 single/all 调用旧/新接口
- 期望：各自模式下旧新输出一致
- 验证：两组比较均通过

#### E2：typed 地址模式（BTC addressTypes）一致性
- 操作：chains 中传 BTC 多 addressTypes
- 期望：旧新输出地址类型与顺序一致
- 验证：对象数组逐项一致

### Invalid Cases

#### I1：wallet 不支持新接口时优雅降级
- 操作：`options.wallet.pickWallet` 不存在
- 期望：保留旧逻辑输出，不抛错
- 验证：旧逻辑结果仍打印

#### I2：新旧输出不一致时可见失败信息
- 操作：人为制造不一致
- 期望：打印旧/新结果并抛错
- 验证：终端可明确定位迁移不一致

---

## 测试场景：S-W-5 pickWallet path 透传与默认匹配

### Happy Path

#### H1：有 path 时透传到 getAddress
- 操作：树行含 `path=m/.../3`，调用 `wallet.pickWallet`
- 期望：`signer.getAddress` 收到 `{ path }`（typed 时为 `{ addressType, path }`）
- 验证：mock signer 记录入参包含 path

### Edge Cases

#### E1：无 path 时保持默认匹配
- 操作：树行 path 为空，调用 `wallet.pickWallet`
- 期望：不传 path，让 provider 自行使用默认路径
- 验证：mock signer 记录入参不含 path

#### E2：typed 模式多 addressType 都透传同一 path
- 操作：BTC typed 请求含两个 addressType
- 期望：每次 getAddress 入参均包含同一 path
- 验证：调用数组中每项都含 path 且 addressType 正确

---

## 测试场景：S-W-6 wallet.getAddressTypes

### Happy Path

#### H1：单链查询能力
- 操作：调用 `wallet.getAddressTypes({ chain: "btc" })`
- 期望：返回 BTC 地址类型数组
- 验证：包含 p2pkh/p2sh-p2wpkh/p2wpkh/p2tr

#### H2：全链查询能力
- 操作：调用 `wallet.getAddressTypes()`
- 期望：返回已注册链列表与各自 addressTypes
- 验证：items 中包含 btc/trx/evm

### Edge Cases

#### E1：provider 缺少 getAddressTypes 时默认回退
- 操作：注册不带该方法的 provider 后查询
- 期望：addressTypes 回退为 `["default"]`
- 验证：返回值符合默认策略

### Invalid Cases

#### I1：查询未注册链
- 操作：`wallet.getAddressTypes({ chain: "unknown" })`
- 期望：抛出未注册错误
- 验证：错误消息包含 `chain provider 未注册`

---

## 测试场景：S-W-7 pickWallet all 语义展开

### Happy Path

#### H1：chains=all 展开全部已注册链
- 操作：`chains: "all"` 调用 pickWallet
- 期望：返回 evm/trx/btc 三链结果
- 验证：result.addresses 包含三链键

#### H2：单链 addressTypes=all 展开全类型
- 操作：`chains: [{ chain: "btc", addressTypes: "all" }]`
- 期望：BTC 按 provider 能力展开多类型
- 验证：返回包含 type 字段的地址数组

### Edge Cases

#### E1：default 类型不走 typed 分支
- 操作：evm/trx 返回 `default`
- 期望：走普通模式返回单地址字符串
- 验证：输出不是 typed 数组结构

---

## 测试场景：S-W-8 pick 输出参数化到资产搜索

### Happy Path

#### H1：单地址字符串映射为 address-search 请求
- 输入：`addresses.evm = "0x..."`
- 期望：生成 `{ domain: "address", query: "0x...", network: "eth" }`

#### H2：typed 地址数组映射为多条 address-search 请求
- 输入：`addresses.btc = [{ type: "p2wpkh", address: "bc1..." }, { type: "p2tr", address: "bc1p..." }]`
- 期望：生成两条请求，分别保留 `addressType`

### Edge Cases

#### E1：相同地址去重
- 输入：不同来源行中出现相同 `network + query`
- 期望：参数化结果仅保留一条

#### E2：未知链网络映射回退
- 输入：`chain = "unknown"`
- 期望：network 回退为 `"unknown"`，不抛错

### Invalid Cases

#### I1：空地址行跳过
- 输入：`address = ""` 或 `null`
- 期望：不生成请求，不抛错

#### I2：搜索接口失败不阻断
- 输入：下游 search 报错
- 期望：返回 warning，主流程继续

---

## 测试场景：S-W-9 chains=default 只读已有地址

### Happy Path

#### H1：chains=default 返回已有地址
- 输入：树中 `addresses.evm = "0xabc"`
- 操作：`chains: "default"`
- 期望：直接返回 `0xabc`

### Edge Cases

#### E1：chains=default 缺失时不新增地址
- 输入：树中无 `evm/trx/btc` 已有地址
- 操作：`chains: "default"`
- 期望：返回空数组，不调用 `getSigner`

#### E2：显式链数组与 chains=all 时默认链仍可生成
- 输入：树中无 `evm/trx` 地址
- 操作：`chains: ["evm","trx"]` 或 `chains: "all"`
- 期望：`evm/trx` 仍按 provider 默认规则生成

#### E3：typed 模式仍可生成
- 输入：BTC 请求 `addressTypes: "all"`
- 期望：typed 分支保持现有生成逻辑

### Invalid Cases

#### I1：chains=default 不应被显式链数组/all 语义污染
- 输入：同一链能力为 `default`
- 操作：分别测试 `chains: "default"`、`chains: ["evm"]` 与 `chains: "all"`
- 期望：仅 `chains: "default"` 只读已有，其他允许生成

