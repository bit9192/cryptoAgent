# apps/btc/search 开发计划

目标：以 EVM search 接口为模板，先建立 BTC search 的统一 provider 接口与最小闭环切片。

## 1. 需求范围

1. 提供 BTC token-search（以 BRC20 ticker 为主）能力。
2. 提供 BTC address-search（地址资产摘要）能力。
3. 提供 BTC trade-search（BRC20 市场价格查询）能力。
4. 输出结构对齐 modules/search-engine 的统一 SearchItem/SearchResult 协议。
5. 保持注册注入模式，由 composition root 装配，不在 SearchEngine 核心写 BTC 分支。

## 2. 当前切片计划

### Slice BS-0：接口与样本先行（仅文档）

本次只做：

1. 明确 BTC search provider 对外接口：`searchToken`、`searchAddress`。
2. 定义 BTC 候选输出字段（domain/chain/network/id/title/address/extra）。
3. 建立 test-data，覆盖 happy/edge/invalid/security。

本次不做：

1. 实现 BTC search provider 代码。
2. 接入 mempool/blockbook 远端索引。
3. 接入 tasks/search 或 CLI。

验收标准：

1. dev.md 与 test-data.md 齐备。
2. 字段定义可直接指导 BS-1 开发。

### Slice BS-1：BTC token search 协议拆解实现

**注意**：BTC 协议快速演进（BRC20 → Runes → 未知协议），设计上采用协议可插拔架构。

本次只做：

1. **token-aggregator.mjs** — 协议聚合层
   - 管理多个 searcher 的注册、调用、结果聚合
   - 支持单个协议失败不影响其他

2. **protocols/brc20-searcher.mjs** — BRC20 查询器
   - 实现 BRC20 token 查询逻辑
   - 使用本地 `apps/btc/config/tokens.js`
   - 输出统一的 SearchItem 格式

3. **token-provider.mjs** — SearchEngine provider 主入口
   - 组装 token-aggregator 
   - 暴露 `searchToken()` 方法给 SearchEngine

4. **test/btc/search/token-search.test.mjs** — 单元测试
   - Happy: H1 (BRC20 token 命中) + H1-edge (大小写)
   - Edge: E1 (network 默认值)
   - Invalid: I1 (空 query) + I2 (非法输入)
   - Security: S1 (错误信息安全)

本次不做：

1. address-search 实现（下个切片）。
2. Runes / 其他协议实现（预留结构）。
3. trade-search 实现。
4. 与 composition root 的注册集成（后续 S-8b）。

验收标准：

1. ✅ BRC20 token 可通过 `searchToken()` 命中
2. ✅ 支持 ticker 大小写混输
3. ✅ 协议拆解架构就位（新增 protocol 仅需补 searcher）
4. ✅ 单元测试覆盖 happy/edge/invalid/security
5. ✅ 测试通过率 100% (8/8)

### Slice BS-2：BTC address search — 地址分类器 + 协议能力过滤

**核心原则**：BTC 地址格式即类型，类型决定查询能力。

本次只做：

1. **address-classifier.mjs** — 地址分类器
   - 使用 `parseBtcAddress` 解析格式、种类、witness version
   - 判断地址能力：Taproot(`bc1p...`)才有 brc20 能力，其他只有 native
   - 若指定 network 与地址不符，使用 `convertBtcAddressNetwork` 转换地址再请求
   - 若未指定 network，从地址前缀推断

2. **protocols/native-balance-resolver.mjs** — native BTC 余额查询
   - 调用 `btcBalanceGet`，所有地址类型都执行

3. **protocols/brc20-balance-resolver.mjs** — BRC20 资产摘要查询
   - 调用 `brc20SummaryGet`，仅当 capabilities 包含 `brc20` 才执行
   - 过滤零余额

4. **address-aggregator.mjs** — 协议聚合层
   - 接收 classifier 结果，按 capabilities 决定调用哪些 resolver
   - 各 resolver 并发，单点失败优雅降级

5. **address-provider.mjs** — SearchEngine 主入口
   - 参数验证（address 不能为空）
   - 调用 classifier → aggregator → 映射 SearchItem[]

本次不做：

1. Runes / Ordinals 资产查询（预留 resolver 槽位）
2. 分页深度查询（BRC20 summary 只取第一页）
3. trade-search 实现
4. 注册到 composition root（后续切片）

验收标准：

1. ✅ P2TR 地址（bc1p...）查询 native + BRC20 两类资产
2. ✅ P2WPKH 地址（bc1q...）只查 native，不调用 BRC20 API
3. ✅ 未指定 network 时从地址前缀推断网络
4. ✅ 指定 network 时转换地址格式后再请求
5. ✅ 单元测试通过（mock resolver，不需要真实网络）

## 5. 文件结构（BS-2 后）

```
apps/btc/search/
├── address-classifier.mjs       # 🔵 地址分类器（格式/网络/能力判断）
├── address-aggregator.mjs       # 🔵 address 协议聚合层（按 capabilities 过滤）
├── address-provider.mjs         # 🔵 SearchEngine address 主入口
├── token-aggregator.mjs         # ✅ token 协议聚合编排
├── token-provider.mjs           # ✅ SearchEngine token 主入口
└── protocols/
    ├── brc20-searcher.mjs       # ✅ BRC20 token 查询器
    ├── brc20-balance-resolver.mjs   # 🔵 BRC20 资产摘要（仅 P2TR）
    ├── native-balance-resolver.mjs  # 🔵 native BTC 余额
    └── runes-balance-resolver.mjs   # 🟡 预留（未来）

test/apps/btc/search/
├── token-search.test.mjs        # ✅ 8/8
├── address-search.test.mjs      # 🔵 BS-2
└── test-data.md                 # 测试样本 & 地址簿
```

## 3. 与中心 SearchEngine 对齐约束

1. provider 必须声明：`id`、`chain=btc`、`networks`、`capabilities`。
2. 必须实现 `searchToken` 或 `searchAddress`（按 capability 对应）。
3. 返回结构必须经过统一字段规范，不直接泄露 provider 原始响应。

## 4. 当前进度 / 下一步

当前进度：

1. ✅ BS-0 完成：接口与样本先行，dev.md + test-data.md 已建立
2. ✅ BS-1 完成：BTC token search 协议拆解实现
   - ✅ token-aggregator.mjs（协议聚合层）
   - ✅ protocols/brc20-searcher.mjs（BRC20 查询器）
   - ✅ token-provider.mjs（SearchEngine provider 主入口）
   - ✅ token-search.test.mjs（8/8 单元测试通过）
   - ✅ 注册到 modules/search-engine/composition-root.mjs
3. ✅ BS-2 完成：BTC address search 地址分类器 + 协议能力过滤
   - ✅ address-classifier.mjs（P2TR/P2WPKH/P2PKH 分类 + network 转换）
   - ✅ protocols/native-balance-resolver.mjs（所有地址类型）
   - ✅ protocols/brc20-balance-resolver.mjs（仅 P2TR/Taproot）
   - ✅ address-aggregator.mjs（按 capabilities 并发聚合）
   - ✅ address-provider.mjs（SearchEngine 主入口）
   - ✅ address-search.test.mjs（11/11 单元测试通过）
4. ✅ BS-3 完成：BTC providers 注册 + 集成测试
   - ✅ composition-root.mjs 注册 createBtcAddressSearchProvider
   - ✅ evm-provider-integration.test.mjs 新增 BTC 断言（7/7）
   - ✅ 全量回归 443/461 pass，8 fail 均为既有（需 fork 的 dapps 测试）

下一步：

1. BS-4：BTC trade search（BRC20 市场价格，顺序降级：BestInSlot → Coinpaprika）
2. 后续：集成到 tasks/search 入口与 CLI 展示

### Slice BS-4：BTC trade search — BRC20 市场价格顺序降级

**核心原则**：BTC 没有 AMM pair，BRC20 价格来自 marketplace floor price。  
有大号 key（BestInSlot）时全量覆盖含尾部 token；无 key 时 Coinpaprika 兜底主流 token。

本次只做：

1. **sources/bestinslot-trade-source.mjs** — BestInSlot BRC20 价格
   - 依赖环境变量 `BESTINSLOT_API_KEY`
   - 无 key 时直接跳过（返回 `null`，不抛错）
   - 覆盖全量 BRC20 含尾部 token
   - endpoint: `GET /v3/brc20/ticker_info?ticker={ticker}`

2. **sources/coinpaprika-trade-source.mjs** — Coinpaprika USD 价格（免费兜底）
   - 无需 key，永远可用
   - 覆盖范围：主流 BRC20（ORDI/SATS 等前几百名）
   - 两步流程：`/v1/search?q={ticker}` → `/v1/tickers/{id}?quotes=USD`
   - 尾部 token 在 Coinpaprika 无收录时返回 `null`（不抛错）

3. **trade-aggregator.mjs** — 顺序降级编排
   - 先调 BestInSlot，有结果则直接返回
   - BestInSlot 无 key / 返回空 / 抛错 → 降级到 Coinpaprika
   - Coinpaprika 也无结果 → 返回 `[]`

4. **trade-provider.mjs** — SearchEngine 主入口
   - `searchTrade({ query, network })` 验证 query 不为空
   - query = BRC20 ticker（如 "ordi"、"SATS"，大小写不敏感）
   - 返回统一 TradeItem[]

本次不做：

1. Runes 价格查询（预留 source 槽位）
2. 注册到 composition root（下一步 BS-4b）
3. run.test.mjs 更新

**TradeItem 格式（BTC market 模型，区别于 EVM pair 模型）**：
```javascript
{
  domain: "trade",
  chain: "btc",
  network: "mainnet",
  id: "trade:btc:mainnet:ordi",
  title: "ORDI (BRC20 Market)",
  symbol: "ORDI",
  source: "bestinslot" | "coinpaprika",
  confidence: 0.85,
  extra: {
    protocol: "brc20",
    // BestInSlot 字段
    floorPrice: 12345,          // satoshi
    volume24h: 1500000000,      // satoshi
    holders: 26721,
    listed: 1500,
    // Coinpaprika 字段
    priceUsd: 8.5,
    volume24hUsd: 56000000,
    marketCapUsd: 85000000,
    percentChange24h: 0.58,
  }
}
```

验收标准：

1. ✅ 有 BestInSlot key → 返回 BestInSlot 结果，不调 Coinpaprika
2. ✅ 无 key → 降级到 Coinpaprika，ORDI/SATS 有结果，尾部返回 []
3. ✅ 两个 source 都失败 → 返回 []，不抛错
4. ✅ query 大小写不敏感
5. ✅ 单元测试 mock source，不依赖真实网络

本次只做：

1. **composition-root.mjs** — 新增 `createBtcAddressSearchProvider` 导入与注册
2. **evm-provider-integration.test.mjs 扩展** — 新增 BTC provider 并存验证：
   - BTC address provider 存在于默认 providers
   - BTC token provider 存在于默认 providers
   - BTC + EVM + TRX providers 在同一 SearchEngine 中共存
   - SearchEngine 可通过 domain=address + chain=btc 调度到 BTC provider

本次不做：

1. tasks/search 集成
2. CLI 展示
3. TRX address search

验收标准：

1. ✅ `createDefaultSearchProviders()` 包含 `btc-address` provider
2. ✅ BTC/EVM/TRX 三链 providers 在 SearchEngine 并存
3. ✅ 集成测试新增 BTC 相关断言全部通过
4. ✅ 全量回归无新增失败
