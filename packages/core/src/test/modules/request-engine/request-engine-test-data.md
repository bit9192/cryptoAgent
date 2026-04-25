# request-engine 测试样本清单

目标：覆盖 RQ-1（请求去重与缓存扇出 MVP）的 happy、edge、invalid、security 四类样本。

## 1. happy-path

1. 同 requestKey 并发请求只触发一次 fetcher
- 输入：3 个并发 `fetchShared`，同 requestKey
- 期望：fetcher 调用次数为 1，3 个返回值一致

2. requestKey 缓存命中
- 输入：第一次 `fetchShared` 成功后，再次同 key 调用
- 期望：直接命中 request cache，不触发 fetcher

3. chain fanout 写入后跨链命中
- 输入：第一次 `getChainSlice`（btc）返回多链数据并 fanout
- 期望：第二次 `getChainSlice`（evm）命中 chain cache，不触发 fetcher

## 2. edge-case

1. TTL 到期后重新拉取
- 输入：缓存 TTL=1000ms，时间推进到过期后再请求
- 期望：重新触发 fetcher

2. fanout 返回空对象
- 输入：fanout 返回 {}
- 期望：`getChainSlice` 对请求链返回 null，不抛异常

3. invalidate 只清理目标 key
- 输入：同时写入 requestKey 与 chainKey，多次 invalidate
- 期望：仅对应 key 被清理，其他 key 不受影响

## 3. invalid-case

1. requestKey 缺失
- 输入：`fetchShared({ fetcher })`
- 期望：抛 TypeError

2. fetcher 非函数
- 输入：`fetchShared({ requestKey, fetcher: 123 })`
- 期望：抛 TypeError

3. chainKey 缺失
- 输入：`getChainSlice({ requestKey, fetcher, fanout })`
- 期望：抛 TypeError

## 4. security-case

1. getStats 不返回缓存原文
- 输入：响应中含 `privateKey` / `secret`
- 期望：`getStats()` 仅返回计数字段，不含敏感原文

2. invalidate 回执不泄露数据
- 输入：缓存中含敏感字段
- 期望：`invalidate()` 返回布尔状态，不回传缓存内容

## 5. 占位符规范

敏感字段统一使用占位符：
- PRIVATE_KEY_PLACEHOLDER
- PASSWORD_PLACEHOLDER
- SECRET_PLACEHOLDER

## 6. RQ-2 增补样本（分域 TTL + 失效策略）

### happy-path

1. requestTTL 与 chainTTL 独立生效
- 输入：requestTTL=500ms, chainTTL=2000ms
- 期望：request 过期后，chain 仍可命中

2. prefix 批量失效（requestPrefix）
- 输入：requestKey 为 `price:*` 和 `balance:*`
- 期望：仅 `price:*` 被失效

3. prefix 批量失效（chainPrefix）
- 输入：chainKey 为 `token:ordi:*` 与 `token:btc:*`
- 期望：仅 `token:ordi:*` 被失效

### edge-case

1. prefix 无匹配
- 输入：不存在的前缀
- 期望：不抛错，删除计数为 0

2. 仅传 requestPrefix 或仅传 chainPrefix
- 输入：只给一个前缀
- 期望：另一个域不受影响

### invalid-case

1. requestPrefix 非字符串
- 输入：requestPrefix=123
- 期望：抛 TypeError

2. chainPrefix 空字符串
- 输入：chainPrefix=""
- 期望：抛 TypeError
