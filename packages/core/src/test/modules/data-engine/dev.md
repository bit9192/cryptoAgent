# modules/data-engine 开发计划

目标：在不重写各链实现的前提下，把 data 查询入口接入 request-engine，获得请求去重与缓存能力。

## 1. 需求范围

1. 复用现有 data-engine 接口能力（extract/compute/sanitize）
2. 新增 query 薄层，统一接入 request-engine
3. 不改现有链 provider 逻辑，不改任务语义

## 2. 当前切片计划

### Slice DQ-1：Data Query 薄层接入 request-engine

本次只做：

1. createDataQueryGateway：统一 query 入口
2. queryShared：通过 request-engine 的 fetchShared
3. queryChain：通过 request-engine 的 getChainSlice
4. invalidateQueryCache/getQueryStats：透传缓存失效与统计

本次不做：

1. 重写各链 net provider
2. 改动 assets/token-price 业务逻辑
3. 多级队列或分布式缓存

验收标准：

1. 相同 requestKey 并发只触发一次 fetcher
2. chain fanout 后可通过 queryChain 命中链缓存
3. data-engine 旧能力测试不回归

## 3. 当前进度 / 下一步

当前进度：

1. 已完成 DQ-1：新增 createDataQueryGateway 薄层接入 request-engine
2. 已补充 DQ-1 测试样本清单
3. 已新增并通过 DQ-1 相关单测
4. 已完成 DQ-2：assets.token-meta / assets.token-price 入口接入 queryShared
5. 已新增任务层接入回归测试并通过

下一步：

1. 规划 DQ-3：assets.query（多链余额聚合）入口接入 queryChain
2. 设计 queryKey 规范（task 维度统一）
