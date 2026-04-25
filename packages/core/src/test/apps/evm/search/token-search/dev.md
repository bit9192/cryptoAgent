# apps/evm/search/token-search 开发计划

目标：先在 EVM 域内独立完成 token-search provider 开发与验证，不依赖主 search 集成；待 EVM 侧稳定后，再通过 composition root 进行装配接入。

## 1. 需求范围

本模块当前需求：

1. 在 apps/evm/search 下提供独立 token-search provider。
2. 支持 query 为 symbol / name / address 的最小检索闭环。
3. 输出对齐统一 SearchItem 协议（至少包含 domain/chain/network/id/title/address/extra）。
4. 默认优先走 EVM 本地 token 配置解析；远端检索能力作为后续切片。
5. 设计独立 tokenRiskCheck 接口，先定义协议与聚合口，不在 ETS-1 落地远端风险源。

本阶段不做：

1. 不修改 modules/search-engine 核心路由与聚合逻辑。
2. 不做 BTC/TRX 统一抽象。
3. 不做 CLI 与 tasks/search 接入。
4. 不做上线可用性承诺（仅开发态验证）。
5. 不在 token-search 中实现交易级流动性深度检测（由 trade-search 承担）。

## 1.1 领域边界约定

1. token-search（身份与画像）
- 负责 symbol / name / address 检索。
- 负责 token 基础资料与项目资料（后续：description/website/docs/social/logo）。
- 负责输出风险摘要（riskSummary），但不承载交易执行明细。

2. trade-search（交易可执行性）
- 负责流动性、滑点、路由、可成交性等交易指标。
- token-search 仅可引用其摘要结果，不内嵌交易检测逻辑。

3. contract-search（合约静态安全）
- 负责权限、可升级、危险函数等合约结构风险。
- tokenRiskCheck 聚合时可接入 contract-search 的静态结果。

## 1.2 对外接口（开发态最小集）

1. searchToken(input, ctx?)
- 用途：token 身份检索。
- 输入：query/kind/network/limit/metadata。
- 输出：SearchItem[]（domain=token）。

2. tokenRiskCheck(input, ctx?)
- 用途：token 风险摘要聚合。
- 输入：tokenAddress/network/chain/metadata。
- 输出：{ riskLevel, riskScore, riskFlags, sources }。

说明：当前阶段这两个接口足够支撑开发；后续通过内部模块扩展能力，而非扩大对外接口数量。

## 2. 分层落位

1. apps/evm/search
- 放置 EVM token-search provider 实现。
- 建议文件：
	- token-provider.mjs（对外 provider 与 orchestrator）
	- token-query-parser.mjs（query/kind/network 解析）
	- token-resolver.mjs（配置优先解析 symbol/name/address）
	- token-normalizer.mjs（映射到 SearchItem）
	- token-risk-check.mjs（风险聚合入口）
	- token-risk-static.mjs（静态风险检查）
	- token-risk-market.mjs（市场/流动性风险适配，后续接 trade-search）

2. apps/evm/configs
- 复用 tokens.js 作为配置优先数据源。

3. test/apps/evm/search/token-search
- 放置 test-data 与 *.test.mjs。
- 本目录 dev.md 仅管理本子模块切片计划。

4. modules/search-engine/composition-root
- 暂不改动；待 EVM provider 稳定后再接入注册。

## 3. 开发门禁（严格执行）

必须遵循：样本 -> 测试 -> 计划 -> 实现。

进入实现前必须满足：

1. test-data 文件存在且覆盖 happy / edge / invalid / security。
2. token-search.test.mjs 已建立并能按样本驱动执行。
3. 本 dev.md 已明确本次只做一个切片。

若任一条件不满足：停止实现，先补文档与样本。

## 4. 当前切片计划

### Slice ETS-1：EVM token-search 最小闭环（配置优先）

本次只做：

1. 新增 createEvmTokenSearchProvider（仅 token domain）。
2. 复用 apps/evm/configs/tokens.js 完成 symbol/name/address 解析。
3. 输出标准化 SearchItem 列表。
4. 完成内部模块拆分（parser/resolver/normalizer/provider orchestrator）。
5. provider 内部错误降级为空结果，不抛出敏感细节。

本次不做：

1. DexScreener/CoinGecko 等远端 source 接入。
2. 模糊搜索排序策略。
3. 主 search composition root 注册接入。
4. tokenRiskCheck 的真实风险源接入（仅保留接口草案与测试样本占位）。

验收标准：

1. query=usdt, network=eth 可命中 EVM 配置 token。
2. query=0x... 地址可回查 symbol/name/decimals。
3. 非法地址与空 query 行为可预测（返回空或明确错误，按测试定义）。
4. 安全样本通过：错误与日志不泄露 privateKey/mnemonic/password/apiKey。
5. 代码结构上无单个超大函数，核心流程通过组合小模块完成。

### Slice ETS-2：token profile 扩展（项目资料）

本次只做：

1. 在 SearchItem.extra 增加 project 资料结构（description/website/docs/social/logo）。
2. 优先本地配置字段映射，远端资料源后续接入。

本次不做：

1. 项目资料可信度评分。
2. 多源冲突合并策略。

验收标准：

1. profile 字段缺失时行为稳定，不影响 ETS-1 结果。
2. 字段命名与结构固定，便于后续多源接入。

### Slice ETS-3：tokenRiskCheck 风险摘要聚合

本次只做：

1. 提供 tokenRiskCheck 接口实现与标准输出。
2. 聚合静态风险（contract 侧）与市场风险摘要（trade 侧）。
3. 输出 riskLevel/riskScore/riskFlags/sources。

本次不做：

1. 交易明细指标直出到 token-search 主结果。
2. 风险策略自学习或在线调参。

验收标准：

1. tokenRiskCheck 在数据缺失场景可降级 unknown，不抛异常。
2. 风险来源可追溯（sources 字段可见）。
3. 安全样本通过，不泄露敏感上下文。

### Slice ETS-4：token-search 批量接口与 multicall 元信息补全

本次只做：

1. provider 暴露 `searchTokenBatch` 批量接口。
2. 批量场景使用 multicall 读取链上 metadata（name/symbol/decimals）补全结果。
3. 保持单条 `searchToken` 行为兼容，不强制走 multicall。

本次不做：

1. 跨链批量并发策略。
2. 远端资料源与 profile 字段融合。

验收标准：

1. 批量输入时可返回与输入同序的结果集合。
2. 批量 metadata 补全走单次 batch reader（multicall 路径）。
3. multicall 失败时可降级为配置数据，不抛异常。

## 5. 测试映射（先样本后测试）

对应文件：

1. test-data：src/test/apps/evm/search/token-search/token-search-test-data.md
2. test：src/test/apps/evm/search/token-search/token-search.test.mjs

样本最低要求：

1. happy >= 1
2. edge >= 3
3. invalid >= 3
4. security >= 2

接口样本补充要求：

1. searchToken 覆盖 symbol/name/address 三类输入。
2. tokenRiskCheck 覆盖 low/medium/high/unknown 至少四种风险输出。
3. trade-search 与 contract-search 输入缺失时，tokenRiskCheck 需覆盖降级样本。

## 6. 当前进度 / 下一步

当前进度：

1. 已建立 EVM token-search 开发计划（本文件）。
2. 已确认当前阶段采用“EVM 独立开发，暂不接主 search”策略。
3. 已确认接口最小集为 searchToken + tokenRiskCheck。
4. 已确认流动性检测归 trade-search，token-search 仅保留摘要引用。
5. 已完成 token-search-test-data.md 样本落地（覆盖四类样本）。
6. 已完成 token-search.test.mjs 与 token-risk-check.test.mjs（TDD）。
7. 已完成 ETS-1 模块化实现：token-provider/query-parser/resolver/normalizer。
8. 已完成 tokenRiskCheck 最小聚合实现与降级策略（无真实远端风险源）。
9. ETS-1 切片测试已通过（10/10）。
10. 已开始 ETS-3：market risk 接入 goplus（部分能力，支持注入与降级）。
11. tokenRiskCheck 已支持 marketOptions/staticOptions 透传。
12. 已完成 ETS-4：provider 暴露 searchTokenBatch 接口。
13. 已完成 ETS-4：批量 metadata 通过 multicall batch reader 补全。
14. 已完成 ETS-4：batch 场景失败降级测试与回归通过。

下一步：

1. 完成 ETS-3：补齐 contract 风险输入融合与 sources 细化字段。
2. 再进入 ETS-2：补充 token profile 字段结构与映射。
3. 保持主 search 不变，仅在 EVM 侧迭代并扩展测试样本。