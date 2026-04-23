# 链下数据查询完整指南

按数据类型分类，展示如何从各个平台获取信息。

---

## 📊 分类一：Token 信息查询

### 需要的信息
- 符号、名称、小数位
- 流通量、市值、排名
- 合约地址
- 官网、社交媒体
- 交易量、价格历史

### 推荐平台

#### 1️⃣ **CoinGecko** ⭐⭐⭐ 最全面
```javascript
import { CoinGeckoSource } from "./sources/coingecko/index.mjs";

const coingecko = new CoinGeckoSource();
await coingecko.init();

// 获取 Token 详细信息
const btc = await coingecko.getTokenInfo("bitcoin");
// {
//   id: "bitcoin",
//   symbol: "btc",
//   name: "Bitcoin",
//   image: "...",
//   market_cap: 1200000000000,
//   market_cap_rank: 1,
//   total_volume: 30000000000,
//   high_24h: 45000,
//   low_24h: 44000,
//   current_price: { usd: 44500, eur: 41000, ... },
//   market_cap_change_percentage_24h: 2.5,
//   ath: { usd: 69000 },
//   atl: { usd: 67 },
//   homepage: ["https://bitcoin.org"],
//   links: {
//     website: ["https://bitcoin.org"],
//     twitter: "https://twitter.com/bitcoin",
//     message_board: "https://bitcointalk.org",
//     reddit: "https://reddit.com/r/bitcoin",
//   },
// }

// TRC-20 Token（TRON 链）
const trxToken = await coingecko.getTokenInfo("binancecoin", {
  chainId: "tron",
});
```

**支持的数据**:
- ✓ 所有链的 Token
- ✓ TRC-20（TRON）代币
- ✓ 价格历史图表
- ✓ 市场数据

---

#### 2️⃣ **Etherscan** ⭐⭐ EVM 链专用
```javascript
import EtherscanAPI from "etherscan-api"; // 需要安装

const etherscan = new EtherscanAPI(process.env.ETHERSCAN_API_KEY);

// 获取 ERC-20 Token 信息
const tokenInfo = await etherscan.account.tokentx({
  contractaddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  page: 1,
  offset: 1,
  sort: "desc",
});

// 结果包含:
// - 转账历史
// - 持有者
// - 交易额
```

**支持的数据**:
- ✓ EVM 链 Token 持有者
- ✓ 转账历史
- ✓ Token 元数据

---

#### 3️⃣ **DexScreener** ⭐⭐ 交易对数据
```javascript
// 查询 DEX 上的 Token 交易对
const pair = await dexscreener.getPair("ethereum", "0x...");

// {
//   chainId: "ethereum",
//   dexId: "uniswap-v3",
//   pairAddress: "0x...",
//   baseToken: {
//     address: "0x...",
//     name: "USDC",
//     symbol: "USDC",
//     decimals: 6,
//   },
//   priceUsd: "0.9999",
//   priceNative: "0.000543",
//   volume24h: 2000000000,
//   liquidity: 500000000,
//   txns: { h24: 45000, h6: 12000, h1: 2000 },
//   priceChange: { h24: 0.12, h6: 0.05, h1: 0.01 },
// }
```

---

#### 4️⃣ **Tronscan** ⭐⭐⭐ TRON 专用
```javascript
// TRON TRC-20 Token 信息
const tokenInfo = await tronscan.getTRC20TokenInfo("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

// {
//   name: "Tether USD",
//   symbol: "USDT",
//   decimals: 6,
//   contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
//   totalSupply: 50000000000000000, // 50B USDT
//   holders: 250000,
//   transfers: 1000000000,
//   logo: "...",
//   website: "https://tether.to",
//   description: "...",
// }
```

**TRON 特点**:
- ✓ TRC-20（ERC-20 等价物）
- ✓ TRC-721（NFT）
- ✓ TRC-1155（多代币）

---

#### 5️⃣ **Covalent** ⭐⭐⭐ 多链聚合
```javascript
import { CovalentAPI } from "covalent-api";

const covalent = new CovalentAPI(process.env.COVALENT_API_KEY);

// 获取账户的 Token 余额（多链）
const balances = await covalent.BalanceService.getTokenBalances("ethereum", "0x...");

// 支持的链包括 TRON！
const tronBalances = await covalent.BalanceService.getTokenBalances("tron-mainnet", "0x...");
```

---

## 💾 分类二：合约信息查询

### 需要的信息
- 合约代码
- ABI（应用二进制接口）
- 创建者、部署交易
- 交易记录
- 验证源代码状态

### 推荐平台

#### 1️⃣ **Etherscan** ⭐⭐⭐ EVM 专用
```javascript
// 获取合约 ABI（最重要）
const abi = await etherscan.contract.getAbi({
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
});
// 返回 JSON ABI，可用于 ethers.js 或 web3.js

// 获取合约源代码
const source = await etherscan.contract.getsourcecode({
  address: "0x...",
});
// {
//   SourceCode: "pragma solidity ^0.8.0; contract MyContract { ... }",
//   ContractName: "MyContract",
//   CompilerVersion: "v0.8.0",
//   OptimizationUsed: "1",
//   Runs: "200",
//   ConstructorArguments: "0x...",
// }

// 获取合约创建信息
const verification = await etherscan.contract.getcontractverification({
  address: "0x...",
});
```

**Etherscan 支持的链**:
- ✓ Ethereum (api.etherscan.io)
- ✓ Polygon (polygonscan.com)
- ✓ BSC (bscscan.com)
- ✓ Arbitrum (arbiscan.io)
- ✓ Optimism (optimistic.etherscan.io)
- ✓ Fantom (ftmscan.com)
- ✓ Gnosis (gnosisscan.io)
- ✗ **TRON 需用 Tronscan**

---

#### 2️⃣ **Tronscan** ⭐⭐⭐ TRON 专用
```javascript
// TRON 合约 ABI
const contractABI = await tronscan.getContractABI("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

// {
//   name: "TetherToken",
//   abi: [...],
//   bytecode: "0x...",
//   sourceCode: "pragma solidity ^0.4.23; contract TetherToken { ... }",
//   compilerVersion: "0.4.23",
//   implementationAddress: "0x...", // for proxy contracts
// }

// 获取合约验证状态
const verified = await tronscan.getContractVerification("TR7NHq...");
```

---

#### 3️⃣ **BlockScout** ⭐⭐ 多链浏览器
```javascript
// API 端点变化，通常遵循 Etherscan 格式
// 但支持更多链

const abi = await fetch(
  "https://blockscout.com/eth/mainnet/api?module=contract&action=getabi&address=0x..."
);
```

**支持链**: Ethereum Classic, Polygon, xDai, Sepolia, 等

---

#### 4️⃣ **Covalent** ⭐⭐ 多链查询
```javascript
// 获取合约日志和事件
const logs = await covalent.EventsService.getLogsForAddress(
  "ethereum",
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  { starting_block: 1, ending_block: "latest" }
);
```

---

## 📈 分类三：项目信息查询

### 需要的信息
- 项目名称、描述、官网
- 社交媒体（Twitter、Discord、GitHub）
- 团队信息
- 融资信息
- 代币经济学

### 推荐平台

#### 1️⃣ **CoinGecko** ⭐⭐⭐ 最全面
```javascript
const btc = await coingecko.getTokenInfo("bitcoin");

// 项目信息包含:
btc.description;        // 项目描述
btc.links.homepage;     // 官网
btc.links.twitter;      // Twitter
btc.links.reddit;       // Reddit
btc.links.github;       // GitHub
btc.links.telegram;     // Telegram
btc.links.discord;      // Discord
btc.links.youtube;      // YouTube

// 团队信息（如有）
btc.developer_data;     // {
                        //   stars: 25000,
                        //   forks: 8000,
                        //   subscribers: 2000,
                        //   commits_4_weeks: 500,
//   community_type: "permissioned",
//   repository_url: "...",
// }

// 代币发行
btc.market_data.total_supply;      // 总供应量
btc.market_data.circulating_supply; // 流通量
btc.market_data.max_supply;         // 最大供应量
```

---

#### 2️⃣ **DexScreener** ⭐⭐ 社区数据
```javascript
// 除了交易信息，还包含社交数据
const info = await dexscreener.search(symbol);

// {
//   pairs: [{
//     baseToken: { ... },
//     quoteToken: { ... },
//     social: {
//       twitter: "https://twitter.com/...",
//       telegram: "https://t.me/...",
//       website: "https://example.com",
//     },
//     info: {
//       imageUrl: "...",
//       websites: [...],
//       socials: [...],
//     }
//   }]
// }
```

---

#### 3️⃣ **Llama** ⭐⭐ DeFi 项目
```javascript
// 获取 DeFi 协议信息
const aave = await llama.getProtocolTVL("aave");

// {
//   name: "Aave",
//   symbol: "AAVE",
//   logo: "...",
//   url: "https://aave.com",
//   description: "Open source liquidity protocol...",
//   tvl: 10000000000,
//   chainTVLs: { ethereum: 5000000000, polygon: ... },
//   audits: [
//     { name: "OpenZeppelin", date: "2023-01-15", url: "..." },
//     { name: "Certora", date: "2023-02-20", url: "..." },
//   ],
// }
```

---

#### 4️⃣ **The Graph** ⭐ 索引数据
```javascript
// GraphQL 查询项目特定数据
query GetUniswapInfo {
  factories(first: 1) {
    id
    pairCount
    txCount
    totalVolumeUSD
    totalValueLockedUSD
  }
}
```

---

## 🔗 分类四：跨链查询（包括 TRON）

### TRON 链特殊处理

TRON 网络与 EVM 不兼容，需要特殊处理：

```javascript
// ❌ 不行
const etherscan = await etherscan.getContractABI("TQN4..."); // 错误

// ✅ 正确
const tronscan = await tronscan.getContractABI("TQN4...");
```

### 跨链查询方案

#### 方案 A: 按链类型分发查询
```javascript
async function getTokenInfo(address, chainId) {
  if (chainId === "tron") {
    return await tronscan.getTRC20TokenInfo(address);
  } else if (chainId === "ethereum") {
    return await etherscan.getTokenInfo(address);
  } else if (chainId === "bsc") {
    return await etherscan.getTokenInfo(address, "bsc"); // BSC Scan
  }
  // ... 其他链
}
```

#### 方案 B: 使用 Covalent（支持多链包括 TRON）
```javascript
// Covalent 自动处理链差异
const balance = await covalent.BalanceService.getTokenBalances(
  chainId, // "ethereum", "bsc", "polygon", "tron-mainnet", ...
  address
);
```

#### 方案 C: 使用我们的 Registry（推荐 ⭐）
```javascript
const manager = new OffchainDataSourceManager();
await manager.init([
  new CoinGeckoSource(),
  new TronScanSource(),
  new EtherscanSource(),
  new CovalentSource(),
]);

// 统一调用，自动处理链的差异
const info = await manager.queryMultiChain(
  ["ethereum", "tron", "bsc"],
  "getTokenInfo",
  "0x..."
);
```

---

## 🎯 使用场景和推荐方案

### 场景 1: 构建 Token 篮子应用（支持多链）
```javascript
// 需求: 获取多个 Token 的实时价格和数据

const manager = new OffchainDataSourceManager();
await manager.init([
  new CoinGeckoSource(),
  new DexScreenerSource(),
  new CovalentSource(),
]);

// ETH 链 USDC
const usdcEth = await manager.getPrice("0xA0b869...", "ethereum");

// TRON 链 USDT
const usdtTron = await manager.getPrice("TR7NHq...", "tron");

// 自动选择最合适的源，若一个失败自动转移
```

---

### 场景 2: 智能合约交互应用
```javascript
// 需求: 获取合约 ABI 用于交互

async function getContractABI(address, chainId) {
  if (chainId === "tron") {
    return await tronscan.getContractABI(address);
  } else {
    return await etherscan.getContractABI(address);
  }
}

// 之后用 ethers.js 创建合约实例
const contract = new ethers.Contract(
  address,
  abi,
  signer
);
```

---

### 场景 3: DeFi 收益聚合器
```javascript
// 需求: 收集所有 DeFi 协议的 APY、TVL 等数据

const protocols = await llama.getAllProtocols();
const topYielding = await yearn.getTopVaults();
const curvePoolsApy = await curve.getPoolAPY();

// 聚合所有数据
const consolidated = {
  defiLlamaProtocols: protocols,
  yarnVaults: topYielding,
  curvePoolsWithApy: curvePoolsApy,
};
```

---

### 场景 4: 钱包资产查询（跨链）
```javascript
// 需求: 查询用户在所有链上的资产

const address = "0x...";
const chains = ["ethereum", "bsc", "polygon", "arbitrum", "tron"];

const allAssets = {};

// 使用 Covalent 支持的多链查询（最简单）
for (const chain of chains) {
  const balances = await covalent.getTokenBalances(chain, address);
  allAssets[chain] = balances;
}

// 或使用 Registry 策略（自动故障转移）
const assets = await registry.query(
  "getBalance",
  (source) => source.getMultiChainBalance(address, chains),
  { sources: ["covalent", "moralis"] }
);
```

---

### 场景 5: 项目信息聚合
```javascript
// 需求: 构建项目概览页面

async function getProjectInfo(tokenSymbol) {
  return {
    // 价格和市场数据
    market: await coingecko.getTokenInfo(tokenSymbol),

    // DeFi 协议 TVL（如果是 DeFi）
    tvlData: await llama.getProtocolTVL(tokenSymbol),

    // 交易对信息
    trading: await dexscreener.search(tokenSymbol),

    // 社交媒体和团队
    social: await coingecko.getTokenInfo(tokenSymbol).links,
  };
}
```

---

## 📋 平台选择决策树

```
我需要查询什么？
│
├─ Token 价格和基本信息？
│  ├─ 所有链都需要 → CoinGecko
│  ├─ 只有 TRON → Tronscan
│  └─ 只有 EVM → Etherscan
│
├─ 合约详情和源代码？
│  ├─ EVM 链 → Etherscan (+ Polygonscan, etc.)
│  ├─ TRON → Tronscan
│  └─ 多链 → Covalent
│
├─ DeFi 协议和 TVL？
│  └─ Llama (DefiLlama)
│
├─ 交易对和 DEX 数据？
│  ├─ 所有链 → DexScreener
│  └─ 兑换报价 → 1Inch
│
├─ 项目信息和社交？
│  └─ CoinGecko
│
└─ 钱包和账户信息？
   ├─ 多链（包括 TRON） → Covalent
   ├─ 仅 EVM → Moralis
   └─ 仅 TRON → Tronscan
```

---

## 🔧 完整集成代码示例

```javascript
import { OffchainDataSourceManager } from "./sources/index.mjs";
import { CoinGeckoSource } from "./sources/coingecko/index.mjs";
import { LlamaSource } from "./sources/llama/index.mjs";
import { ChainListSource } from "./sources/chainlist/index.mjs";

// 1. 初始化
const manager = new OffchainDataSourceManager();
await manager.init([
  new CoinGeckoSource(),
  new LlamaSource(),
  new ChainListSource(),
]);

// 2. 查询 Token 信息（TRON USDT）
const tronUsdt = await manager.getTokenInfo("usdt", {
  chain: "tron",
  contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
});

// 3. 查询 DeFi 数据
const protocols = await manager.query(
  "getProtocolData",
  (source) => source.getAllProtocols(),
  { sources: ["llama"] }
);

// 4. 监控
const health = await manager.getHealthStatus();
const metrics = manager.getMetrics();

console.log(`源状态: ${health.healthySources}/${health.totalSources}`);
console.log(`故障率: ${metrics.failureRate}`);
```

---

这个完整指南涵盖了所有主要的数据查询需求！
