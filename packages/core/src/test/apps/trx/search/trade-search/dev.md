# apps/trx/search/trade-search 开发计划

目标：在 TRX 域内提供独立的 trade-search 能力，复用 DexScreener（已支持 Tron 链），输入 contractAddress + network，输出 DEX 流动性与交易对摘要。

## 1. 需求范围

本模块当前需求：

1. 支持按 TRC20 contractAddress 查询该 token 在 Tron 上的 DEX 交易对列表。
2. 输出标准化 `TradeItem`（domain=trade / chain=trx / network）。
3. 按流动性降序排列，支持 limit 截断。
4. 复用 EVM 已有的 `createDexScreenerTradeSource`（DexScreener 原生支持 `tron` 链）。

本阶段不做：

1. 跨链合并（network 必填，多链由上层多次请求）。
2. JustSwap / SunSwap 专项接口（DexScreener 已收录）。
3. 多跳路由搜索。
4. 注册到 composition root（待 provider 稳定后集成）。

## 2. DexScreener Tron 支持说明

DexScreener `GET /latest/dex/tokens/{tokenAddress}` 会返回所有链的 pairs，其中 `chainId = "tron"` 对应 Tron 主网。过滤逻辑：

```
pairs.filter(p => p.chainId === "tron")
```

nile 测试网 DexScreener 无收录，trade-search 仅对 mainnet 有意义。

## 3. 分层落位

1. `apps/trx/search/`
   - `trade-provider.mjs` — 对外 provider 与 orchestrator

2. `apps/offchain/sources/dexscreener/` — 现有 `createDexScreenerTradeSource`（复用 EVM 的）

## 4. 对外接口

```javascript
// provider 声明
{
  id: "trx-trade",
  chain: "trx",
  networks: ["mainnet"],
  capabilities: ["trade"],
  searchTrade(input: { query, network? }): Promise<TradeItem[]>
}
```

TradeItem 结构：
```javascript
{
  domain: "trade",
  chain: "trx",
  network: "mainnet",
  id: "trade:trx:mainnet:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t:pair-addr",
  title: "USDT/TRX (JustSwap)",
  symbol: "USDT",
  address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",  // tokenAddress（query 输入）
  source: "dexscreener",
  confidence: 0.9,
  extra: {
    pairAddress: "...",
    dexId: "justswap",
    priceNative: "1.234",
    priceUsd: "1.0001",
    liquidityUsd: 2500000,
    volume24h: 890000,
    pairLabel: "USDT/TRX",
  }
}
```

## 5. 当前切片计划

### Slice TTS-T1：TRX trade-search 最小闭环（DexScreener）

本次只做：

1. **trade-provider.mjs** — SearchEngine provider 入口
   - 参数验证：query（contractAddress）不能为空
   - 只对 mainnet 有效，nile 直接返回 []
   - 调用 DexScreener，过滤 chainId="tron" 的 pairs
   - 按 liquidityUsd 降序，limit 默认 10

本次不做：
1. JustSwap / SunSwap 直接 API 接入
2. trade summary 聚合
3. 注册到 composition root

验收标准：

1. ✅ TRC20 contractAddress 查询返回 Tron pairs
2. ✅ 仅返回 chainId=tron 的 pairs
3. ✅ limit 生效
4. ✅ nile 返回 []
5. ✅ source 抛错 → provider 降级为 []
6. ✅ 单元测试 mock DexScreener source，100% 通过

## 6. 当前进度

- ⏳ TTS-T1：待实现
