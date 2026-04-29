# modules/search-engine 开发计划

目标：建立统一 search 聚合能力，覆盖 token/trade/contract/address 四类搜索；采用多 provider + 单 action 聚合模式。

## 1. 模块范围

1. 统一 query 协议与输出协议
2. 跨链 provider 路由与聚合
3. 候选去重、排序、置信度输出
4. 与 request-engine 协同做请求去重与缓存复用

## 2. 分层落位

1. modules/search-engine
- 聚合编排、排序、去重、结果标准化

2. modules/request-engine
- 请求去重、缓存扇出、in-flight 合并

3. apps/*/search (后续)
- 各链 provider 原子搜索能力

4. tasks/search (后续)
- action 入口与参数校验

## 3. 当前切片计划

### Slice S-0：协议与样本先行

本次只做：

1. 定义 SearchQuery/SearchItem/SearchResult 协议
2. 定义 provider 能力声明协议
3. 定义样本边界（happy/edge/invalid/security）

本次不做：

1. 业务实现代码
2. CLI 交互展示
3. 复杂排序配置化

验收标准：

1. 协议文档可审阅
2. 子模块 dev 文档已建立
3. 可直接进入 S-1 开发

### Slice S-5：trade/contract/address 协议接入与 mock 验证

本次只做：

1. 统一 SearchItem 输出字段（domain/id/title/address/extra）
2. SearchEngine 支持三域按统一协议分发（mock provider）
3. 补齐三域样本并新增协议回归测试

本次不做：

1. 真实链 trade/contract/address provider 实现
2. 任务层和 CLI 展示接入
3. 链上深度检索算法

验收标准：

1. 三域都可通过 registerProvider + search 走通统一返回结构
2. 旧 token-search 回归不破坏
3. 样本覆盖 happy/edge/invalid/security

### Slice S-6：composition root 外置默认 provider 装配

本次只做：

1. `createSearchEngine` 收口为纯引擎（不内置默认 provider）
2. 新增 composition root（默认 provider 装配与注册函数）
3. 保持 token-search 对外行为兼容（自定义 providers 默认不叠加）

本次不做：

1. 新链 provider 实现
2. 搜索任务层与 CLI 接入
3. 跨域策略配置化

验收标准：

1. `createSearchEngine` 默认 provider 数量为 0
2. composition root 可恢复现有默认 provider 行为
3. token-search 回归测试通过

## 4. 子模块映射

1. token-search: symbol/name/tokenId 候选检索
2. trade-search: 交易与路由搜索
3. contract-search: 合约识别、标签、风险索引
4. address-search: 地址资产与行为聚合

## 5. 当前进度 / 下一步

当前进度：

1. ✅ 已完成 search 模块计划拆分
2. ✅ 已完成 token-search TS-1（最小闭环）
3. ✅ 已补齐 token-search 样本与单测
4. ✅ 已完成 token-search TS-2~TS-4（注册式、缓存、trx与排序）
5. ✅ 已完成 S-5：trade/contract/address 协议接入（mock）
6. ✅ 已完成 S-6：composition root 外置默认 provider 装配
7. ✅ 已完成 S-7：EVM search provider 注册注入
8. ✅ 已完成 S-8：BTC search 接口骨架设计
9. ✅ 已完成 S-9：基于 test.data 的多链多接口使用测试脚本
10. ✅ 已完成 S-10：投资组合分析全流程测试（API 瓶颈监测）
11. ✅ 已完成 S-10b：价格批量请求改造与并发压测

下一步：

1. ~~进入 S-12：EVM tokenAddress 先做网络归属验证（仅非 fork 网络）再查价~~ ✅
2. ~~S-13：公共层预验证下沉~~ ✅
3. ~~S-14：预验证命中统计注入 debugStats + 监测报告~~ ✅
4. 先进入 S-18：统一各链网络分类配置（mainnet / testnet / fork）
5. 在网络配置稳定后，再进入各链真实 provider 替换切片（先 EVM contract/address）
6. 最后进入 tasks/search 接入统一 SearchEngine 入口

### Slice S-18：提取每链统一的 network-scope 注册接口

本次只做：

1. 定义每条链统一的 `ChainNetworkScopeProvider` 接口，search 只通过 `chain` 取对应链接口
2. 每条链各自实现 `resolveScopeNetworks(scope)`，统一处理 `mainnet` / `testnet` / `fork`
3. 建立中心注册列表，例如 `getChainNetworkScopeProvider(chain)` / `listChainNetworkScopeProviders()`
4. EVM 链接口内部从现有 config 动态生成 scope 对应 networks，如 `mainnet -> [eth, bsc, polygon, ...]`
5. BTC 链接口内部处理：
   - `mainnet -> [mainnet]`
   - `testnet -> [testnet]`
   - `fork -> [regtest]`
6. TRX 链接口内部处理：
   - `mainnet -> [mainnet]`
   - `testnet -> [nile]`
   - `fork -> [nile]`
7. search/task/run 统一通过注册链接口拿 networks，不再自己拼默认值

执行子步骤（防遗忘，按顺序推进；每次开发只做一个子步骤）：

1. S-18.1：定义公共接口与注册表
   - 定义 `ChainNetworkScopeProvider` 结构与校验
   - 提供 `register/list/get` 三个注册表 API
2. S-18.2：各链实现 provider（链内实现，不进 search/task）
   - EVM provider：从 `apps/evm/configs/networks.js` 动态解析 `mainnet/testnet/fork`
   - BTC provider：从 `apps/btc/config/networks.js` 解析 `mainnet/testnet/fork`
   - TRX provider：从 `apps/trx/config/networks.js` 解析 `mainnet/testnet/fork`
3. S-18.3：替换 task/search 的中心硬编码
   - 移除 task/search 中 `btc/evm/trx` 分支网络映射
   - 改为 `chain -> registry provider -> resolveScopeNetworks(scope)`
4. S-18.4：run 与测试回归
   - run/test 输入只传 `chain + scope` 或标准 network
   - 不再在 run/test 内写链默认值

架构禁止项（必须长期满足）：

1. `search`/`wallet`/`task` 中禁止出现硬编码链名分支（`if chain===btc/evm/trx`、固定链集合）。
2. `search`/`wallet` 中禁止实现链专属 network 解释逻辑。
3. 新增链时禁止改 search/wallet 中央逻辑；仅允许新增链模块与注册。
4. `mainnet/testnet/fork` 解释必须在各链 network 配置与该链接口内完成。

本阶段回归清单（每个子步骤完成后都要跑）：

1. `src/test/tasks/search/search.test.mjs`
2. `src/test/modules/search-engine/address-assets-batch.task.test.mjs`
3. `src/test/modules/search-engine/address-context.test.mjs`
4. `src/test/modules/search-engine/token-search/token-search.test.mjs`

本次不做：

1. facade 下沉或 task 重构
2. pickedWallets 参数化
3. provider 实际查询接线
4. 多链业务查询逻辑改造

设计约束：

1. search 不保存“某链该怎么展开 scope”的分支逻辑，只负责按 `chain` 调注册链接口
2. 新增链时，只允许新增一个链接口对象并注册，不能回到 search/task 中央追加 `if chain===...`
3. EVM network 列表只能来自 config，如 `listEvmNetworks()` / network config 元数据
4. `scope` 是环境分类，最终 networks 由各链自己决定，允许 `fork -> regtest`、`testnet -> nile` 这类映射
5. 接口最小建议形态：
   - `chain`
   - `supportedScopes`
   - `resolveScopeNetworks(scope, options?)`
   - `resolveDefaultScope?(options?)`

验收标准：

1. 给定 `chain + scope`，可通过统一链接口返回该链的 network plan
2. EVM `mainnet` 展开结果随 config 变化自动更新
3. search/task/run 不再保留 `evm -> bsc`、`btc/trx -> mainnet` 这类硬编码默认值
4. 后续 `build-from-picked` 只消费链接口结果，不理解链细节
5. 理论上新增新链只需新增并注册一个 `ChainNetworkScopeProvider`
6. 对三链 network 配置的读取是动态的，不依赖 task/search 中央常量

### Slice S-7：EVM search provider 注册注入到中心 SearchEngine

本次只做：

1. 在 composition root 增加 EVM search provider 装配入口（token/trade/address）。
2. SearchEngine 通过 registerProvider 注入 EVM provider，不在核心引擎硬编码链逻辑。
3. 新增模块级回归测试，验证 domain=token/trade/address 能命中 EVM provider。
4. 默认 provider 与自定义 provider 共存策略明确（可覆盖、可追加）。

本次不做：

1. contract-search 真实 provider 接入。
2. BTC search 真实实现。
3. CLI/task 层最终接线。

验收标准：

1. createDefaultSearchEngine 下 EVM 三类 search 可用。
2. SearchEngine 仍保持注册式架构（无链特化分支）。
3. token-search 既有测试无回归。

### Slice S-8：以 EVM 接口为模板定义 BTC search 接口骨架

本次只做：

1. 建立 BTC search 接口设计文档（token/address/trade 最小对齐面）。
2. 明确 BTC provider 注册字段（id/chain/networks/capabilities/searchXxx）。
3. 准备 BTC search 的 test-data 与 dev 切片，不进入业务实现。

本次不做：

1. BTC provider 具体逻辑开发。
2. 第三方源接入（mempool/blockbook）。
3. 排序与风险策略实现。

验收标准：

1. BTC search 开发门禁文档齐备（dev.md + test-data）。
2. 接口签名与输出字段可直接指导后续切片实现。

### Slice S-9：基于 test.data 的多链多接口使用测试脚本

本次只做：

1. 新增 `test/modules/search-engine/run.test.mjs`（手工运行脚本，非单元断言）。
2. 脚本读取 `test.data.md`，抽取 token / 地址样本。
3. 通过 `createDefaultSearchEngine()` 执行三类 domain：`token` / `trade` / `address`。
4. 覆盖三链：BTC / EVM / TRX，并输出按 domain 与链路的统计摘要。

本次不做：

1. 把该脚本纳入 CI 强断言（避免外部源波动导致不稳定）。
2. 修改 search-engine 核心排序或路由逻辑。

验收标准：

1. `node src/test/modules/search-engine/run.test.mjs` 可执行。
2. 输出包含每个 case 的 `ok/count/error` 与总览统计。
3. 失败 case 不中断整体运行，便于排查外部源问题。

### Slice S-10：投资组合分析全流程测试（API 瓶颈监测）

本次只做：

1. 创建 `test/modules/search-engine/portfolio-analysis.test.mjs` 端到端测试脚本。
2. 实现完整流程：
   - Step 1: searchToken() 获取各 token 信息
   - Step 2: 通过 token-price 统一价格入口获取各 token 价格（先解析 token，再按链路取价）
   - Step 3: searchAddress() 获取各地址资产列表
   - Step 4: 针对地址资产，优先按 tokenAddress / native symbol 再次获取完整价格
   - Step 5: 计算资产价值（quantity × price）
   - Step 6: 标注 EVM 高风险（price=0）的 token
3. 监测 API 性能指标：
   - 总请求数与去重后请求数对比
   - 响应时间分布（min/avg/max/p95）
   - 单链/多链并发对API的压力
   - 是否出现接口抱死/429/timeout 的信号

本次不做：

1. 修改 provider 或 request-engine 实现（只测不改）。
2. 实现请求限流或缓存策略（如果发现瓶颈再优化）。
3. CI 集成（手工测试脚本）。

验收标准：

1. `node src/test/modules/search-engine/portfolio-analysis.test.mjs` 可执行。
2. 输出完整资产列表：{name, quantity, price, value, riskFlag}。
3. 分链输出投资组合总价值与资产分布。
4. API 监测报告包含：request_count, dedup_ratio, response_times, error_rate。
5. 无崩溃、无卡顿（若出现，记录瓶颈信号）。

### Slice S-10b：批量请求模式与并发压力测试

本次只做：

1. 改写 `preloadTokenPrices()` 为批量模式：
   - 收集所有 token（BTC/EVM/TRX）
   - 按链/网络分组后，调用 `queryTokenPriceLiteBatchByQuery()` 批量查价
   - 结果映射到 `tokenPriceMap`
2. 改写步骤 3 资产估值的价格查询为批量：
   - 收集所有 (chain, network, query) 三元组
   - 按 (chain, network) 分组
   - 对每组调用批量价格接口
3. 保留 PerformanceMonitor 监测能力，统计：
   - 批量请求数 vs 单个请求数的对比
   - 并发能否改善响应时间分布
   - 是否暴露接口稳定性问题（timeout/429/partial-fail）
4. 运行并对比结果：预期请求数 78→30，耗时 30s→10s

本次不做：

1. 修改 queryTokenPrice 或 queryTokenPriceLiteBatchByQuery 源码。
2. 实现请求限流或熔断策略。
3. 修改 address/token search 接口。

验收标准：

1. `preloadTokenPrices()` 改为批量，一次性拉取所有 token 价格。
2. 步骤 3 资产估值也改为批量，收集待查资产后批量查价。
3. 监测输出显示：批量请求数 < 单个请求数，性能提升 ≥ 2 倍。
4. 并发过程中无接口错误 (timeout/429)。
5. 脚本仍可执行、结果正确。

### Slice S-11：Address Context 入口（root search 前置判定）

本次只做：

1. 在 `modules/search-engine` 增加地址前置判定接口：`resolveAddressContext()`。
2. 输入 address 后返回：
   - chain
   - addressType
   - normalizedAddress
   - detectedNetwork
   - availableNetworks（以各链 config + 已注册 provider 为准）
   - providerIds
3. 支持三链最小识别：BTC / EVM / TRX。
4. 仅做本地判定与 provider/配置聚合，不触发资产查询。

本次不做：

1. token scope/root token context 接口。
2. 地址资产查询联动。
3. EVM 合约/EOA 深度链上探测。

验收标准：

1. `createDefaultSearchEngine().resolveAddressContext()` 可用。
2. BTC/TRX/EVM 地址均可返回 chain、addressType、availableNetworks。
3. TRX 地址不再被 BTC 误识别。
4. availableNetworks 受已注册 provider 与 config 共同约束。

### Slice S-12：EVM tokenAddress 先验证网络归属再查价（批量）

本次只做：

1. 在 `portfolio-analysis.test.mjs` 中，针对 EVM token address 查询新增“网络归属预验证”阶段。
2. 预验证仅覆盖非 fork 网络（eth / bsc），通过 EVM metadata batch（multicall）判定该地址是否为该网络 token。
3. 仅对命中网络执行价格批量查询，跳过未命中网络，减少无效 IO。
4. 监测中新增该阶段的请求统计，便于对比优化效果。

本次不做：

1. 修改 `apps/offchain/token-price` 的核心解析算法。
2. 扩展到 polygon/base 等新网络。
3. 在 root search/task 层暴露新 API。

验收标准：

1. EVM address 类型 token 不再默认对所有非 fork 网络盲查价格。
2. 预验证命中后才进入对应网络价格查询。
3. `portfolio-analysis.test.mjs` 可执行且结果正确。
4. 监测输出可看到预验证阶段请求记录。

### Slice S-13：下沉 EVM 地址归属预验证到 token-price 公共层

本次只做：

1. 在 `apps/offchain/token-price/index.mjs` 中，为 EVM address 且未指定 network 的查询增加网络预验证（eth/bsc，非 fork）。
2. 预验证使用 EVM metadata batch（multicall）判定 token 在网络上是否存在。
3. `queryTokenMetaBatch` 走配置候选前先应用预验证结果，避免默认网络误匹配。

本次不做：

1. 修改远程价格源（coingecko/dexscreener）策略。
2. 扩展到更多 EVM 网络。
3. 改 task/root-search 对外协议。

验收标准：

1. EVM address 无 network 时，config 解析优先使用预验证命中的网络。
2. 未命中任何网络时不产生错误的 config 候选。
3. 现有脚本 `portfolio-analysis.test.mjs` 回归通过。

### Slice S-14：预验证结果注入 debugStats，并更新进度记录

本次只做：

1. 在 `resolveConfigCandidates` 中记录 EVM 预验证命中的网络列表，通过函数返回值附带 `_proofNetworks`（可选字段）。
2. 在 `queryTokenMetaBatch` 中，当存在 `_proofNetworks` 时将其注入结果项的 `debugStats.proofNetworks` 字段。
3. 在 `portfolio-analysis.test.mjs` 的监测报告里增加一行：统计所有地址 token 预验证命中的网络分布（eth/bsc 各命中几次）。
4. 更新 dev.md 进度（标记 S-14 完成）。

### Slice S-15：地址余额查询与价格估值接口解耦

本次只做：

1. `searchAddressAssetsTask` 默认只返回余额资产，不触发价格查询。
2. 新增 `searchAddressValuationTask` 专用估值入口（显式执行价格查询）。
3. `searchPortfolioTask` 改为两段流程：先批量查地址资产余额，再集中归集 token 批量估值。
4. 新增 `searchPortfolioValuationTask` 专用估值入口。
5. 增加任务层测试，验证“默认不估值”与“集中估值单次批量查询”。

本次不做：

1. 修改 offchain 价格源优先级与策略。
2. 修改各链资产发现 provider 逻辑。
3. 引入新的缓存键或持久化模型。

验收标准：

1. `searchAddressAssetsTaskWithEngine` 默认不会调用价格查询函数。
2. `searchAddressValuationTask*` 和 `searchPortfolioValuationTask*` 可返回估值结果。
3. `searchPortfolioTaskWithEngine(withPrice=true)` 在多地址场景下只触发一次价格批量查询。

### Slice S-19：run 脚本切换到 search-engine 直连入口（当前切片）

本次只做：

1. 将 `run.addrescheck.test.mjs` 从 `tasks/search` 入口切换到 `createDefaultSearchEngine().resolveAddressContext()`。
2. 保持脚本输出结构兼容（`hits/top`）。

本次不做：

1. 将所有 run 脚本一次性迁移到 search-engine。
2. 改动价格/估值/批量余额 task 入口。

验收标准：

1. `node src/test/modules/search-engine/run.addrescheck.test.mjs` 可执行。
2. 地址判定输出保持可读，且不依赖 `searchAddressCheckTask`。

### Slice S-20：run.balances 脚本半迁移（当前切片）

本次只做：

1. `run.balances.test.mjs` 的地址判定从 `searchAddressCheckTask` 切到 `engine.resolveAddressContext()`。
2. token fallback 从 `searchTask(domain=token)` 切到 `engine.search(domain=token)`。
3. 继续保留 `searchAddressTokenBalancesBatchTask` 作为批量余额 task 编排入口。

本次不做：

1. 批量余额逻辑改成 engine 原生接口（当前无等价 facade）。
2. run.asset/run.test 的 portfolio 与估值调用迁移。

验收标准：

1. `node src/test/modules/search-engine/run.balances.test.mjs` 可执行。
2. 脚本仍输出 token 映射与批量余额结果，且不依赖 `searchAddressCheckTask/searchTask`。

### Slice S-21：run.price 脚本 fuzzy 查询切换到 engine（当前切片）

本次只做：

1. 将 `run.price.test.mjs` 的 fuzzy 查询从 `searchTokenFuzzyTask` 切换到 `engine.search({ domain: "token" })`。
2. 在脚本内按 `chain` 分组生成 `byChain` 结构，保持原输出格式习惯。
3. 保留 `searchTokenPriceBatchTask` 作为价格批量查询入口。

本次不做：

1. 去除 `searchTokenPriceBatchTask` 依赖。
2. 改动 token 价格 task 编排逻辑。

验收标准：

1. `node src/test/modules/search-engine/run.price.test.mjs` 可执行。
2. fuzzy 输出包含 `total` 与 `chains`，并可继续批量查价。

### Slice S-22：地址批量资产列表查询专用脚本（run.asset）

本次只做：

1. 新增 `run.asset.mjs` 手工脚本，专门排查地址资产查询接口。
2. 脚本只读取 `test.data.md` 中 `## address assets test` 段落地址。
3. 逐地址调用 `searchAddressAssetsTask`，批量输出资产列表与总价值。
4. 输出保持对账友好：地址、链路网络、资产条目、qty/price/value。

本次不做：

1. 修改 search/task/provider 业务逻辑。
2. 改动 `run.test.mjs`、`portfolio-analysis.test.mjs`。
3. 接入 CI 强断言。

验收标准：

1. `node src/test/modules/search-engine/run.asset.mjs` 可执行。
2. 只使用 `## address assets test` 地址样本，不混用 `# addresses` 段。
3. 每个地址输出资产列表（最多前 N 条）与 totalValueUsd。

### Slice S-23：地址资产排查阶段临时跳过 EVM 样本

本次只做：

1. 在 `run.asset` 专用脚本中临时跳过 EVM 地址样本。
2. 仅执行 TRX / BTC 地址资产查询，聚焦排查资产缺失问题。
3. 输出中明确展示跳过地址列表，避免误判为查询失败。

本次不做：

1. 修改 EVM provider / search / valuation 逻辑。
2. 修改 `test.data.md` 地址样本内容。
3. 对 TRX/BTC 资产缺失问题做根因修复（下一切片）。

验收标准：

1. `run.asset` 执行时不再请求 EVM 地址。
2. TRX/BTC 地址照常输出资产结果。
3. 日志包含 EVM 跳过统计与地址列表。

### Slice S-24：BTC 地址查询网络别名归一（btc -> mainnet）

本次只做：

1. 在 `tasks/search` 的 BTC 地址 pipeline 中增加网络别名归一：`btc/bitcoin/main -> mainnet`。
2. 在 `run.asset` 脚本中将 BTC 地址网络显式传 `mainnet`。
3. 复跑 BTC 地址样本，确认不再因 network 参数导致 provider 失配。

本次不做：

1. 修改 BTC provider 的资产聚合策略。
2. 改动 TRX/EVM 链路。
3. 调整估值规则。

验收标准：

1. BTC 地址查询不再因 `network=btc` 返回空结果。
2. `run.asset` 中 BTC 地址可得到真实资产列表（若链上确有余额）。

### Slice S-25：TRX 地址资产多源对账（run.asset --debug）

本次只做：

1. 为 `run.asset` 增加 `--debug` 参数。
2. `--debug` 模式下，对 TRX 地址输出：
   - `getaccount.trc20` 原始条目数与非零合约数量
   - tokenBook 扫描命中数量
3. 输出每个来源的样本合约（截断显示），用于人工对账。

本次不做：

1. 修改 TRX resolver 业务逻辑。
2. 修改 tokenBook 数据。
3. 修改任务层返回结构。

验收标准：

1. `node src/test/modules/search-engine/run.asset.test.mjs --debug` 可执行。
2. TRX 地址出现 debug 对账信息。
3. 不影响默认（无 `--debug`）输出。

### Slice S-26：TRX 持仓发现补充 v1/accounts 远程回退

本次只做：

1. 在 TRX `trc20-balance-resolver` 中，当 `wallet/getaccount` 未返回持仓时，增加 `v1/accounts/{address}` 回退。
2. 统一复用现有持仓归一化逻辑，确保输出契约地址与 rawBalance 一致。
3. 保持旧行为兼容：有 `getaccount` 持仓时优先使用原路径。

本次不做：

1. 修改 token 估值规则。
2. 修改 EVM/BTC 资产链路。
3. 修改 `searchAddressAssetsTask` 对外协议。

验收标准：

1. TRX 地址（如 TLa...）在 run.asset 中返回明显多于 tokenBook 的资产数量。
2. `run.asset --debug` 显示 remote nonZeroContracts > 0。
3. 回归测试无新增失败。

### Slice S-27：BTC 地址资产查询失败托底（stale-cache + API_ERROR 可见化）

本次只做：

1. 在 BTC `brc20-balance-resolver` 增加进程内短期缓存（按 address+network，默认 TTL 120s）。
2. 当 BRC20 上游接口失败且本次无可用 BRC20 结果时，返回最近一次成功快照（标记 `stale=true`）。
3. 保留并输出接口错误项（`assetType=error`），确保用户可见失败原因，不再“静默丢资产”。
4. 在 `run.asset` 输出层对 stale 资产打标（`[STALE]`）。

本次不做：

1. 改动 TRX/EVM 资产查询逻辑。
2. 引入新的全局缓存存储（如 Redis / 文件缓存）。
3. 修改 search/task 对外返回结构字段命名。

验收标准：

1. 接口正常时，BTC 地址资产输出与现状一致。
2. 接口失败时，输出中可见 `API_ERROR`，且若存在近期成功快照可返回 stale 资产。
3. `run.asset` 输出中 stale 资产有 `[STALE]` 标记。

### Slice S-28：UniSat 请求重试与无 Key 回退（降低 403/429 抖动）

本次只做：

1. 在 `apps/btc/brc20.mjs` 的 `unisatRequest` 增加重试（最多 2 次）与指数退避。
2. 对可重试状态码（403/429/5xx 等）自动重试，降低短时波动导致的全量失败。
3. 当配置了 API key 且请求仍失败时，尝试一次无 key 回退（可通过参数关闭）。
4. 保持上层 resolver 协议不变，仅提升请求成功率。

本次不做：

1. 修改 `searchTask` / `searchAddressAssetsTask` 返回结构。
2. 接入新的第三方 BRC20 地址持仓数据源。
3. 调整 token 估值策略。

验收标准：

1. `run.asset` 对同一地址多次调用时，BRC20 报错概率下降。
2. 接口失败时仍可见 `API_ERROR`，不回退到静默失败。
3. `src/test/tasks/search/search.test.mjs` 回归通过。

### Slice S-29：BTC BRC20 异源托底（BestInSlot wallet_balances）

本次只做：

1. 新增 BestInSlot 地址 BRC20 持仓 source：`GET /v3/brc20/wallet_balances?address=...`。
2. 在 BTC `brc20-balance-resolver` 中，当 UniSat 无可用 BRC20 结果时，尝试 BestInSlot 托底。
3. 托底失败时保留 `API_ERROR`（stage=`fallback:bestinslot`）可见化，避免静默丢失。
4. 不改变上层 task/search 返回结构。

本次不做：

1. 修改 TRX/EVM 逻辑。
2. 增加持久化缓存（仅保留进程内短期缓存）。
3. 修改估值策略。

验收标准：

1. UniSat 失败且 BestInSlot 可用时，地址仍可返回 BRC20 持仓。
2. BestInSlot 不可用（无 key 或报错）时，输出 `API_ERROR` 且不中断主流程。
3. `src/test/tasks/search/search.test.mjs` 回归通过。

### Slice S-30：BTC BRC20 异源托底追加 OKLink（token-holder/list）

本次只做：

1. 新增 OKLink 地址 BRC20 托底 source，读取 `/api/explorer/v2/btc/inscription/token-holder/list`。
2. 在 `brc20-balance-resolver` 中追加托底顺序：UniSat -> BestInSlot -> OKLink。
3. 保持接口失败可见化：OKLink 不可用时输出 `API_ERROR`（stage=`fallback:oklink`）。
4. 不在代码中硬编码 API key，统一从环境变量读取。

本次不做：

1. 变更 task/search 返回协议。
2. 新增持久化缓存。
3. 修改估值策略。

验收标准：

1. 正常路径回归不受影响（run.asset 可执行）。
2. 主源失败时可看到 fallback 链路的错误阶段（含 `fallback:oklink`）。
3. `src/test/tasks/search/search.test.mjs` 回归通过。

### Slice S-31：BTC BRC20 托底优先级调整（OKLink 首选）

本次只做：

1. 调整 BTC BRC20 异源托底顺序为：UniSat -> OKLink -> BestInSlot。
2. 保持失败可见化不变：任一托底失败继续输出 `API_ERROR`。
3. 不修改 task/search 对外返回结构。

本次不做：

1. 修改估值策略。
2. 修改 TRX/EVM 链路。
3. 新增持久化缓存。

验收标准：

1. 正常路径回归通过。
2. 强制失败路径中可见 `fallback:oklink` 在 `fallback:bestinslot` 之前出现。
3. `src/test/tasks/search/search.test.mjs` 回归通过。

### Slice S-32：OKLink 增量补齐与业务错误可见化

本次只做：

1. OKLink source 对非 0 业务码（如 `VISIT_ALREADY_EXPIRED`）返回明确错误，不再误判为空成功。
2. 当配置了 `OKLINK_API_KEY` 时，BTC resolver 在 UniSat 成功后也尝试 OKLink 增量补齐 ticker。
3. OKLink 增量失败时输出 `API_ERROR`（stage=`enrich:oklink`），便于解释“为什么仍少条目”。

本次不做：

1. 变更 task/search 对外协议。
2. 新增浏览器态鉴权能力。
3. 修改估值策略。

验收标准：

1. OKLink 返回业务错误时，输出中可见 `enrich:oklink` 或 `fallback:oklink` 错误阶段。
2. `src/test/tasks/search/search.test.mjs` 回归通过。

### Slice S-33：临时禁用 OKLink 托底（保留代码，退出链路）

本次只做：

1. 在 BTC `brc20-balance-resolver` 中临时移除 OKLink enrich / fallback 调用。
2. 保留 OKLink source 文件与 `.env` 配置，不删除实现，便于后续恢复。
3. 托底顺序回退为：UniSat -> BestInSlot -> stale-cache -> API_ERROR。

本次不做：

1. 删除 OKLink source 文件。
2. 修改 `.env` 中已有 OKLink 配置。
3. 修改 task/search 对外协议。

验收标准：

1. `run.asset` 回归通过。
2. 输出中不再出现 `enrich:oklink` / `fallback:oklink`。
3. `src/test/tasks/search/search.test.mjs` 回归通过。

### Slice S-34：BTC BRC20 改为 config 优先查询，再补剩余资产

本次只做：

1. 从 BTC tokenBook 读取已配置 BRC20（当前 mainnet 为 ORDI/SATS/RATS）。
2. resolver 先逐个查询这些配置 token，优先保证核心资产可用。
3. 随后调用 summary + 分页补齐其余未命中的 BRC20 资产。
4. 保持异源托底、stale-cache、API_ERROR 机制不变。

本次不做：

1. 扩展 BTC tokenBook 的配置条目数量。
2. 重新启用 OKLink。
3. 修改 task/search 对外协议。

验收标准：

1. 已配置 token 即使 summary 抖动，也优先尝试返回。
2. summary 可继续补齐未配置的剩余资产。
3. `src/test/tasks/search/search.test.mjs` 回归通过。

### Slice S-35：run.asset 切换为 TRX 专项排查模式

本次只做：

1. 在 `run.asset` 中临时跳过 BTC 地址样本，仅执行 TRX 地址。
2. 保留 EVM 跳过逻辑，避免干扰 TRX 排查。
3. `--debug` 模式继续输出 TRX 多源对账信息（remote / tokenBook）。

本次不做：

1. 修改 BTC 资产查询逻辑。
2. 修改 TRX resolver 业务逻辑。
3. 修改 task/search 对外协议。

验收标准：

1. `run.asset --debug` 仅运行 TRX 地址。
2. 输出中明确展示 BTC/EVM 跳过列表。
3. TRX 地址继续输出多源 debug 信息。

本次不做：

1. 修改价格源策略或远程接口。
2. 在 root search / task 层添加新 API。
3. 扩展到 polygon/base 等新网络。

验收标准：

1. `queryTokenMetaBatch` 返回结果中，EVM address 型 token 的 result.debugStats.proofNetworks 有值。
2. `portfolio-analysis.test.mjs` 输出能显示"证明命中网络分布"统计行。
3. 回归测试通过（总请求数与错误率不回退）。

### Slice S-15：提取 ChainTokenAdapter 注册机制，消除 token-price 中硬编码链分支

**背景：**
`token-price/index.mjs` 中多处存在 `if (detected === "evm") ... if (detected === "btc") ... if (detected === "trx")` 的硬编码分支，导致增加新链时需要修改多处核心文件，容易遗漏。

**目标架构：**
- 每条链实现标准适配器接口 `ChainTokenAdapter`，字段包括：
  - `chain`：链标识符
  - `networkNames`：该链对应的 network 名称列表（用于 `inferExpectedChainFromNetwork`）
  - `resolveToken(input)`：从 config 解析 token（输入 { network?, address?, key? }）
  - `proofNetworks`：支持地址归属预验证的网络列表（`[]` 表示不支持）
  - `proofAddressNetworks?(tokenAddress)`：地址归属预验证异步函数（可选）
  - `resolveNativeToken?(network)`：解析原生 token config（可选）
  - `resolveMetadata?(item, options)`：从链上解析 metadata（可选，用于 `resolveFromRemote`）
  - `enrichMetadata?(item, normalized, options)`：补充 metadata 字段（可选，用于 `enrichResolvedMetadata`）
- 新增 `src/apps/offchain/token-price/chain-adapters.mjs`：各链适配器的实现与注册
- `index.mjs` 中的 `resolveConfigCandidates`、`resolveNativeTokenCandidate`、`resolveFromRemote`、`enrichResolvedMetadata`、`inferExpectedChainFromNetwork` 均通过注册表驱动，不再写死链名

**本次只做：**

1. 定义 `ChainTokenAdapter` 接口（JSDoc 注释形式）。
2. 创建 `chain-adapters.mjs`，实现并注册 evm / btc / trx 三条链的适配器。
3. 在 `index.mjs` 中替换以下四处硬编码逻辑为注册表驱动：
   - `inferExpectedChainFromNetwork`（network 名称 → chain 映射）
   - `resolveConfigCandidates` 中的 address/symbol 解析分支
   - `resolveNativeTokenCandidate`（原生 token 解析）
   - `resolveFromRemote` 中的链特化 metadata 解析
   - `enrichResolvedMetadata` 中的链特化补充逻辑
4. 增加新链只需在 `chain-adapters.mjs` 追加一个适配器对象，其余文件不改动。

**本次不做：**

1. 修改 price 查询逻辑（coingecko/dexscreener）。
2. 修改 `queryTokenPriceLiteBatch`、`queryTokenPriceBatch` 等对外 API 签名。
3. 将适配器接口扩展到 search-engine 或 task 层。

**验收标准：**

1. `chain-adapters.mjs` 存在，包含 evm/btc/trx 三个适配器，每个字段齐备。
2. `index.mjs` 中不再出现 `detected === "evm"`、`detected === "btc"`、`detected === "trx"` 的硬编码分支（替换为注册表循环/查找）。
3. `inferExpectedChainFromNetwork` 的 network 名称列表从各适配器 `networkNames` 中聚合而来。
4. `portfolio-analysis.test.mjs` 回归通过（请求数/错误率不回退）。
5. 理论上添加新链只需在 `chain-adapters.mjs` 末尾追加一个对象。

### Slice S-16：上移 chain-adapters 到 apps/ 中心层，token-price 层只做模块扩展

**背景：**
`chain-adapters.mjs` 目前在 `token-price/` 下，包含链身份（networkNames/networkAliases/addressTokenFormat/proofNetworks）与 token-price 专有方法（resolveToken/resolveMetadata/enrichMetadata）的混合定义。随着 search-engine、assets-engine 等模块也需要链路由，若各模块自行维护一份，新增链时容易遗漏。

**目标架构：**

```
src/apps/
  chain-registry.mjs          ← 中心链身份注册表（纯数据，无业务方法）
  offchain/
    token-price/
      chain-adapters.mjs      ← 从中心表 import，追加 token-price 专有方法后导出
```

中心表只定义：
```js
{ chain, networkNames, networkAliases, addressTokenFormat, proofNetworks }
```

token-price 层在中心表基础上扩展：
```js
{ ...base, resolveToken, resolveNativeToken, proofAddressNetworks, resolveMetadata, enrichMetadata }
```

**本次只做：**

1. 新建 `src/apps/chain-registry.mjs`，从现有 `chain-adapters.mjs` 中提取纯链身份字段（chain/networkNames/networkAliases/proofNetworks/addressTokenFormat）注册为 `CHAIN_REGISTRY`。
2. 改写 `token-price/chain-adapters.mjs`：从 `chain-registry.mjs` import 基础定义，仅在此补充 token-price 专有方法，`CHAIN_ADAPTERS` 导出行为不变。
3. `token-price/index.mjs` 的 import 路径不变（只 import `chain-adapters.mjs`），无需改动。

**本次不做：**

1. 让 search-engine 或其他模块接入中心表。
2. 改变 token-price 任何对外 API。
3. 改变 CHAIN_ADAPTERS 的接口字段。

**验收标准：**

1. `src/apps/chain-registry.mjs` 存在，导出 `CHAIN_REGISTRY`（数组）和 `getChainMeta(chain)`。
2. `token-price/chain-adapters.mjs` 中链身份字段来自 `chain-registry.mjs`，不再重复硬编码。
3. `CHAIN_ADAPTERS` 对外接口字段不变，`token-price/index.mjs` 零修改。
4. `portfolio-analysis.test.mjs` 回归通过。

### Slice S-17：tasks/search 接入统一 SearchEngine 入口

**目标：**
新建 `src/tasks/search/` 任务模块，作为所有上层（CLI/API/页面）调用 SearchEngine 的统一入口，屏蔽 provider 装配、参数校验、错误处理细节。

**本次只做：**

1. 新建 `src/tasks/search/index.mjs`，导出 `searchTask(input, context)` 函数：
   - 参数校验：domain（token/trade/address）、query、network（address domain 可选）
   - 内部通过 `createDefaultSearchEngine()` + `registerDefaultSearchProviders()` 装配引擎（单例，首次调用后缓存）
   - 调用 `engine.search()` 并返回标准化结果 `{ ok, domain, query, candidates, error }`
2. 新建 `src/test/tasks/search/search.test.mjs`，覆盖：
   - happy path：token/address 各一个样本
   - invalid：domain 非法、query 为空
3. 不新增任何 provider 实现，复用现有 composition-root

**本次不做：**

1. CLI 层接线（ui.mjs / lon.mjs）
2. 分页、排序配置化
3. 多 domain 并发聚合

**验收标准：**

1. `node --test src/test/tasks/search/search.test.mjs` 通过。
2. `searchTask({ domain: "token", query: "USDT", network: "eth" })` 返回 `{ ok: true, candidates: [...] }`。
3. 非法 domain 返回 `{ ok: false, error: "..." }`，不抛异常。
4. engine 实例在进程内复用（不重复装配）。

### Slice S-19：下沉组合汇总到 tasks/search（run.test 仅走 search 接口）

**目标：**
将 `portfolio-analysis.test.mjs` 中“地址资产汇总 + 价值汇总 + 风险标记”的核心编排下沉到 `tasks/search`，使 `run.test.mjs` 仅通过 search 任务接口即可输出 analysis 同类结果结构。

**本次只做：**

1. 在 `src/tasks/search/index.mjs` 增加 `searchPortfolioTask(input)`：
   - 输入：`addresses[]`，可选 `withPrice`/`timeoutMs`
   - 内部复用 `searchAddressAssetsTask()` 逐地址查询
   - 输出：`byChain` 汇总、`totalValueUsd`、`riskFlags`
2. 新增按职责拆分的 pipeline 文件（非链业务代码不混在 root）：
   - `pipelines/portfolio/summary.mjs`（按链聚合）
   - `pipelines/portfolio/risk.mjs`（风险标记规则）
3. 更新 `run.test.mjs`：新增调用 `searchPortfolioTask()` 的汇总输出段（分链总价值 + 风险数量）。
4. 新增 `src/test/tasks/search/search.test.mjs` 的组合汇总单测（mock engine）。

**本次不做：**

1. 下沉 analysis 的性能监测报表（PerformanceMonitor）。
2. token 预热/预验证命中统计下沉。
3. 引入新链 provider 或修改 apps 层 provider 实现。

**验收标准：**

1. `searchPortfolioTask()` 返回 `byChain`、`totalValueUsd`、`riskFlags`。
2. `run.test.mjs` 可仅通过 search 接口输出组合汇总信息。
3. `src/test/tasks/search/search.test.mjs` 全部通过。
4. 现有 `searchTask` / `searchAddressAssetsTask` 回归不破坏。

### Slice S-20：BTC 估值价格可信度门控（防止组合价值异常放大）

**目标：**
对 `tasks/search` 的资产估值增加链级门控规则，先在 BTC 链生效：native BTC 允许估值，BRC20 等非原生资产默认不估值（价格记 0），避免远程 symbol 误匹配导致组合总值异常放大。

**本次只做：**

1. 在 `pipelines/valuation/btc.mjs` 增加估值门控字段：
   - native: `allowPricing=true`
   - non-native: `allowPricing=false`（默认）
2. 在 `searchAddressAssetsTask` 中接入门控字段：
   - `allowPricing=false` 时不发起价格查询，直接按 `priceUsd=0` 计算。
3. 新增任务层单测：
   - BTC non-native 资产即使价格源返回高价，也不参与估值。
4. 回归 `run.test.mjs` 观察组合总值稳定性。

**本次不做：**

1. BRC20 专属价格源接入。
2. BTC non-native 的白名单定价策略。
3. 其他链（EVM/TRX）的价格门控调整。

**验收标准：**

1. BTC non-native 资产默认 `valueUsd=0`，不再放大组合总值。
2. BTC native 资产估值行为保持不变。
3. `src/test/tasks/search/search.test.mjs` 全部通过。
4. `run.test.mjs` 可运行且组合总值不出现异常数量级。

### Slice S-21：run.test 与 analysis 输出格式对齐（便于人工核对）

**目标：**
将 `run.test.mjs` 的展示模板对齐 `portfolio-analysis.test.mjs`，统一标题、资产行、组合汇总与风险输出格式，降低人工比对成本。

**本次只做：**

1. 统一标题风格（步骤标题/总结标题）。
2. 统一资产行格式：`- {label}: qty=... price=... value=...`。
3. 统一组合汇总格式：`{CHAIN}: total=... assets=...`。
4. 风险输出从仅计数改为明细列表（若存在）。

**本次不做：**

1. 修改分析脚本核心业务逻辑。
2. 引入新的数据源或查询链路。
3. 变更任务层返回结构。

**验收标准：**

1. `run.test.mjs` 输出可与 `portfolio-analysis.test.mjs` 逐段对照。
2. `run.test.mjs` 可运行并完成全部段落。
3. `search.test.mjs` 回归不受影响。

### Slice S-36：Address Context 链级处理器下沉（index 仅遍历）

**目标：**
将 BTC/TRX/EVM 的 address-check 逻辑从 `modules/search-engine/index.mjs` 中拆出，改为“链级 handler 自处理，index 仅 for 遍历调度”。

**本次只做：**

1. 新增 address-context chain handlers 映射（btc/trx/evm）。
2. 每条链在各自 handler 内完成：地址识别、标准化、网络字段组装（`networks/mainnetNetworks/availableNetworks`）。
3. `detectAddressContextItems` 改为按对象遍历调用 handler，不再内嵌链分支实现。
4. 保持 `resolveAddressContext` 对外结构兼容。

**本次不做：**

1. 修改 `resolveAddressContext` 的入参协议。
2. 引入新的链或新 provider 能力类型。
3. 改动 address assets 查询流程。

**验收标准：**

1. `address-context.test.mjs` 全量通过。
2. `search.test.mjs` 回归通过。
3. `index.mjs` 中不再包含 BTC/TRX/EVM 的 address-check 细节分支，只保留统一遍历调度。

### Slice S-37：Address Check 下沉到 apps 各链目录

**目标：**
将 address-check 的链实现从 `modules/search-engine` 下沉到 `apps/{btc|trx|evm}/search`，保持 SearchEngine 中心层仅做 handler 对象遍历与聚合。

**本次只做：**

1. 在 `apps/btc/search`、`apps/trx/search`、`apps/evm/search` 各新增 `address-check.mjs`。
2. 每条链在各自文件内实现地址识别、标准化与网络字段组装。
3. `modules/search-engine/address-context-checkers.mjs` 改为仅做映射导出，不再包含链逻辑实现。
4. 保持 `resolveAddressContext` 输出协议不变（包含 `networks/mainnetNetworks/availableNetworks`）。

**本次不做：**

1. 引入新链 address-check。
2. 调整 search task 参数协议。
3. 修改地址资产查询和估值链路。

**验收标准：**

1. `address-context.test.mjs` 通过。
2. `search.test.mjs` 通过。
3. `modules/search-engine/address-context-checkers.mjs` 中不再出现 BTC/TRX/EVM 的识别细节逻辑。

### Slice S-38：run.addrescheck 脚本接入 test.data 地址样本

**目标：**
新增 address-check 专项运行脚本，直接读取 `test.data.md` 的地址样本，统一走 `search` 的 `address` 域接口，便于快速人工回归。

**本次只做：**

1. 实现 `run.addrescheck.test.mjs` 的 test.data 地址解析。
2. 逐地址调用 `searchAddressCheckTask({ query })`（仅 address-check，不走 `searchTask` pipeline）。
3. 输出每个地址的命中数量与首条候选摘要。

**本次不做：**

1. 修改 address-check 核心逻辑。
2. 增加新的协议字段。
3. 引入额外外部数据源。

**验收标准：**

1. 脚本可执行并读取 `# addresses` 段地址。
2. 所有地址都能得到一条 run 输出（成功或失败）。
3. 输出包含 `chain/network/provider` 关键摘要字段。

### Slice S-39：root 批量余额接口 + run.balances 符号转地址

**目标：**
在 root/search 层新增 `address:token` 批量余额查询接口，并在 `run.balances.test` 中使用 `test.data.md` 的符号样本，先转换为 token 地址后再执行批量查询。

**本次只做：**

1. 新增 `searchAddressTokenBalancesBatchTask` 接口（root 层）。
2. 复用三链已有 batch reader（EVM/TRX/BTC）执行余额查询。
3. 新增 `run.balances.test.mjs`，解析 `## address assets test` 段的符号行与地址行。
4. 在 `run.balances.test` 中将 `SUN USDT TRX / usdt bnb eth` 先转换为 token 地址或 native，再送入 batch 接口。

**本次不做：**

1. 修改 address-search 资产发现主链路。
2. 新增缓存层或持久化结构。
3. 扩展新的链类型。

**验收标准：**

1. `search.test.mjs` 新增 batch task 用例通过。
2. `run.balances.test.mjs` 可执行并输出转换后的 token 地址映射。
3. 批量结果包含 success/failed 汇总。

### Slice S-40：root 层 token 价格查询与模糊发现接口

**目标：**
在 `tasks/search` 新增两个接口，让上层（脚本/CLI/AI）可以直接查询 token 价格或按 symbol 跨链发现 token，无需感知底层 `queryTokenPriceLiteBatchByQuery` / `searchTask` 细节。

**接口设计：**

1. `searchTokenPriceBatchTask({ items })` — 精确价格查询
   - 输入：`items` 为 `"symbol:network"` 字符串或 `{ query, network }` 对象数组
   - 解析 `"symbol:network"` 格式（最后一个冒号切分）
   - 内部调用 `queryTokenPriceLiteBatchByQuery`
   - 输出：`{ ok, items: [{ query, network, chain, symbol, tokenAddress, priceUsd, source, error }] }`

2. `searchTokenFuzzyTask({ query?, queries?, networks? })` — 模糊跨链发现
   - 输入：单个 query 或 queries 数组，可选 networks（默认 `["eth","bsc","mainnet"]`）
   - 按 `(query, network)` 全组合并发调用 `searchTask(domain=token)`
   - 按 `chain:tokenAddress` 去重
   - 输出：`{ ok, queries, candidates, byChain }`

**本次只做：**

1. 在 `tasks/search/index.mjs` 增加两个接口（含 `WithEngine` 版本）。
2. 新建 `run.price.test.mjs`，读取 `## token price` + `## fuzzy` 段，分别调用两个接口并打印结果。

**本次不做：**

1. 修改 `queryTokenPriceLiteBatchByQuery` 或 `searchTask` 内部逻辑。
2. 给 `searchTokenFuzzyTask` 引入排序或权重策略。
3. 接入 CI 强断言。

**验收标准：**

1. `searchTokenPriceBatchTask({ items: [{ query: "usdt", network: "eth" }] })` 返回 `ok=true`，`priceUsd` 有值。
2. `searchTokenFuzzyTask({ query: "aave" })` 返回 `ok=true`，`byChain` 至少含一条 EVM 候选。
3. `run.price.test.mjs` 可执行，精确查询与模糊查询均有输出，失败 case 不中断整体。

### Slice S-41：asset 估值改走 root 价格批量接口（EVM 先行）

**目标：**
在地址资产估值链路中，不再直接调用 `queryTokenPriceLiteBatchByQuery`，改为统一走 root 接口 `searchTokenPriceBatchTask`；先在 `run.asset` 中验证 EVM 估值输出，TRX/BTC 价格分支先注释保留。

**本次只做：**

1. `tasks/search/index.mjs` 中估值批量价格查询改为通过 `searchTokenPriceBatchTaskWithEngine`。
2. 保留 `options.priceBatchQuery` 作为测试注入优先级，避免破坏现有单测。
3. `run.asset.test.mjs` 中 EVM 地址改用估值入口输出 `qty/price/value/total`。
4. `run.asset.test.mjs` 中 TRX/BTC 继续走余额查询，价格逻辑先注释（不启用）。

**本次不做：**

1. 修改 `apps/offchain/token-price` 底层实现。
2. 在 TRX/BTC 生产链路启用估值。
3. 调整 `searchAddressAssetsTask` 与 `searchAddressValuationTask` 的对外协议。

**验收标准：**

1. EVM 估值路径通过 root 价格批量接口完成计算。
2. `run.asset.test.mjs` 可看到 EVM 资产的 `price/value` 与 `totalValueUsd`。
3. TRX/BTC 仍可跑余额列表，且不触发估值分支。

### Slice S-42：run.asset 高风险 token 隐藏与表格展示

**目标：**
在 `run.asset` 输出层对高风险 token 做直接隐藏，避免钓鱼/诱导类资产污染人工核对结果；同时将逐行日志改为表格输出，提升可读性。

**本次只做：**

1. 在 `run.asset.test.mjs` 增加高风险 token 识别规则（关键词/URL 特征）。
2. 命中高风险规则的资产不输出明细行（彻底隐藏）。
3. 将资产明细输出改为 `console.table` 表格形式。
4. 保留汇总信息（如隐藏条数、totalValueUsd）。

**本次不做：**

1. 修改资产查询或估值业务逻辑。
2. 修改 root/search task 的返回结构。
3. 引入新的风控评分服务。

**验收标准：**

1. `run.asset.test.mjs` 输出中不再出现高风险 token 明细。
2. 资产展示改为表格结构，EVM 包含 `qty/price/value`。
3. 脚本可正常执行，且 TRX/BTC 余额查询行为不变。

### Slice S-43：run.asset 估值焦点切换到 TRX（EVM 暂注释）

**目标：**
临时将 `run.asset` 的估值验证焦点从 EVM 切换到 TRX，EVM/BTC 回到余额模式，便于单链排查 TRX 价格与估值结果。

**本次只做：**

1. `run.asset.test.mjs` 中改为 TRX 走 `searchAddressValuationTask`。
2. EVM/BTC 走 `searchAddressAssetsTask`（估值分支注释保留）。
3. `totalValueUsd` 与 `price/value` 表格列仅在 TRX 显示。

**本次不做：**

1. 修改 root 估值接口与任务协议。
2. 调整高风险 token 规则。
3. 同时开启多链估值。

**验收标准：**

1. TRX 地址输出包含 `totalValueUsd` 与 `price/value`。
2. EVM 地址不再输出估值列。
3. 脚本可执行且无新增错误。

### Slice S-44：run.asset 估值焦点切换到 BTC（TRX/EVM 暂注释）

**目标：**
临时将 `run.asset` 的估值验证焦点切换到 BTC，便于单链检查 BTC 资产估值输出。

**本次只做：**

1. `run.asset.test.mjs` 中改为 BTC 走 `searchAddressValuationTask`。
2. TRX/EVM 走 `searchAddressAssetsTask`（估值分支注释保留）。
3. `totalValueUsd` 与 `price/value` 列仅在 BTC 展示。

**本次不做：**

1. 修改 root 估值与价格接口。
2. 调整高风险 token 过滤规则。
3. 同时启用多链估值。

**验收标准：**

1. BTC 地址输出包含 `totalValueUsd` 与 `price/value` 列。
2. TRX/EVM 不输出估值列。
3. 脚本可执行且无新增错误。

### Slice S-45：searchTokenPriceBatchTask 强制 chain 必填

**目标：**
消除 `mainnet` 网络歧义（BTC/TRX），将 `searchTokenPriceBatchTask` 的输入升级为显式链语义：每个 item 必须传 `chain`。

**本次只做：**

1. `searchTokenPriceBatchTaskWithEngine` 对每个 `item` 强制校验 `chain` 非空。
2. 停止接受字符串输入（`"symbol:network"`），仅接受对象输入。
3. `run.price.test.mjs` 的 fuzzy 价格查询补充 `chain` 字段后再调用价格接口。

**本次不做：**

1. 修改底层 `queryTokenPriceLiteBatchByQuery` 实现。
2. 修改 token fuzzy 搜索协议。
3. 调整非价格相关任务接口。

**验收标准：**

1. 缺少 `chain` 的价格请求返回 `ok=false` 并给出参数错误。
2. `run.price.test.mjs` 可执行且 fuzzy 价格查询不再缺 chain。
3. `mainnet` 场景不再出现 BTC/TRX 歧义输入。

### Slice S-46：BTC 非原生估值白名单放开（ORDI/SATS/RATS）

**目标：**
在保持 BTC 非原生默认风控的前提下，先对白名单 ticker（ORDI/SATS/RATS）放开估值，避免全部禁价导致核心资产无法估值。

**本次只做：**

1. `pipelines/valuation/btc.mjs` 增加 BTC 非原生估值白名单。
2. 白名单命中时 `allowPricing=true`，其余非原生仍保持 `allowPricing=false`。
3. 更新/新增 `search.test.mjs` 用例覆盖白名单放开与非白名单禁价。

**本次不做：**

1. 修改 token-price 底层远程源。
2. 引入动态配置中心管理白名单。
3. 放开全部 BRC20 估值。

**验收标准：**

1. ORDI/SATS/RATS 在 BTC 估值路径可获得非零价格（若价格源可用）。
2. 非白名单 BTC 资产仍保持 `priceUsd=0`。
3. `src/test/tasks/search/search.test.mjs` 回归通过。

### Slice S-47：BTC 估值白名单改为 tokens 配置驱动

**目标：**
将 BTC 非原生估值白名单从硬编码迁移为 `apps/btc/config/tokens.js` 的 `BTC_DEFAULT_TOKENS` 配置驱动，后续统一在 token 配置处维护。

**本次只做：**

1. `pipelines/valuation/btc.mjs` 通过 `getBtcTokenBook({ network })` 读取 token 列表。
2. 从 tokenBook 生成可估值 symbol 白名单，替代硬编码 Set。
3. 保持非白名单禁价策略不变。

**本次不做：**

1. 修改 BTC token 配置内容本身。
2. 修改远程价格源策略。
3. 调整其他链估值逻辑。

**验收标准：**

1. BTC 估值白名单来源可追溯到 `BTC_DEFAULT_TOKENS`。
2. 更新 BTC token 配置后，无需改估值代码即可影响白名单行为。
3. `src/test/tasks/search/search.test.mjs` 回归通过。

