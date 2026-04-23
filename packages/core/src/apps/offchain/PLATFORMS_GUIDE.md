# 链下数据源平台完整清单

## 📊 数据源分类

按支持的主要功能分类，包括支持的链和使用场景。

---

## 🔹 第一类：基础价格和 Token 信息

### 1. **CoinGecko** ⭐ 推荐
- **官网**: https://www.coingecko.com
- **API**: https://www.coingecko.com/api/documentations/v3
- **支持链**: 所有主流链（通过 `contract_address`）
- **核心功能**:
  - ✓ 加密货币价格（实时 + 历史）
  - ✓ Token 详细信息（符号、流通量、市值）
  - ✓ 市场数据（24h 高低、成交量）
  - ✓ 多链 Token 地址映射
  - ✓ NFT 集合数据
- **支持 TRON**: ✓ trc20 代币查询
- **速率限制**: 10-50 req/min (免费)
- **缓存建议**: 1 分钟

**查询示例**:
```javascript
// 价格
GET /simple/price?ids=bitcoin,ethereum&vs_currencies=usd

// Token 信息
GET /coins/bitcoin

// TRX Token
GET /coins/tron/contract/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

// 多链支持
GET /coins/{chainId}/contract/{contractAddress}
```

---

### 2. **Etherscan API** ⭐ 必须
- **官网**: https://etherscan.io
- **API**: https://docs.etherscan.io
- **支持链**: 
  - Ethereum (eth)
  - Polygon (eth-polygon)
  - BNB Chain (eth-bsc)
  - Arbitrum (eth-arbitrum)
  - Optimism (eth-optimistic)
  - Avalanche (eth-avalanche)
  - Fantom (eth-fantom)
  - Etherscan 支持 8+ 个 EVM 兼容链
- **核心功能**:
  - ✓ 单个合约信息查询
  - ✓ 合约 ABI 获取（必需！）
  - ✓ Token 转账历史
  - ✓ 交易信息
  - ✓ Gas 价格
  - ✓ 钱包余额、交易记录
- **支持 TRON**: ✗ 不支持（TRON 使用 Tronscan）
- **速率限制**: 5 calls/sec
- **缓存建议**: 1 小时

**主要接口**:
```javascript
// 合约 ABI（最常用）
GET https://api.etherscan.io/api
  ?module=contract&action=getabi&address=0x...

// Token 信息
GET /api?module=token&action=tokeninfo&contractaddress=0x...

// 转账历史
GET /api?module=account&action=tokentx

// 账户信息
GET /api?module=account&action=balance&address=0x...
```

---

### 3. **Tronscan API** ⭐ TRON 必备
- **官网**: https://tronscan.org
- **API**: https://tronscan.org/api
- **支持链**: TRON (TRX 生态)
- **核心功能**:
  - ✓ TRC-20/TRC-721 Token 信息
  - ✓ 智能合约 ABI
  - ✓ 交易历史（TRX、Token）
  - ✓ 账户信息和资产
  - ✓ 区块信息
  - ✓ DeFi 协议数据
- **支持 TRON**: ✓ 完全支持
- **速率限制**: 无限制（友好）
- **缓存建议**: 1 小时

**关键接口**:
```javascript
// TRC-20 Token 信息
GET https://trongrid.io/jsonrpc?

// 合约信息
GET https://tronscan.org/api/token_trc20

// 转账
GET https://tronscan.org/api/transfer

// 账户信息
GET https://trongrid.io/v1/accounts/address
```

---

### 4. **BlockScout API** 
- **官网**: https://blockscout.com
- **支持链**: 
  - Ethereum Classic
  - Polygon
  - xDai/Gnosis
  - Sepolia 测试网
  - 多个 L2
  - **TRON**: ✓ 提供 TRON 浏览器
  
- **核心功能**:
  - ✓ 多链合约信息
  - ✓ ABI 查询
  - ✓ 交易验证
  - ✓ Token 信息
  - ✓ 区块浏览
  
- **缓存建议**: 1 小时

---

## 🔹 第二类：DeFi 和 TVL 数据

### 5. **DefiLlama (Llama)** ⭐ 推荐 (已集成)
- **官网**: https://llama.fi
- **API**: https://api.llama.fi/docs
- **支持链**: 12+ 主流链
- **核心功能**:
  - ✓ 协议 TVL（总锁定价值）
  - ✓ 链 TVL 排行
  - ✓ 历史 TVL 数据
  - ✓ DeFi 协议详情
  - ✓ Yield 数据
  - ✓ 跨链桥接数据
  - ✓ 流动性池信息
- **支持 TRON**: ✓ 支持（via Toncoin、TRON 生态）
- **速率限制**: 100+ req/min
- **缓存建议**: 10 分钟

**关键接口**:
```javascript
// 协议 TVL
GET https://api.llama.fi/protocol/aave

// 链 TVL
GET https://api.llama.fi/chains

// 历史数据
GET https://api.llama.fi/v2/historicalChainTvl/ethereum

// 所有协议
GET https://api.llama.fi/protocols
```

---

### 6. **Yearn Finance API**
- **官网**: https://yearn.fi
- **API**: 通过 GraphQL 和 HTTP
- **目标**: Yield 农场收益率
- **核心功能**:
  - ✓ Vault 收益率
  - ✓ 历史收益数据
  - ✓ 策略信息
  - ✓ 用户持仓

---

### 7. **Aave API**
- **官网**: https://aave.com
- **API**: GraphQL 端点
- **核心功能**:
  - ✓ 借贷利率
  - ✓ 市场数据
  - ✓ 风险参数
  - ✓ 协议统计

---

## 🔹 第三类：交易对和 DEX 数据

### 8. **DexScreener API** ⭐ 交易对热门数据
- **官网**: https://dexscreener.com
- **API**: https://docs.dexscreener.com
- **支持链**: 50+ 链（包括 TRON）
- **核心功能**:
  - ✓ 交易对实时价格
  - ✓ 24h 涨跌、成交量
  - ✓ 流动性信息
  - ✓ 交易历史
  - ✓ 价格图表数据
  - ✓ Token 社交数据（Twitter、Discord）
- **支持 TRON**: ✓ 支持（SunSwap 等）
- **速率限制**: 无限制
- **缓存建议**: 30 秒

**关键接口**:
```javascript
// 交易对信息
GET https://api.dexscreener.com/latest/dex/pair/{chainId}/{pairAddress}

// Token 搜索
GET https://api.dexscreener.com/latest/dex/search?q=SYMBOL
```

---

### 9. **1Inch Aggregator API** ⭐ 交换报价
- **官网**: https://1inch.io
- **API**: https://portal.1inch.dev
- **支持链**: 15+ 链（包括 BSC、Polygon、Arbitrum 等）
- **核心功能**:
  - ✓ 兑换报价和最优路径
  - ✓ 流动性来源
  - ✓ 交易滑点估计
  - ✓ RAW 交易数据
- **支持 TRON**: ✗ 不支持
- **速率限制**: 根据计划
- **缓存建议**: 10 秒

---

### 10. **0x Protocol API**
- **官网**: https://www.0x.org
- **API**: https://0x.org/docs/api
- **支持链**: Ethereum, Polygon, BSC, Arbitrum 等
- **核心功能**:
  - ✓ 交换报价
  - ✓ 最优交易路径
  - ✓ 流动性数据

---

## 🔹 第四类：多链数据聚合

### 11. **Moralis API** ⭐ 全功能
- **官网**: https://moralis.io
- **API**: https://docs.moralis.io
- **支持链**: 10+ 公链 + 测试网
- **核心功能**:
  - ✓ 账户余额（原生币 + Token）
  - ✓ Token 转账历史
  - ✓ NFT 持仓和元数据
  - ✓ 交易信息（详细）
  - ✓ 智能合约交互
  - ✓ Wallet 信息
  - ✓ DeFi 数据
- **支持 TRON**: ✗ 不支持 TRON
- **速率限制**: 根据计划
- **缓存建议**: 1 小时

**主要功能**:
```javascript
// 账户余额
GET /api/v2/:address/balance

// Token 转账
GET /api/v2/:address/erc20/transfers

// NFT 收集
GET /api/v2/:address/nft

// 交易历史
GET /api/v2/:address/transactions
```

---

### 12. **The Graph (Subgraph)** ⭐ 协议数据查询
- **官网**: https://thegraph.com
- **API**: GraphQL
- **支持链**: Ethereum, Arbitrum, Polygon, Optimism, Avalanche 等
- **核心功能**:
  - ✓ 查询任何已索引协议的数据
  - ✓ 历史数据和统计
  - ✓ 实时事件订阅
  - ✓ 自定义 Subgraph
- **支持 TRON**: ✗ 不支持
- **缓存建议**: 1 分钟

**示例**:
```graphql
{
  swaps(first: 100, where: { token0: "0x..." }) {
    id
    amount0
    amount1
    amountUSD
    timestamp
  }
}
```

---

### 13. **Covalent API** ⭐ 多链数据聚合
- **官网**: https://www.covalenthq.com
- **API**: https://covalenthq.com/docs
- **支持链**: 30+ 公链（包括 TRON！）
- **核心功能**:
  - ✓ 账户余额和历史
  - ✓ Token 转账
  - ✓ 交易日志
  - ✓ 钱包投资组合
  - ✓ DeFi 数据
  - ✓ NFT 信息
  - ✓ 跨链查询
- **支持 TRON**: ✓ 完全支持！
- **速率限制**: 根据计划
- **缓存建议**: 10 分钟

**关键接口**:
```javascript
// 账户余额
GET /v1/{chainId}/address/{address}/balances_v2/

// 交易
GET /v1/{chainId}/address/{address}/transactions_v3/

// Asset 信息
GET /v1/pricing/historical_by_address_v2/{chainId}/{address}/

// TRON 支持
chainId: "tron-mainnet", "tron-testnet"
```

---

## 🔹 第五类：特定功能平台

### 14. **OpenSea API** （NFT）
- **官网**: https://opensea.io
- **核心功能**:
  - ✓ NFT 集合信息
  - ✓ 交易历史
  - ✓ 随机 NFT 属性

---

### 15. **Alchemy API** （RPC + 增强数据）
- **官网**: https://www.alchemy.com
- **支持链**: Ethereum, Polygon, Arbitrum, Optimism, 等
- **核心功能**:
  - ✓ 增强的 RPC
  - ✓ NFT API
  - ✓ Token API
  - ✓ Notify API

---

### 16. **Infura API** （RPC 提供商）
- **官网**: https://infura.io
- **核心功能**:
  - ✓ 标准 RPC 端点
  - ✓ Ethereum IPFS 网关

---

### 17. **QuickNode API**
- **官网**: https://quicknode.com
- **核心功能**:
  - ✓ RPC 端点
  - ✓ NFT API
  - ✓ 增强的数据

---

## 🔹 第六类：链信息平台

### 18. **ChainList** ⭐ 已集成
- **官网**: https://chainid.network
- **API**: JSON 数据
- **核心功能**:
  - ✓ 区块链元数据
  - ✓ RPC 端点列表
  - ✓ 区块浏览器链接
  - ✓ 链 ID 映射

---

### 19. **Cosmos Chain Registry**
- **官网**: https://github.com/cosmos/chain-registry
- **核心功能**:
  - ✓ Cosmos 生态链信息
  - ✓ 验证节点信息

---

## 🔹 第七类：Gas 和网络费用

### 20. **Etherscan Gas Tracker API**
- 已包含在 Etherscan
- **功能**:
  - ✓ 实时 Gas 价格
  - ✓ 历史 Gas 数据

---

## 📋 平台对比表格

| 平台 | Token价格 | 合约信息 | Token信息 | TVL | 交易对 | 多链 | TRON | 推荐 |
|------|---------|--------|---------|-----|-------|------|------|------|
| CoinGecko | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ⭐⭐⭐ |
| Etherscan | ❌ | ✅✅ | ⚠️ | ❌ | ❌ | ✅ | ❌ | ⭐⭐⭐ |
| Tronscan | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ⭐⭐⭐ |
| Llama | ❌ | ❌ | ❌ | ✅✅ | ❌ | ✅ | ✅ | ⭐⭐⭐ |
| DexScreener | ✅ | ❌ | ✅ | ❌ | ✅✅ | ✅ | ✅ | ⭐⭐⭐ |
| 1Inch | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ⭐⭐ |
| Moralis | ⚠️ | ⚠️ | ✅ | ❌ | ❌ | ✅ | ❌ | ⭐⭐ |
| The Graph | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ❌ | ⭐⭐ |
| **Covalent** | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⭐⭐⭐ |
| ChainList | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ⭐⭐ |

---

## 🎯 按用途推荐方案

### 1️⃣ **查询单个 Token 价格**
推荐: **CoinGecko** ⭐⭐⭐
```javascript
// 支持 TRON TRC-20
GET /coins/{chainId}/contract/{tokenAddress}
```

### 2️⃣ **获取合约 ABI（EVM 链）**
推荐: **Etherscan API** ⭐⭐⭐
```javascript
// 所有 EVM 兼容链都有对应的 Etherscan
GET /api?module=contract&action=getabi&address=0x...
```

### 3️⃣ **查询 TRON 合约信息和代币**
推荐: **Tronscan API** ⭐⭐⭐
```javascript
// TRC-20 Token 信息、转账历史
www.trongrid.io / tronscan.org
```

### 4️⃣ **获取 DeFi 协议 TVL**
推荐: **DefiLlama (Llama)** ⭐⭐⭐
```javascript
GET https://api.llama.fi/protocol/{protocolName}
```

### 5️⃣ **查询交易对、DEX 数据**
推荐: **DexScreener** ⭐⭐⭐
```javascript
GET /latest/dex/pair/{chainId}/{pairAddress}
```

### 6️⃣ **获取交换报价**
推荐: **1Inch** ⭐⭐
```javascript
GET /v5.0/{chainId}/quote?{params}
```

### 7️⃣ **多链钱包数据聚合（除 TRON）**
推荐: **Moralis API** ⭐⭐⭐
```javascript
GET /api/v2/{address}/balance
```

### 8️⃣ **多链支持，包括 TRON**
推荐: **Covalent API** ⭐⭐⭐
```javascript
GET /v1/{chainId}/address/{address}/balances_v2/
// chainId 支持 "tron-mainnet"
```

### 9️⃣ **查询协议具体交易数据**
推荐: **The Graph** ⭐⭐
```graphql
// GraphQL 查询任何已索引的协议
{
  swaps(first: 100) { ... }
}
```

### 🔟 **链 RPC 端点和元信息**
推荐: **ChainList** ⭐⭐
```javascript
GET https://chainid.network/chains.json
```

---

## 🛠️ 完整集成方案

### 场景 A: EVM 链应用
```javascript
// 1. 价格
CoinGecko.getPrice(["bitcoin", "ethereum"])

// 2. 合约 ABI
Etherscan.getContractABI("0x...")

// 3. TVL
Llama.getProtocolTVL("uniswap")

// 4. 交易对
DexScreener.getPair("ethereum", "0x...")

// 5. 交换报价
OneInch.getQuote({...})
```

### 场景 B: TRON 应用
```javascript
// 1. TRC-20 Token 信息
Tronscan.getTokenInfo("TR7NHq...")

// 2. 合约 ABI
Tronscan.getContractABI("TR7NHq...")

// 3. 钱包数据
Covalent.getBalance("address", "tron-mainnet")

// 4. 交易对
DexScreener.getPair("tron", "0x...")
```

### 场景 C: 多链应用
```javascript
// 支持所有链
Covalent.query({
  chainId: ["ethereum", "polygon", "bsc", "tron-mainnet"],
  address: "0x...",
})
```

---

## ✅ 下一步集成清单

- [x] CoinGecko (已集成)
- [x] ChainList (已集成)
- [x] Llama (已集成 ✨ NEW)
- [ ] Etherscan (待集成)
- [ ] Tronscan (待集成)
- [ ] DexScreener (待集成)
- [ ] 1Inch (待集成)
- [ ] Covalent (待集成)
- [ ] Moralis (可选)
- [ ] The Graph (可选)

