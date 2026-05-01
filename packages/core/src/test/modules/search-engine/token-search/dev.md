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

### Slice TS-7：search 模块提供 address-assets 单地址 facade

本次只做：

1. 将 `searchAddressAssetsTaskWithEngine` 的核心搜索聚合逻辑下沉到 search 模块 facade
2. facade 直接复用已注册的默认 search providers，不在 task 内分发链逻辑
3. task 层改为薄包装，仅转调 facade

本次不做：

1. wallet.pickWallet 串联
2. batch 接口迁移
3. valuation / portfolio 重构

验收标准：

1. 单地址 address-assets 查询可不经过 task 直接走 search facade
2. task 返回结构保持兼容
3. task 内不再包含 address-assets 的链级执行分支

### Slice TS-8：search 模块提供 address-assets 批量 facade

本次只做：

1. 将 `searchAddressAssetsBatchTaskWithEngine` 的批量执行逻辑下沉到 search 模块 facade
2. batch facade 仅接收标准 `items` 输入并返回 `items + summary`
3. task 层改为薄包装，仅负责调用 facade

本次不做：

1. pickedWallets 参数化
2. token balance batch 迁移
3. portfolio 汇总

验收标准：

1. `searchAddressAssetsBatchTask` 仅作为 facade 的兼容包装存在
2. task 内不再保留批量 address-assets 的执行细节
3. 原有 address-assets batch 返回结构不变

### Slice TS-9：task 层新增 build-from-picked 参数化函数

本次只做：

1. 新增 `pickedWallets -> searchAddressAssetsBatchTask.items` 的参数化函数
2. 参数化函数只做地址提取、chain->network 配置展开、去重
3. 保留 trace/context 信息，便于下游结果反查来源 key/addressType

本次不做：

1. task 内直接执行 search
2. token 列表展开
3. execute 层接入

验收标准：

1. run/test 可通过参数化函数直接拿到 `searchAddressAssetsBatchTask` 所需 `items`
2. 参数化函数不包含 RPC 或 provider 调用
3. 参数化规则由 plan/config 驱动，而不是 run/test 手写

### Slice TS-10：wallet + search 的 task 仅保留调度骨架

本次只做：

1. task 形成 `pickWallet -> buildFromPicked -> search facade` 的固定骨架
2. task 只保留跨模块编排，不再持有链级 reader / switch 分支
3. run/test 改为调用该骨架，验证端到端最小闭环

本次不做：

1. portfolio / valuation 大一统
2. execute 层意图解析
3. 多 task 合并抽象

验收标准：

1. task 代码中不再出现按 `evm/trx/btc` 分支执行具体 reader 的逻辑
2. run/test 只保留调试输入和结果打印
3. wallet 与 search 的职责边界清晰：wallet 选地址，search 查资产，task 只调度

## 3. 当前进度 / 下一步

当前进度：

1. 已完成 TS-1：token-search 最小闭环实现
2. 已补充 token-search 四类测试样本
3. 已新增并通过 TS-1 单测（聚合/去重/limit/安全）
4. 已完成 TS-2：注册式 provider 接口与统一 search 协议
5. 已完成 TS-3：request-engine queryShared 去重缓存接入
6. 已完成 TS-4：接入 trx provider 与多链排序优先级
7. 已完成 TS-6（架构收口）：默认 provider 装配迁移至 composition root
8. 已明确下一阶段重构方向：search 下沉链聚合、task 退回调度

下一步：

1. TS-7：先迁移 address-assets 单地址 facade 到 search 模块
2. TS-8：再迁移 address-assets batch facade，task 改成薄包装
3. TS-9：新增 build-from-picked 参数化函数，承接 wallet.pickWallet 到 search batch 入参
4. TS-10：收口 wallet + search task 骨架，run/test 只做调试调用
5. TS-11：在上述边界稳定后，再继续 token domain 逐链真实 provider 扩展（evm/btc/trx 统一注册）
