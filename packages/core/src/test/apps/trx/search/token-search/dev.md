# apps/trx/search/token-search 开发计划

目标：在 TRX 域内提供独立的 token-search provider，输入 symbol / name / contractAddress，优先走本地 token 配置（`getTrxTokenBook`），输出对齐 SearchItem 统一协议。

## 1. 需求范围

本模块当前需求：

1. 支持按 symbol / name / contractAddress 检索 TRC20 token。
2. 输出标准化 `SearchItem`（domain=token / chain=trx / network）。
3. 默认优先走本地配置（`getTrxTokenBook`）；链上元数据查询作为后续切片。
4. 网络默认为 mainnet；支持 nile 测试网。

本阶段不做：

1. 链上元数据实时查询（metadata.mjs 接入放后续切片）。
2. Tron 生态索引器集成（TronGrid token list）。
3. trade-search / address-search 实现。
4. composition root 注册（待 provider 稳定后集成）。

## 2. 领域边界约定

- **token-search**（身份与画像）：symbol / name / address 检索，输出 token 基础资料。
- **address-search**（地址资产摘要）：以地址为输入，查询 native TRX + TRC20 持仓。
- **trade-search**（交易可执行性）：查询 Tron 链上 DEX 流动性与价格。

## 3. 分层落位

1. `apps/trx/search/`
   - `token-provider.mjs` — 对外 provider 与 orchestrator
   - `token-resolver.mjs` — 本地配置检索（symbol / name / address 匹配）
   - `token-normalizer.mjs` — 映射到标准 SearchItem

2. `apps/trx/config/tokens.js` — 本地 token book（现有，复用 `getTrxTokenBook`）

3. `test/apps/trx/search/token-search/` — dev.md + test-data + *.test.mjs

## 4. 对外接口

```javascript
// provider 声明
{
  id: "trx-token",
  chain: "trx",
  networks: ["mainnet", "nile"],
  capabilities: ["token"],
  searchToken(input: { query, network?, limit? }): Promise<SearchItem[]>
}
```

SearchItem 结构：
```javascript
{
  domain: "token",
  chain: "trx",
  network: "mainnet",
  id: "token:trx:mainnet:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  title: "Tether USD (USDT)",
  symbol: "USDT",
  address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  source: "config",
  confidence: 1.0,
  extra: {
    name: "Tether USD",
    decimals: 6,
    protocol: "trc20",
  }
}
```

## 5. 当前切片计划

### Slice TTS-1：TRX token-search 最小闭环（配置优先）

本次只做：

1. **token-resolver.mjs** — 本地配置检索
   - 从 `getTrxTokenBook(network)` 读取 token book
   - 支持 symbol 精确匹配（大小写不敏感）
   - 支持 name 模糊匹配（包含匹配）
   - 支持 contractAddress 精确匹配（大小写不敏感）

2. **token-normalizer.mjs** — 结果标准化
   - 映射到统一 SearchItem 格式
   - source 标记为 `"config"`，confidence `1.0`

3. **token-provider.mjs** — SearchEngine provider 入口
   - 参数验证：query 不能为空
   - network 默认 mainnet
   - limit 默认 20，最大 100
   - 内部错误静默降级为 `[]`

4. **token-search.test.mjs** — 单元测试
   - 覆盖 happy / edge / invalid / security（依据 test-data.md）

本次不做：
1. 链上元数据查询（token-metadata.mjs）
2. 注册到 composition root

验收标准：

1. ✅ USDT 可通过 symbol / name / contractAddress 查到
2. ✅ query 大小写不敏感
3. ✅ network 默认 mainnet，可切换 nile
4. ✅ 空 query 抛 TypeError
5. ✅ 单元测试 100% 通过

## 6. 当前进度

- ✅ TTS-1：已完成（本地配置 token-search 最小闭环）。
- ✅ TTS-2：已完成（本地 miss 时 mainnet 远程兜底，非 mainnet 不走远程，可配置禁用远程）。
