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
4. 进入各链真实 provider 替换切片（先 EVM contract/address）
5. 进入 tasks/search 接入统一 SearchEngine 入口

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
