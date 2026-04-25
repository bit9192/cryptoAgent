# modules/search-engine/token-search 开发计划

目标：实现 token 搜索最小闭环，支持跨链候选汇总（如 ordi -> btc + evm）。

## 1. 需求范围

1. symbol/name/address 查询候选
2. 候选标准化输出
3. 跨链去重与基础排序

## 2. 当前切片计划

### Slice TS-1：token-search 最小闭环

本次只做：

1. 定义 token-search 输入输出协议
2. 接入 btc + evm 两条 provider 结果聚合
3. 输出 candidates + sourceStats

本次不做：

1. trade/contract/address 融合搜索
2. 权重配置化
3. 历史趋势与图谱

验收标准：

1. 查询 ordi 时可返回跨链候选
2. 候选包含 chain/network/source/confidence
3. 旧资产查询能力不回归

### Slice TS-2：注册式 provider 与统一 search 协议

本次只做：

1. SearchEngine 提供 register/unregister/list/has API
2. provider 支持 capabilities + networks 标准字段
3. token-search 复用 SearchEngine 并保持兼容返回结构（candidates）

本次不做：

1. request-engine 缓存接入
2. trade/contract/address 业务实现
3. provider 热更新持久化

验收标准：

1. 新链 provider 可通过 registerProvider 注入并被搜索调用
2. 可按 domain/chain/network 列举 provider
3. 原 TS-1 测试全部通过

### Slice TS-3：接入 request-engine 做 queryShared 去重缓存

本次只做：

1. search 查询通过 request-engine.fetchShared 复用缓存
2. 同 requestKey 并发查询只触发一次 provider 执行
3. 暴露 invalidateSearchCache/getSearchStats 便于调试和回归

本次不做：

1. chain fanout 缓存
2. 分布式缓存或持久化缓存
3. 跨 domain 共享缓存策略

验收标准：

1. 重复相同查询命中 request 缓存，不重复调用 provider
2. 并发相同查询触发 in-flight 合并
3. forceRemote=true 可跳过缓存

## 3. 当前进度 / 下一步

当前进度：

1. 已完成 TS-1：token-search 最小闭环实现
2. 已补充 token-search 四类测试样本
3. 已新增并通过 TS-1 单测（聚合/去重/limit/安全）
4. 已完成 TS-2：注册式 provider 接口与统一 search 协议
5. 已完成 TS-3：request-engine queryShared 去重缓存接入
6. 已完成 TS-4：接入 trx provider 与多链排序优先级
7. 已完成 TS-6（架构收口）：默认 provider 装配迁移至 composition root

下一步：

1. TS-7：search task 接入统一 SearchEngine 入口
2. TS-8：token domain 逐链真实 provider 扩展（evm/btc/trx 统一注册）
