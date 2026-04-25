# modules/request-engine 开发计划

目标：统一管理接口请求去重与缓存，解决“一次返回多链数据”的复用问题。

## 1. 需求范围

1. requestKey 级缓存（原始响应）
2. chainKey 级缓存（按链扇出）
3. in-flight 请求合并
4. 基础统计（命中/穿透/去重）

## 2. 当前切片计划

### Slice RQ-1：请求去重与缓存扇出 MVP

本次只做：

1. fetchShared：requestKey 缓存 + in-flight
2. getChainSlice：链级读取 + 扇出写入
3. invalidate/getStats 最小接口

本次不做：

1. 分布式缓存
2. 高级预热策略
3. 多级优先级队列

验收标准：

1. 同一请求并发只触发一次外部调用
2. 一次多链返回后，第二链命中 chainKey 缓存
3. 提供最小统计用于 debug

### Slice RQ-2：缓存策略细化（分域 TTL + 失效策略）

本次只做：

1. 分域 TTL：支持 request 和 chain 独立 TTL
2. 失效策略：支持按 requestPrefix / chainPrefix 批量失效
3. 最小统计补充：prefix 失效计数

本次不做：

1. 分布式缓存同步
2. LRU 驱逐
3. 预热和后台刷新

验收标准：

1. requestTTL 过期不影响 chainTTL 命中（反之亦然）
2. prefix 失效仅影响命中的 key 集合
3. RQ-1 测试不回归，RQ-2 新测试通过

## 3. 当前进度 / 下一步

当前进度：

1. 已完成 RQ-1 的最小实现（fetchShared / getChainSlice / invalidate / getStats）
2. 已补充 request-engine 测试样本（happy/edge/invalid/security）
3. 已新增 request-engine 单测并通过
4. 已完成 RQ-2（分域 TTL + prefix 失效策略）并通过回归

下一步：

1. 评估与 data-engine/search-engine 的接入点
2. 规划 RQ-3（可观测性增强：按 key 命中分布、过期回收统计）
