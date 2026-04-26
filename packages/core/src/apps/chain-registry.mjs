/**
 * 中心链身份注册表
 *
 * 只定义链的身份信息（链识别、网络名称、地址格式），不包含任何业务方法。
 * 各模块（token-price、search-engine、assets-engine 等）从此处 import 后
 * 按需追加自己的业务扩展方法。
 *
 * 增加新链：在本文件末尾的 CHAIN_REGISTRY 数组中追加一个对象即可。
 *
 * @typedef {Object} ChainMeta
 * @property {string}      chain               - 链标识符，e.g. "evm" | "btc" | "trx"
 * @property {string[]}    networkNames        - 该链归属的规范 network 名称列表
 * @property {string[]}    networkAliases      - 外部源/用户可能传入的非规范别名
 * @property {string[]}    proofNetworks       - 支持地址归属预验证的网络列表（空数组表示不支持）
 * @property {string|null} addressTokenFormat  - token address 的正则字符串（null 表示无固定格式）
 */

/** @type {ChainMeta[]} */
export const CHAIN_REGISTRY = [
  {
    chain: "evm",
    networkNames: ["eth", "bsc", "polygon", "arb", "arbitrum", "op", "optimism", "base", "avax", "linea", "scroll", "zksync"],
    networkAliases: ["ethereum", "evm", "binance-smart-chain"],
    proofNetworks: ["eth", "bsc"],
    addressTokenFormat: "^0x[0-9a-fA-F]{40}$",
  },
  {
    chain: "btc",
    networkNames: ["btc", "bitcoin", "testnet", "regtest", "signet"],
    networkAliases: [],
    proofNetworks: [],
    addressTokenFormat: null,
  },
  {
    chain: "trx",
    networkNames: ["mainnet", "nile", "shasta"],
    networkAliases: ["tron", "trx"],
    proofNetworks: [],
    addressTokenFormat: "^T[1-9A-HJ-NP-Za-km-z]{25,34}$",
  },
];

/**
 * 根据 chain 标识符查找中心链身份定义
 * @param {string} chain
 * @returns {ChainMeta | undefined}
 */
export function getChainMeta(chain) {
  return CHAIN_REGISTRY.find((c) => c.chain === chain);
}
