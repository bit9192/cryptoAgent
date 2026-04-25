# apps/evm/search/trade-search 开发计划

目标：在 EVM 域内提供独立的 trade-search 能力，输入严格为 `tokenAddress + network`，输出流动性与交易对摘要，不依赖 composition root。

## 1. 需求范围

本模块当前需求：

1. 支持按 `tokenAddress` 查询该 token 在指定 `network` 上的 DEX 交易对列表。
2. 输出标准化 `TradeItem` 协议（domain/chain/network/id/title/address/extra）。
3. 支持按流动性排序并限制返回条数（limit）。
4. 预留 trade summary 能力供 tokenRiskCheck 聚合。

本阶段不做：

1. 不做跨网络自动合并（network 必填，多链由上层多次请求）。
2. 不做多跳路由（B -> A -> USDT）搜索与最优路径计算。
3. 不做滑点与可成交性模拟。
4. 不接入 composition root。

## 2. 分层落位

1. apps/evm/search
- trade-provider.mjs：对外 provider 与 orchestrator。

2. apps/offchain/sources
- dexscreener：作为首个远端流动性数据源。

3. test/apps/evm/search/trade-search
- 放置 trade-search 的 dev.md / test-data / *.test.mjs。

## 3. 开发门禁（严格执行）

必须遵循：样本 -> 测试 -> 计划 -> 实现。

进入实现前必须满足：

1. test-data 文件存在且覆盖 happy / edge / invalid / security。
2. trade-search.test.mjs 已建立并能按样本驱动执行。
3. 本 dev.md 已明确本次只做一个切片。

若任一条件不满足：停止实现，先补文档与样本。

## 4. 当前切片计划

### Slice ETS-T1：searchTradePairs 最小闭环（network 必填）

本次只做：

1. 提供 `searchTradePairs({ tokenAddress, network, limit })`。
2. 通过 DexScreener 拉取指定 token 的 pairs。
3. 仅保留指定 network 对应 pairs，按 liquidityUsd 降序返回。
4. 输出标准化 TradeItem。

本次不做：

1. 多跳路径发现。
2. 聚合多个数据源。
3. summary 聚合接口。

验收标准：

1. network 缺失时报参数错误。
2. 仅返回指定 network 的 pairs。
3. limit 生效。
4. 失败时降级为空数组或可预测错误（按测试定义）。

### Slice ETS-T2：getTokenTradeSummary 聚合接口（供 tokenRiskCheck 引用）

本次只做：

1. 提供 `getTokenTradeSummary({ tokenAddress, network, limit })`。
2. 复用 `searchTradePairs` 的结果聚合 summary，不额外发二次网络请求。
3. 输出最小摘要字段：
	- `pairCount`
	- `topDex`
	- `topPairAddress`
	- `priceUsd`（top pair）
	- `liquidityUsd`（top pair）
	- `volume24h`（top pair）
	- `totalLiquidityUsd`
	- `totalVolume24h`
4. network 缺失时抛 TypeError；source 异常时降级为零值摘要。

本次不做：

1. 多跳路径聚合。
2. 多数据源融合权重。
3. 价格可信度评分。

验收标准：

1. network 缺失时报参数错误。
2. 有 pairs 时 summary 与 top-liquidity pair 对齐。
3. 无 pairs 或 source 失败时返回可预测的空摘要，不抛异常。
4. 旧 ETS-T1 测试不回归。

### Slice ETS-T3：两跳路径发现（B -> A -> USDT）

本次只做：

1. 提供 `searchTwoHopRoutes({ tokenAddress, network, targetSymbol, limit })`。
2. 在指定 network 内，先找 token 的第一跳 pairs，再对中间 token 找第二跳 pairs。
3. 第二跳要求包含 `targetSymbol`（默认 `USDT`，大小写不敏感）。
4. 返回标准化 route 列表，包含 `firstHop/secondHop/intermediateToken/bottleneckLiquidityUsd`。

本次不做：

1. 三跳及以上路径搜索。
2. 路径最优报价/滑点计算。
3. 跨 network 路径合并。

验收标准：

1. network 缺失时报参数错误。
2. 存在可行两跳时，返回路径并按 bottleneckLiquidityUsd 降序。
3. 不存在第二跳时返回空数组。
4. 旧 ETS-T1/ETS-T2 测试不回归。

### Slice ETS-T4：dex config + 多源查询编排 + 链上兜底函数解耦

本次只做：

1. 新增 `apps/evm/configs/dexes.js`，按 network 维护 1~3 个常用 dex 配置（factory/router/priority/quotes）。
2. trade-provider 支持多 offchain source 顺序查询并合并结果（去重后统一排序）。
3. 新增独立链上查询函数文件（例如 `trade-onchain-liquidity.mjs`），trade-provider 仅通过注入调用，不内嵌链上细节。
4. 当 offchain 无结果时，默认仍返回空数组；可选开启 onchain fallback（不改变默认行为）。

本次不做：

1. 完整链上 multicall 深检实现。
2. 三跳以上路径搜索。
3. 在 tokenRiskCheck 中直接注入二跳路径细节。

验收标准：

1. dex config 可按 network 读取，至少包含 bsc/eth 的常用 dex。
2. 多 source 同时可用时，可合并返回 trade items。
3. offchain 为空且开启 onchain fallback 时，可调用独立链上函数；未开启时行为不变。
4. 旧 ETS-T1/T2/T3 测试不回归。

### Slice ETS-T5：onchain getPair 改为 multicall 批量请求

本次只做：

1. 在 `trade-onchain-liquidity.mjs` 中将逐条 `factory.getPair(token, quote)` 改为 multicall 批量聚合。
2. 每个 dex 的 `(token, quote[])` 调用使用一次 multicall 请求返回，减少 RPC 次数与超时风险。
3. multicall 子调用失败保持降级（跳过失败项，不抛全局异常）。
4. 保持现有输出结构不变（pairAddress/baseToken/quoteToken 字段兼容）。

本次不做：

1. getReserves 批量查询与 USD 流动性估算。
2. 跨 dex 的并发配额治理。
3. 将 multicall 抽象为通用 trade 层组件。

验收标准：

1. 链上兜底查询不再逐条调用 `getPair`。
2. 在 mock multicall 下可一次返回多 quote 的 pair 结果。
3. 失败子调用不会中断整批查询。
4. 旧 ETS-T1~T4 测试不回归。

### Slice ETS-T6：pair token0/token1/getReserves 并入 multicall

本次只做：

1. 在 `trade-onchain-liquidity.mjs` 中对已命中的 pair 追加批量 multicall：`token0()`、`token1()`、`getReserves()`。
2. 读取 quote 侧储备并在稳定币 quote（USDT/USDC/BUSD/DAI）场景下估算 `liquidity.usd`。
3. 在可识别储备顺序时估算 `priceUsd`（quoteReserve / baseReserve）。
4. 子调用失败继续降级，不中断整批结果。

本次不做：

1. 非稳定币 quote 的 USD 定价（如 WBNB/WETH）
2. 24h volume 链上估算。
3. 跨 dex 批次合并调度优化。

验收标准：

1. 命中 pair 后不再逐个 RPC 调 `token0/token1/getReserves`。
2. mock multicall 下可产出稳定币 quote 的 `liquidityUsd` 与 `priceUsd`。
3. reserve 批量查询失败时保留 pair 基础结果（降级为 null 数值）。
4. 旧 ETS-T1~T5 测试不回归。

### Slice ETS-T7：token decimals 并入 multicall，修正估算精度

本次只做：

1. 在 `trade-onchain-liquidity.mjs` 中对 pair 中涉及的 token 地址追加 `decimals()` 批量 multicall。
2. 优先使用链上 decimals 计算 `priceUsd/liquidityUsd`；无法获取时回退到当前默认值。
3. 保持失败降级：decimals 批量失败不影响 pair 基础返回。

本次不做：

1. WBNB/WETH 的 USD 锚定估值。
2. 将 decimals 查询缓存到跨请求层。
3. 24h volume 的链上估算。

验收标准：

1. 命中 pair 后 decimals 不再逐 token 单独 RPC。
2. 在 mock 非 18 位 decimals 下，`priceUsd/liquidityUsd` 估算结果正确。
3. decimals 批量失败时，pair 结果仍可返回。
4. 旧 ETS-T1~T6 测试不回归。

### Slice ETS-T8：WBNB/WETH quote 链上 USD 锚定

本次只做：

1. 当主 pair quote 为 WBNB/WETH 时，通过同 dex 的 `anchor/stable` 池（如 WBNB/USDT）推导 anchor 的 USD 价格。
2. 将 anchor USD 价格回填到主 pair 的 `priceUsd/liquidityUsd` 估算。
3. 保持降级：anchor 池查询失败时不影响主 pair 基础返回。

本次不做：

1. 跨 dex 的 anchor 结果融合。
2. 使用外部行情源作为 anchor 兜底。
3. 历史 TWAP/抗操纵处理。

验收标准：

1. WBNB/WETH quote 不再固定返回 `priceUsd/liquidityUsd = null`。
2. 在 mock anchor 池可用时，返回非 null 的 USD 估算值。
3. anchor 池失败时结果可降级但不抛异常。
4. 旧 ETS-T1~T7 测试不回归。

## 5. 当前进度 / 下一步

当前进度：

1. 已建立 trade-search 模块开发计划。
2. 已明确 network 必填与 address 输入边界。
3. 已补 testdata.md（覆盖 happy/edge/invalid/security）。
4. 已新增 trade-search.test.mjs 并通过 ETS-T1 测试（4/4）。
5. 已完成 ETS-T1：searchTradePairs（network 必填、network 过滤、按流动性排序、limit 截断）。
6. 已完成 ETS-T2：getTokenTradeSummary（top pair + totals 聚合，network 必填，空摘要降级）。
7. ETS-T1 + ETS-T2 测试通过（7/7）。
8. 已完成 ETS-T3：searchTwoHopRoutes（B -> A -> USDT 两跳发现，按 bottleneckLiquidityUsd 排序）。
9. ETS-T1 + ETS-T2 + ETS-T3 测试通过（10/10）。
10. 已完成 ETS-T4：dex config + 多 source 查询编排 + 链上兜底函数解耦。
11. ETS-T1 + ETS-T2 + ETS-T3 + ETS-T4 测试通过（14/14）。
12. 已完成 ETS-T5：onchain getPair multicall 批量请求。
13. ETS-T1 + ETS-T2 + ETS-T3 + ETS-T4 + ETS-T5 测试通过（16/16）。
14. 已完成 ETS-T6：pair token0/token1/getReserves 并入 multicall，并在稳定币 quote 场景估算 priceUsd/liquidityUsd。
15. ETS-T1 + ETS-T2 + ETS-T3 + ETS-T4 + ETS-T5 + ETS-T6 测试通过（18/18）。
16. 已完成 ETS-T7：token decimals 并入 multicall，估算优先使用链上 decimals。
17. ETS-T1 + ETS-T2 + ETS-T3 + ETS-T4 + ETS-T5 + ETS-T6 + ETS-T7 测试通过（20/20）。
18. 已完成 ETS-T8：WBNB/WETH quote 通过同 dex anchor/stable 池做链上 USD 锚定估算。
19. ETS-T1 + ETS-T2 + ETS-T3 + ETS-T4 + ETS-T5 + ETS-T6 + ETS-T7 + ETS-T8 测试通过（22/22）。

下一步：

1. 评估 decimals 查询的跨请求缓存与批量上限策略，进一步降低 RPC 压力。
2. 评估外部行情源锚定（可选）作为 anchor 失败时兜底路径。

### Slice ETS-T9：decimals 跨请求缓存

本次只做：

1. `searchOnchainLiquidityPairs` 接受 options 注入的 `decimalsCache`（Map 对象）。
2. 查询前先从 cache 中读取已知 token 的 decimals，减少 multicall 中需查询的地址数。
3. 查询结果回写 `decimalsCache`，供下次调用复用。
4. `decimalsCache` 为 null/undefined 时行为与原来完全相同（默认无缓存）。

本次不做：

1. 模块级全局缓存（避免跨测试污染，保持无副作用）。
2. decimals 缓存过期/TTL 机制。
3. 跨 network 缓存共享。

验收标准：

1. 第一次调用时，decimals multicall 正常触发并写入 cache。
2. 第二次调用且 cache 已有所有 token 时，decimals multicall 批次不再触发。
3. 旧 ETS-T1~T8 测试不回归。

### Slice ETS-T10：anchor 失败时外部行情源兜底

本次只做：

1. `searchOnchainLiquidityPairs` 接受 options 注入的 `anchorPriceResolver(symbol: string): Promise<number|null>` 函数。
2. 当 anchor USD 计算结果为空（anchor 池无流动性或查询失败）时，对每个需要锚定的 symbol 调用 resolver 获取 USD 价格。
3. resolver 返回有效数值时，用于 pair 的 `priceUsd/liquidityUsd` 估算。
4. resolver 失败或返回 null 时降级，保持 priceUsd/liquidityUsd = null（不抛异常）。

本次不做：

1. 接入具体行情源（CoinGecko/Binance），仅定义注入接口。
2. resolver 结果写入 anchor 缓存。
3. 跨 dex 的 resolver 结果复用。

验收标准：

1. anchor 池查询失败时，resolver 被调用并用于估算 priceUsd/liquidityUsd。
2. resolver 失败时结果可降级但不抛异常。
3. resolver 未注入时行为与原来完全相同（向后兼容）。
4. 旧 ETS-T1~T8 测试不回归。
