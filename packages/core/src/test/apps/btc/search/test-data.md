# apps/btc/search 测试样本

## Token Search 样本

### Happy Path (H1)

**H1-1: BRC20 token 命中 - ordi**
```javascript
{
  query: "ordi",
  network: "mainnet",
  expected: {
    symbol: "ORDI",
    name: "Ordinals",
    protocol: "brc20",
    confidence: ≥ 0.9,
  }
}
```

**H1-2: BRC20 token 命中 - sats**
```javascript
{
  query: "sats",
  network: "mainnet",
  expected: {
    symbol: "SATS",
    name: "SATS",
    protocol: "brc20",
    confidence: ≥ 0.9,
  }
}
```

### Edge Cases (E1)

**E1-1: Ticker 大小写混输 - ORDI**
```javascript
{
  query: "ORDI",
  network: "mainnet",
  expected: "应与 ordi 返回同一 token"
}
```

**E1-2: Ticker 大小写混输 - OrDi**
```javascript
{
  query: "OrDi",
  network: "mainnet",
  expected: "应与 ordi 返回同一 token"
}
```

**E1-3: Network 空值时默认到 mainnet**
```javascript
{
  query: "ordi",
  network: undefined,
  expected: "应默认到 mainnet 并返回结果"
}
```

### Invalid Cases (I1)

**I1-1: 空 query**
```javascript
{
  query: "",
  network: "mainnet",
  expected: "应抛错 query 不能为空"
}
```

**I1-2: 不存在的 token**
```javascript
{
  query: "nonexistent_token_xyz",
  network: "mainnet",
  expected: "应返回空数组 []"
}
```

**I1-3: 不支持的 network**
```javascript
{
  query: "ordi",
  network: "unsupported_network",
  expected: "应抛错或返回空"
}
```

### Security Cases (S1)

**S1-1: Provider 错误不泄露敏感信息**
```javascript
{
  scenario: "mock searcher 抛出包含 apiKey/privateKey 的错误",
  expected: "aggregator 应捕获并返回安全的错误信息"
}
```

---

## Address Search 样本（BS-2）

### 地址分类对照表

| 地址 | 前缀 | 格式 | 类型 | capabilities |
|------|------|------|------|------|
| `bc1p8w6zr5e2q60...` | `bc1p` | bech32 v1 | P2TR (Taproot) | native, brc20 |
| `bc1pxl55h9yhj6v3...` | `bc1p` | bech32 v1 | P2TR (Taproot) | native, brc20 |
| `bc1qunzhcu9upxmj...` | `bc1q` | bech32 v0 | P2WPKH (SegWit) | native only |
| `bc1q54n065y35ldf...` | `bc1q` | bech32 v0 | P2WPKH (SegWit) | native only |

### Happy Path (H2)

**H2-1: Taproot 地址分类正确（P2TR）**
```javascript
{
  address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6",
  expected: {
    addressType: "p2tr",
    network: "mainnet",
    capabilities: ["native", "brc20"],
  }
}
```

**H2-2: SegWit 地址分类正确（P2WPKH）**
```javascript
{
  address: "bc1qunzhcu9upxmj2e4fhqzjladhmke8j9spm5dlec",
  expected: {
    addressType: "p2wpkh",
    network: "mainnet",
    capabilities: ["native"],  // 无 brc20
  }
}
```

**H2-3: Taproot 地址触发 native + BRC20 查询**
```javascript
{
  address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6",
  mockResolvers: { native: [btcItem], brc20: [ordiItem] },
  expected: "返回 native + brc20 两类 SearchItem"
}
```

**H2-4: SegWit 地址只触发 native 查询（BRC20 不调用）**
```javascript
{
  address: "bc1qunzhcu9upxmj2e4fhqzjladhmke8j9spm5dlec",
  expected: "BRC20 resolver 不被调用"
}
```

### Edge Cases (E2)

**E2-1: 未指定 network，从地址前缀推断**
```javascript
{
  address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6",
  network: undefined,
  expected: { network: "mainnet" }  // 从 bc1p 推断
}
```

**E2-2: 指定 network=testnet，地址转换为 tb1p...**
```javascript
{
  address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6",
  network: "testnet",
  expected: { address: "tb1p...", network: "testnet" }  // 转换后请求
}
```

**E2-3: 无资产时返回稳定结构（空数组，不抛错）**
```javascript
{
  address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6",
  mockResolvers: { native: [], brc20: [] },
  expected: "返回空数组 []"
}
```

### Invalid Cases (I2)

**I2-1: 空 address**
```javascript
{ address: "", expected: "应抛错 address 不能为空" }
```

**I2-2: 非法 BTC 地址格式**
```javascript
{ address: "not_a_btc_address", expected: "应抛错或返回 []" }
```

**I2-3: EVM 地址格式输入**
```javascript
{ address: "0xdeadbeef1234567890123456789012345678abcd", expected: "应抛错（格式不兼容）" }
```

### Security Cases (S2)

**S2-1: Resolver 错误不泄露 apiKey**
```javascript
{
  scenario: "native/brc20 resolver 抛出含 apiKey 的错误",
  expected: "aggregator 捕获并降级，不透传敏感信息"
}
```

---

## Trade Search 样本（BS-4）

### 数据源说明

| Source | 覆盖范围 | 需要 key |
|--------|---------|---------|
| BestInSlot | 全量 BRC20（含尾部） | `BESTINSLOT_API_KEY` |
| Coinpaprika | 主流 BRC20（ORDI/SATS 等） | 无（免费） |

### Happy Path (H3)

**H3-1: BestInSlot 有 key → 返回 BRC20 market 数据（ORDI）**
```javascript
{
  query: "ordi",
  mockSource: "bestinslot",
  mockReturn: {
    ticker: "ordi", floor_price: 12345, volume_24h: 1500000000,
    holders_count: 26721, listed_count: 1500,
  },
  expected: {
    domain: "trade", chain: "btc", network: "mainnet",
    id: "trade:btc:mainnet:ordi",
    symbol: "ORDI",
    source: "bestinslot",
    extra: { protocol: "brc20", floorPrice: 12345 }
  }
}
```

**H3-2: 无 key → Coinpaprika 兜底（ORDI/SATS 有数据）**
```javascript
{
  query: "ordi",
  mockSource: "coinpaprika",
  mockReturn: { id: "ordi-ordinals", name: "Ordinals", symbol: "ORDI",
    quotes: { USD: { price: 8.5, volume_24h: 56000000, market_cap: 85000000, percent_change_24h: 0.58 } }
  },
  expected: { source: "coinpaprika", extra: { priceUsd: 8.5 } }
}
```

### Edge Cases (E3)

**E3-1: query 大小写不敏感**
```javascript
{ query: "ORDI" /* 或 "OrDi" */, expected: "与 ordi 查询结果相同" }
```

**E3-2: 尾部 token，BestInSlot 无 key，Coinpaprika 无收录 → 返回 []**
```javascript
{
  query: "some_tail_token",
  bestinslotKey: null,
  coinpaprikaReturn: null,
  expected: []
}
```

**E3-3: BestInSlot 有 key 但返回空 → 降级到 Coinpaprika**
```javascript
{
  query: "sats",
  bestinslotReturn: null,  // 找不到
  coinpaprikaReturn: { priceUsd: 0.00000042 },
  expected: { source: "coinpaprika" }
}
```

### Invalid Cases (I3)

**I3-1: 空 query → 应抛 TypeError**
```javascript
{ query: "", expected: "TypeError: query 不能为空" }
```

### Security Cases (S3)

**S3-1: source 抛含 apiKey 的错误 → 不透传，降级返回 []**
```javascript
{
  scenario: "BestInSlot source 抛出含 apiKey 的错误",
  expected: "trade-aggregator 捕获，降级到下一个 source，不透传敏感信息"
}
```