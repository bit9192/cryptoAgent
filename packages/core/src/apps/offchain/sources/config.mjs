import "../../../load-env.mjs";

/**
 * 全局链下数据源配置
 *
 * 配置结构：
 * - 各数据源的启用状态、优先级、认证信息
 * - 缓存策略
 * - 故障转移规则
 * - 性能参数
 */

export const dataSourceConfigs = {
  // CoinGecko - 代币价格和市场数据
  coingecko: {
    enabled: true,
    priority: 1, // 优先级越低越优先
    description: "Token prices, market data, historical data",
    capabilities: ["getPrice", "getTokenInfo", "getMarketData"],
    apiKey: process.env.COINGECKO_API_KEY ?? "", // Pro API key (可选)
    timeout: 5000,
    cacheTTL: 60000, // 1 分钟
    retryAttempts: 3,
    retryDelay: 500,
  },

  // Llama - TVL, 链信息、协议数据
  llama: {
    enabled: true,
    priority: 2,
    description: "Chain TVL, protocol data, DeFi analytics",
    capabilities: ["getChainInfo", "getProtocolData", "getTVL"],
    baseUrl: "https://api.llama.fi",
    timeout: 5000,
    cacheTTL: 300000, // 5 分钟
    retryAttempts: 2,
  },

  // DexScreener - DEX 交易对、实时价格和流动性
  dexscreener: {
    enabled: true,
    priority: 3,
    description: "DEX pairs, token prices, liquidity, trading data",
    capabilities: ["getPrice", "getTokenInfo", "getPairInfo"],
    baseUrl: "https://api.dexscreener.com/latest/dex",
    timeout: 5000,
    cacheTTL: 30000, // 30 秒
    retryAttempts: 2,
  },

  // ChainList - 链信息、RPC 端点
  chainlist: {
    enabled: true,
    priority: 4,
    description: "Chain RPC endpoints, chain metadata",
    capabilities: ["getChainInfo", "getRpcEndpoints"],
    timeout: 3000,
    cacheTTL: 600000, // 10 分钟
    retryAttempts: 2,
  },

  // Etherscan - 以太坊链上数据
  etherscan: {
    enabled: true,
    priority: 5,
    description: "Ethereum blockchain data (tx, contract, ABI)",
    capabilities: ["getTokenInfo", "getContractAbi", "getTxData"],
    apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    baseUrl: "https://api.etherscan.io",
    timeout: 5000,
    cacheTTL: 600000, // 10 分钟
    rateLimit: { requests: 5, period: 1000 }, // 5/s
    retryAttempts: 3,
  },

  // SwapV2 - 链上 reserves 价格兜底
  swapv2: {
    enabled: true,
    priority: 6,
    description: "On-chain V2 reserve pricing",
    capabilities: ["getPrice"],
    timeout: 10000,
    cacheTTL: 10000,
  },

  // DeFiLlama （自定义扩展示例）
  defiLlama: {
    enabled: false,
    priority: 7,
    description: "DeFi protocols, yields, pools",
    capabilities: ["getProtocolData", "getYields"],
    baseUrl: "https://yields.llama.fi",
    timeout: 5000,
    cacheTTL: 600000,
  },
};

/**
 * 故障转移规则
 *
 * 定义每种能力的源优先级顺序
 * 当首选源失败时，按顺序尝试备用源
 */
export const fallbackRules = {
  // 获取价格：优先 CoinGecko，备用 DexScreener、Llama、SwapV2
  getPrice: ["coingecko", "dexscreener", "llama", "swapv2"],

  // 获取链信息：优先 ChainList，备用 Llama
  getChainInfo: ["chainlist", "llama"],

  // 获取 Token 信息：优先 CoinGecko，备用 DexScreener、Etherscan
  getTokenInfo: ["coingecko", "dexscreener", "etherscan"],

  // 获取 DEX Pair 信息：DexScreener
  getPairInfo: ["dexscreener"],

  // 获取 RPC 端点：优先 ChainList
  getRpcEndpoints: ["chainlist"],

  // 获取合约 ABI：Etherscan
  getContractAbi: ["etherscan"],

  // 获取 TVL 数据：Llama
  getTVL: ["llama", "defiLlama"],

  // 获取协议数据：Llama 优先
  getProtocolData: ["llama", "defiLlama"],

  // 获取交易数据：Etherscan
  getTxData: ["etherscan"],

  // 获取 Swap 报价：交给链上 swap 组件处理
  getSwapQuote: ["swapv2"],

  // 获取收益数据：DefiLlama
  getYields: ["defiLlama", "llama"],
};

/**
 * 缓存策略
 *
 * 根据数据类型设置不同的缓存时间
 * - 实时数据（价格）：短缓存
 * - 静态数据（链信息）：长缓存
 */
export const cachePolicies = {
  getPrice: 60000, // 1 分钟
  getTokenInfo: 600000, // 10 分钟
  getChainInfo: 600000, // 10 分钟
  getRpcEndpoints: 3600000, // 1 小时
  getContractAbi: 3600000, // 1 小时
  getTxData: 300000, // 5 分钟
  getTVL: 300000, // 5 分钟
  getProtocolData: 600000, // 10 分钟
  getSwapQuote: 10000, // 10 秒（实时报价）
  getYields: 600000, // 10 分钟（收益变化不频繁）
  getMarketData: 300000, // 5 分钟
  getPairInfo: 30000, // 30 秒
};

/**
 * 重试策略
 */
export const retryStrategies = {
  exponentialBackoff: (attempt, baseDelay = 100) => {
    return baseDelay * Math.pow(2, attempt);
  },

  linearBackoff: (attempt, baseDelay = 100) => {
    return baseDelay * (attempt + 1);
  },

  noRetry: () => 0,
};

/**
 * 健康检查配置
 */
export const healthCheckConfig = {
  interval: 60000, // 每 1 分钟检查一次
  timeout: 10000, // 单次检查超时 10 秒
  consecutiveFailuresThreshold: 3, // 3 次连续失败标记为故障
};

/**
 * 请求配置
 */
export const requestConfig = {
  timeout: 5000, // 默认请求超时
  retryAttempts: 3, // 默认重试次数
  retryDelay: 500, // 默认重试延迟
  userAgent: "contractHelper/1.0.0",
};

export default {
  dataSourceConfigs,
  fallbackRules,
  cachePolicies,
  retryStrategies,
  healthCheckConfig,
  requestConfig,
};
