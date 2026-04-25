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
15. 已完成 ETS-3：contract 风险输入融合（contractChecker/input.contractRisk）。
16. 已完成 ETS-3：sources 细化字段（name/status/level/score/flagsCount/reason/updatedAt）。
17. ETS-3 + ETS-4 回归测试通过（18/18）。
18. 已完成 ETS-2：extra.project 标准结构落地（description/website/docs/logo/social）。
19. 已完成 ETS-2：本地 profile 配置映射（eth/bsc 示例）与空值结构稳定。
20. ETS-2 + ETS-3 + ETS-4 回归测试通过（20/20）。

下一步：

1. 在主 search composition root 评估接入 EVM token provider（保持核心引擎不变）。
2. 补充 profile 多网络样本（含 bsc/未来扩展网络）与冲突策略测试。
3. 继续保持 EVM 侧模块化迭代，不跨域混入 trade/contract 业务细节。

### Slice ETS-5：symbol/name 查询未命中本地配置时的远端 fallback

背景：
- 本地 EVM_DEFAULT_TOKENS 仅收录少量常用 token（eth: weth/usdt/usdc/uni；bsc: wbnb/usdt）。
- 当用户查询 crv 等 DeFi token 时，resolver 返回空，整个 searchToken 结果为空。
- 需要在本地配置未命中时走远端 fallback，通过 DexScreener 解析 symbol → address，再补全链上 metadata。

本次只做：

1. 在 token-provider.mjs 的 runSingle 中，当 resolver 返回空 且 queryKind 为 symbol/name 时，调用可注入的 remoteSymbolFallback。
2. remoteSymbolFallback 默认实现：使用 DexScreenerSource.getTokenInfo(query, {network}) 获取 baseToken.address。
3. 以 baseToken.address 构建占位候选（symbol/name/decimals 从 DexScreener 取），走 hydrateSingleAddressItem 补全链上 metadata。
4. fallback 失败时静默降级，返回空数组，不抛出异常。
5. remoteSymbolFallback 支持在 createEvmTokenSearchProvider(options) 中注入（用于测试 mock）。

本次不做：

1. name 查询的 DexScreener fallback（name 查询实际使用量低，暂不扩展）。
2. 多候选排序策略（DexScreener 已按流动性选 best pair，单条即可）。
3. fallback 结果写入本地缓存。
4. 其它远端 source（CoinGecko/CoinMarketCap）接入。

验收标准：

1. query=crv, network=eth 时，searchToken 可通过 DexScreener fallback 返回含 CRV token 的 SearchItem。
2. DexScreener 无结果时，searchToken 正常返回空数组，不抛出异常。
3. remoteSymbolFallback 可被 mock 注入，测试不依赖真实网络请求。
4. 已通过的 ETS-1~ETS-4 测试（22条）不受影响。

### Slice ETS-6：resolveTokenNetworks — 按 symbol/name 查询 token 跨网络分布

背景：
- 用户查询 token 时不一定知道所在网络（如查 "aave" 时 network 不明确）。
- 需要一个接口，输入 symbol/name，输出该 token 在哪些链/网络上存在（含地址）。
- 实现依赖 CoinGecko platforms 字段（已有 mapPlatformToChainNetwork 映射），无需新数据源。

本次只做：

1. 新增 `resolveTokenNetworks(input, options?)` 接口（通过 CoinGeckoSource.getTokenCandidates 获取跨网络分布）。
2. 输出格式：`NetworkPresence[]`，每条包含 `{ chain, network, tokenAddress, symbol, name, source }`。
3. 支持在 `createEvmTokenSearchProvider(options)` 中注入 `networkResolver`（用于测试 mock）。

### Slice ETS-8：去除 kind 必填语义（参数可省略并自动识别）

背景：
- `kind=name` 在部分场景会优先命中列表源，受上游限流/空结果影响更明显，导致“直接查不到”。
- 调用方（尤其脚本/AI）希望输入更少，只传 query/network/limit 即可稳定工作。

本次只做：

1. `searchToken/searchTokenBatch` 改为默认按 query 自动识别类型，不再依赖 `kind` 驱动主流程。
2. `kind` 作为兼容字段保留在输入结构中，但解析阶段忽略其取值，不再因非法值抛错。
3. 名称查询列表化能力改为由 query 形态触发（如自然语言名称），而非 `kind=name` 强制触发。
4. 保持 address/symbol 的既有能力（本地解析、远端 fallback、批量补全）不回退。

本次不做：

1. 调整对外函数签名或删除历史字段（避免破坏已有调用方）。
2. 改动 risk 模块行为。
3. 引入新远端数据源。

验收标准：

1. 不传 `kind` 时，`query=crv` 可返回有效结果（不劣于当前默认路径）。
2. 传入 `kind=name` 但 query 为 symbol 形态时，不再被强制走 name 列表空路径。
3. 非法 `kind` 不抛错，系统自动按 query 识别。
4. token-search 全量回归通过。
4. 结果按 chain/network 排序（evm/eth 优先），同 chain/network 去重。
5. 失败时返回空数组，不抛异常。

本次不做：

1. 多 token 批量查询。
2. 合并 DexScreener 与 CoinGecko 跨网络结果（CoinGecko 已足够）。
3. 结果写入本地缓存。

验收标准：

1. query=aave 时，返回列表中包含 network=eth 的条目（tokenAddress 为合法 EVM 地址）。
2. query=usdt 时，可同时返回 eth/bsc/tron 等多个网络的条目。
3. query 不存在时，返回空数组，不抛出异常。
4. networkResolver 可被 mock 注入，测试不依赖真实网络请求。
5. 已通过的 ETS-1~ETS-5 测试（19条）不受影响。

### Slice ETS-7：name 查询结果链上核验（单条 + 批量 multicall）

背景：
- name 查询目前可由本地配置或远端 fallback 返回 address。
- 需要在返回前基于链上 metadata 再核验一次，避免 name/address 错配。
- 批量场景应复用 multicall 路径，不能逐条单点读取。

本次只做：

1. `searchToken` 在 `queryKind=name` 时强制走 single metadata reader 补全链上 name/symbol/decimals。
2. `searchToken` 对 name 查询做链上 name 精确核验（大小写不敏感），未通过的候选过滤掉。
3. `searchTokenBatch` 先走既有 multicall enrich，再按每行 query/name 做链上核验过滤。
4. 批量过滤后回写 sourceStats（hit/empty）以匹配最终 items。

本次不做：

1. 模糊 name 匹配策略（仅做精确匹配）。
2. symbol 查询的额外链上核验增强。
3. 将核验失败原因透出到对外协议字段。

验收标准：

1. 单条 name 查询中，若链上 name 不匹配，结果为空数组。
2. 单条 name 查询中，若链上 name 匹配（忽略大小写），结果正常返回。
3. 批量 name 查询复用 multicall 结果完成核验，不逐条 single-reader。
4. 批量中 name 不匹配项被过滤，匹配项保留；sourceStats 的 hit/empty 与过滤后 items 一致。

### Slice ETS-9：无 network 查询改为跨网络分组 multicall 核验后返回

背景：
- 当前 `searchToken({ query })` 在无 `network` 时可能直接返回 networkResolver 候选，未做链上核验。
- 用户期望：既然不限制 network，就应把候选按 network 分组后分别 multicall，只返回通过链上核验的结果。

本次只做：

1. 无 `network` 且 query 为 symbol/name 时，先拉取跨网络候选，不直接返回原始列表。
2. 将候选按 `network` 分组，复用 batch metadata reader 做分网络 multicall。
3. 对每个候选执行链上核验，未通过核验的条目过滤掉。
4. 返回所有通过核验的候选（可跨多个 network），并保持 limit 截断。

本次不做：

1. 修改显式 `network` 查询路径。
2. 引入新的远端 source 或缓存策略。
3. 调整 tokenRiskCheck 行为。

验收标准：

1. 无 `network` 查询时，metadataBatchReader 会按涉及的 network 分别调用。
2. 仅返回链上核验通过的候选，核验失败项被过滤。
3. 通过核验的多 network 候选会一起返回，不再只保留单条。
4. token-search 回归测试通过。

### Slice ETS-10：跨网络候选 unverified 保留策略

背景：
- `runCrossNetworkVerified` 核验阶段要求 metadataSource=multicall，否则过滤。
- 对于某些链上无标准 ERC20 接口的 token（如 bsc Bridged Token），batch reader 可能不返回该地址条目，enricher 不设 metadataSource=multicall，导致核验失败被过滤。
- 用户期望这类 token 在远端候选 symbol 精确匹配 query 时也能出现在结果中，但明确标注未经链上核验。

本次只做：

1. 在 `applyCrossNetworkOnchainVerification` 中添加放宽规则：当 item 的 metadataSource 不是 "multicall"，但 item.symbol 精确匹配 query（忽略大小写）时，保留该条目并标记 `extra.unverified = true`、`extra.metadataSource = "network-resolver"`。
2. 放宽规则只对 queryKind=symbol 生效（queryKind=name 仍需链上 name 精确匹配，不放宽）。
3. 已通过 multicall 核验的条目不受影响（不添加 unverified 标记）。

本次不做：

1. 改进 networkResolver 的多网络候选覆盖（DexScreener 仅 eth 问题单独处理）。
2. 对 unverified 条目进行额外风险评分调整。
3. 放宽 queryKind=name 的核验规则。

验收标准：

1. multicall 未命中（无 metadataSource=multicall）但远端 symbol 精确匹配 query 的条目，保留并打上 extra.unverified=true, extra.metadataSource="network-resolver"。
2. 已有 multicall 验证通过的条目不受影响（不被打 unverified）。
3. queryKind=name 时放宽规则不生效（name 不匹配仍被过滤）。
4. token-search 全量回归测试通过（≥36 条）。

### Slice ETS-11：跨网络路径 profile 填充（remote candidates）

背景：
- `mapNetworkEntriesToSearchItems` 将远端候选（networkResolver 返回结果）映射为 SearchItem 时，`extra.project` 字段全部硬编码为 null。
- `resolveEvmTokenProfile` 已支持多网络（eth/bsc），但只在本地配置路径（`normalizeEvmTokenSearchItems`）被调用。
- 结果：通过跨网络路径（runCrossNetworkVerified / resolveNameListItems）返回的 token，即使本地 profile 有数据，也无法填充。

本次只做：

1. 在 `mapNetworkEntriesToSearchItems` 中，对每个候选调用 `resolveEvmTokenProfile` 填充 `extra.project`。
2. profile 查找按优先级：symbol → address（与 resolveEvmTokenProfile 内部逻辑一致）。
3. 本地 profile 无数据时，保持 EMPTY_PROJECT 结构（全 null），不抛异常。

本次不做：

1. 远端资料源（CoinGecko metadata API）接入 profile 字段。
2. 多源 profile 冲突合并策略（远端优先 vs 本地优先）。
3. 更改 EMPTY_PROJECT 结构。

验收标准：

1. 跨网络路径返回的 usdt/eth 条目，extra.project.website 等字段可从本地 profile 填充。
2. 跨网络路径返回的 bsc usdt 条目，extra.project 也正确填充（bsc profile 已存在）。
3. 本地 profile 无数据的 token（如 crv），extra.project 为全 null 结构，不崩溃。
4. token-search 全量回归测试通过（≥40 条）。

### Slice ETS-12：tokenRiskCheck 接入 trade summary 摘要

背景：
- trade-search 已具备 `getTokenTradeSummary`（pairCount/topDex/liquidity/volume）。
- tokenRiskCheck 目前仅聚合 static/market/contract 三源，未消费 trade 维度摘要。
- 需要在不暴露交易明细的前提下，把 trade 摘要作为可选风险来源接入。

本次只做：

1. tokenRiskCheck 支持可选 `tradeSummaryChecker(input, tradeOptions)`。
2. tokenRiskCheck 支持可选 `input.tradeSummary`（当 checker 不提供时可直接透传摘要）。
3. trade 摘要映射为风险结果（level/score/flags），并纳入 riskLevel/riskScore/riskFlags 聚合。
4. 当 trade checker 抛错时，降级为 `trade-unavailable`，不抛异常。

本次不做：

1. 在 tokenRiskCheck 内直接调用 trade-provider（避免循环依赖）。
2. 注入两跳路径细节到风险输出。
3. 变更对外风险协议字段结构。

验收标准：

1. 传入 `input.tradeSummary` 时，sources 增加 `trade`，且风险可被 trade 结果影响。
2. `tradeSummaryChecker` 报错时，trade source 状态为 error，整体不抛异常。
3. 未提供 trade 摘要时，现有行为与测试不回归。

当前进度补充：

1. 已完成 ETS-12 实现：tokenRiskCheck 支持 `input.tradeSummary` 与 `tradeSummaryChecker`。
2. 已新增 ETS-12 测试并通过（token-risk-check 12/12）。
3. trade-search 与 token-price 回归通过（10/10, 17/17）。

### Slice ETS-13：token-provider 层自动注入 trade summary checker

背景：
- ETS-12 已支持 tokenRiskCheck 接收 `tradeSummaryChecker`，但调用方仍需手动注入。
- 需要在 provider 层提供可选自动注入能力，减少调用侧样板代码。

本次只做：

1. 在 `apps/evm/search/token-provider.mjs` 增加 `tokenRiskCheck` 包装函数。
2. 当 `options.autoTradeSummary === true` 且未显式传入 `tradeSummaryChecker` 时，自动使用 trade-search 的 `getTokenTradeSummary` 作为 checker。
3. 保持默认行为不变（未开启 autoTradeSummary 时与 ETS-12 前一致）。

本次不做：

1. 强制默认开启 autoTradeSummary。
2. 在 tokenRiskCheck 内部直接耦合两跳路径细节。
3. 修改 risk 输出协议结构。

验收标准：

1. 开启 autoTradeSummary 时，tokenRiskCheck 的 sources 包含 trade。
2. trade summary resolver 抛错时，trade source 状态为 error，整体不抛异常。
3. 未开启 autoTradeSummary 时，原有测试与行为不回归。

当前进度补充：

1. 已完成 ETS-13 实现：token-provider.tokenRiskCheck 支持 `autoTradeSummary` 自动注入。
2. 已新增 ETS-13 测试并通过（token-risk-check 14/14）。
3. trade-search 与 token-price 回归通过（10/10, 17/17）。