# apps/trx/search/trade-search 测试样本

目标：覆盖 `searchTrade` 的 happy / edge / invalid / security 四类样本。

## 地址簿（测试用）

| 标签           | 地址                                       | 说明                        |
|----------------|--------------------------------------------|-----------------------------|
| USDT mainnet   | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t       | mainnet TRC20 USDT 合约     |
| SUN token      | TKkeiboTkxXKJpbmVFbv4a8ov5rAfRDMf9       | SUN 治理 token               |
| 无流动性 token | TFoo0000000000000000000000000000000001    | 虚构地址，用于空结果场景    |

---

## 1. happy-path

### H3-1: USDT → 返回 Tron pairs，字段完整

mock DexScreener 返回：
```json
{
  "pairs": [
    {
      "chainId": "tron",
      "dexId": "justswap",
      "pairAddress": "TPair1111111111111111111111111111111",
      "baseToken": { "address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "symbol": "USDT" },
      "quoteToken": { "symbol": "TRX" },
      "priceNative": "1.001",
      "priceUsd": "1.0001",
      "liquidity": { "usd": 2500000 },
      "volume": { "h24": 890000 }
    }
  ]
}
```

input:
- query: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
- network: mainnet

expected:
- items.length = 1
- items[0].domain = "trade"
- items[0].chain = "trx"
- items[0].network = "mainnet"
- items[0].source = "dexscreener"
- items[0].extra.dexId = "justswap"
- items[0].extra.liquidityUsd = 2500000
- items[0].extra.priceUsd = "1.0001"

### H3-2: 多个 pair → 按 liquidityUsd 降序返回

mock DexScreener 返回 3 个 tron pairs，liquidityUsd 分别为 100, 500, 200

input:
- query: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
- network: mainnet

expected:
- items 排序：500 → 200 → 100
- items[0].extra.liquidityUsd = 500

### H3-3: DexScreener 返回混合链 pairs → 仅保留 tron

mock DexScreener 返回：
- 1 个 chainId="tron" pair
- 1 个 chainId="ethereum" pair
- 1 个 chainId="bsc" pair

input:
- query: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
- network: mainnet

expected:
- items.length = 1
- items[0].chain = "trx"

---

## 2. edge-case

### E3-1: limit = 1 → 只返回流动性最高的一条

mock DexScreener 返回 3 个 tron pairs

input:
- query: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
- network: mainnet
- limit: 1

expected:
- items.length = 1
- items[0] 是流动性最高的 pair

### E3-2: nile 网络 → 直接返回 []（DexScreener 无 nile 数据）

input:
- query: TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf
- network: nile

expected:
- items = []（不调用 DexScreener）

### E3-3: 无 pair 的 token → 返回 []

mock DexScreener 返回 pairs: []

input:
- query: TFoo0000000000000000000000000000000001
- network: mainnet

expected:
- items = []

### E3-4: DexScreener 返回的 tron pairs 全被 liquidity 过滤 → 返回 []

mock DexScreener 返回 tron pairs 均无 liquidity.usd（= 0 或 null）

input:
- query: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
- network: mainnet

expected:
- items 仍返回（不过滤零流动性，只排序），视实现约定

---

## 3. invalid-case

### I3-1: 空 query → 抛 TypeError

input:
- query: ""
- network: mainnet

expected:
- 抛 TypeError

### I3-2: network 未传 → 默认 mainnet（不抛错）

input:
- query: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
（不传 network）

expected:
- 等同 network=mainnet，正常执行

### I3-3: query 不是合法 TRX 地址 → 返回 [] 或抛 TypeError（视约定）

input:
- query: 0xInvalidEVMAddress
- network: mainnet

expected:
- 返回 []（不崩溃）

---

## 4. security-case

### S3-1: DexScreener source 抛含 API key 的错误 → provider 降级，不透出

mock DexScreener source 抛 Error("Request failed: apiKey=DS_SECRET_XYZ")

input:
- query: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
- network: mainnet

expected:
- searchTrade 不抛出
- 返回 []
- 返回值中不含 "DS_SECRET_XYZ"

### S3-2: 超长 query 不崩溃

input:
- query: 512 字符随机字符串
- network: mainnet

expected:
- 返回 []，不抛，不超时
