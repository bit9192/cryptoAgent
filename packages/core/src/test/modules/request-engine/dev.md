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

## 3. 当前进度 / 下一步

当前进度：

1. 仅完成切片计划

下一步：

1. 先补 request-engine 样本
2. 再进入实现
