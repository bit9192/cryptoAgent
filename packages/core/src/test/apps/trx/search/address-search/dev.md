# apps/trx/search/address-search 开发计划

目标：以 TRX 地址为输入，查询 native TRX 余额 + TRC20 资产摘要，输出对齐 SearchItem 统一协议。

## 1. 需求范围

本模块当前需求：

1. 支持 TRX Base58 地址（`T...`，34 字符）输入。
2. 查询 native TRX 余额（`trxBalanceGet`）。
3. 查询已知 TRC20 token 余额（`queryTrxTokenBalance`，token list 来自配置）。
4. 输出标准化 `SearchItem[]`（domain=address / chain=trx / network）。

本阶段不做：

1. Tron 地址资产自动发现（需要 TronGrid 专项 API）。
2. TRC10 / TRC721 / 积分 token 查询。
3. 冻结资源（bandwidth/energy）详情展示。
4. 注册到 composition root（待 provider 稳定后集成）。

## 2. 地址格式说明

TRX 地址统一为 Base58Check（T 开头 34 字符）。无需像 BTC 那样区分地址格式来决定查询能力，所有 TRX 地址均支持：
- native TRX 余额查询
- TRC20 余额查询（用配置 token list）

## 3. 分层落位

1. `apps/trx/search/`
   - `address-provider.mjs` — 对外 provider 与 orchestrator
   - `address-resolver.mjs` — 地址验证 + 并发查询聚合
   - `protocols/native-balance-resolver.mjs` — native TRX 余额（调 `trxBalanceGet`）
   - `protocols/trc20-balance-resolver.mjs` — TRC20 余额（调 `queryTrxTokenBalance`）

2. `apps/trx/balances.mjs` — 现有 `trxBalanceGet`（复用）
3. `apps/trx/assets/balance-batch.mjs` — 现有 `queryTrxTokenBalance`（复用）
4. `apps/trx/config/tokens.js` — 现有 `getTrxTokenBook`（TRC20 token list）

## 4. 对外接口

```javascript
// provider 声明
{
  id: "trx-address",
  chain: "trx",
  networks: ["mainnet", "nile"],
  capabilities: ["address"],
  searchAddress(input: { address, network? }): Promise<SearchItem[]>
}
```

SearchItem 结构（每条资产一条）：

```javascript
// native TRX
{
  domain: "address",
  chain: "trx",
  network: "mainnet",
  id: "address:trx:mainnet:TNxxxxxx:native",
  title: "TRX (native)",
  symbol: "TRX",
  address: "TNxxxxxx",
  source: "trongrid",
  confidence: 0.95,
  extra: {
    protocol: "native",
    balance: "123.456",    // TRX 单位（已除以 1e6）
    exists: true,
  }
}

// TRC20 USDT
{
  domain: "address",
  chain: "trx",
  network: "mainnet",
  id: "address:trx:mainnet:TNxxxxxx:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  title: "Tether USD (USDT)",
  symbol: "USDT",
  address: "TNxxxxxx",
  source: "trongrid",
  confidence: 0.9,
  extra: {
    protocol: "trc20",
    contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    balance: "50.000000",   // 已按 decimals 格式化
    decimals: 6,
  }
}
```

## 5. 当前切片计划

### Slice TAS-1：TRX address-search 最小闭环

本次只做：

1. **protocols/native-balance-resolver.mjs** — native TRX 余额
   - 调用 `trxBalanceGet(address, network)`
   - 返回 native SearchItem

2. **protocols/trc20-balance-resolver.mjs** — TRC20 余额
   - 从 `getTrxTokenBook(network)` 取 token list
   - 对每个 token 调用 `queryTrxTokenBalance`
   - 过滤零余额

3. **address-resolver.mjs** — 地址验证 + 并发聚合
   - 验证 TRX 地址格式（Base58，T 开头，34 字符）
   - native + trc20 并发查询（`Promise.all`）
   - 单个 resolver 失败静默降级（空数组）

4. **address-provider.mjs** — SearchEngine 主入口
   - 参数验证：address 不能为空
   - network 默认 mainnet
   - 返回 SearchItem[]

5. **address-search.test.mjs** — 单元测试
   - 覆盖 happy / edge / invalid / security（依据 test-data.md）
   - mock resolver，不依赖真实网络

本次不做：
1. TRC10 / TRC721 查询
2. 自动 token 发现（TronGrid token API）
3. 注册到 composition root

验收标准：

1. ✅ P2 所有 TRX 地址均返回 native + 已知 TRC20 资产
2. ✅ TRC20 零余额过滤
3. ✅ 单个 resolver 失败不影响其他
4. ✅ 空 address 抛 TypeError
5. ✅ 单元测试 mock resolver，100% 通过

## 6. 当前进度

- ⏳ TAS-1：待实现
