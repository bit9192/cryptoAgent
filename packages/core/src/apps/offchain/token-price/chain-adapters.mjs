/**
 * Chain Token Adapter 注册机制
 *
 * 每条链实现 ChainTokenAdapter 接口并在本文件末尾注册。
 * token-price 公共层通过此注册表驱动所有链特化逻辑，增加新链只需追加一个适配器对象。
 *
 * @typedef {Object} ChainTokenAdapter
 * @property {string}   chain           - 链标识符，e.g. "evm" | "btc" | "trx"
 * @property {string[]} networkNames    - 该链归属的 network 名称列表（用于 inferExpectedChainFromNetwork）
 * @property {string[]} networkAliases  - 额外的别名（如 "ethereum" → evm），用于原始网络名匹配
 * @property {string[]} proofNetworks   - 支持地址归属预验证的网络列表（空数组表示不支持）
 * @property {string}   addressTokenFormat - token address 正则（字符串形式），用于 isRemoteMatchForItem 校验
 * @property {Function} resolveToken    - (input: {network?, address?, key?}) => config | null
 * @property {Function} [resolveNativeToken] - (network: string) => config | null
 * @property {Function} [proofAddressNetworks] - async (tokenAddress: string) => string[]
 * @property {Function} [resolveMetadata] - async (item, options) => resolvedMeta | null
 * @property {Function} [enrichMetadata] - async (item, normalized, options) => normalized
 */

import { resolveEvmToken } from "../../evm/configs/tokens.js";
import { resolveBtcToken } from "../../btc/config/tokens.js";
import { resolveTrxToken } from "../../trx/config/tokens.js";
import { queryEvmTokenMetadataBatch } from "../../evm/assets/token-metadata.mjs";
import { queryTrxTokenMetadata } from "../../trx/assets/token-metadata.mjs";

// ─── EVM ──────────────────────────────────────────────────────────────────────

/** @type {ChainTokenAdapter} */
const evmAdapter = {
  chain: "evm",
  networkNames: ["eth", "bsc", "polygon", "arb", "arbitrum", "op", "optimism", "base", "avax", "linea", "scroll", "zksync"],
  networkAliases: ["ethereum", "evm", "binance-smart-chain"],
  proofNetworks: ["eth", "bsc"],
  addressTokenFormat: "^0x[0-9a-fA-F]{40}$",

  resolveToken(input) {
    return resolveEvmToken(input);
  },

  resolveNativeToken(network) {
    if (network === "bsc") {
      return { chain: "evm", network: "bsc", tokenAddress: "native", symbol: "BNB", name: "BNB", decimals: 18 };
    }
    if (network === "eth") {
      return { chain: "evm", network: "eth", tokenAddress: "native", symbol: "ETH", name: "Ether", decimals: 18 };
    }
    return null;
  },

  async proofAddressNetworks(tokenAddress) {
    const addr = String(tokenAddress ?? "").trim().toLowerCase();
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return [];
    const matched = [];
    for (const network of evmAdapter.proofNetworks) {
      try {
        const res = await queryEvmTokenMetadataBatch([addr], { network });
        const row = Array.isArray(res?.items) ? res.items[0] : null;
        if (!row) continue;
        const hasMetadata = Boolean(row?.symbol || row?.name || Number.isFinite(Number(row?.decimals)));
        if (hasMetadata) matched.push(network);
      } catch {
        // ignore per-network proof error
      }
    }
    return matched;
  },

  async resolveMetadata(item, options) {
    const batchReader = typeof options?.evmMetadataReader === "function"
      ? null
      : (typeof options?.evmMetadataBatchReader === "function" ? options.evmMetadataBatchReader : queryEvmTokenMetadataBatch);

    if (typeof options?.evmMetadataReader === "function") {
      return options.evmMetadataReader(item, options);
    }

    const batchRes = await batchReader([{ token: item.query }], {
      ...(options?.evmMetadataOptions && typeof options.evmMetadataOptions === "object" ? options.evmMetadataOptions : {}),
      network: item.network ?? undefined,
      networkName: item.network ?? undefined,
    });
    const first = batchRes?.items?.[0] ?? null;
    if (first && (first.name != null || first.symbol != null || first.decimals != null)) {
      return {
        chain: "evm",
        network: item.network,
        tokenAddress: item.query,
        name: first.name ?? null,
        symbol: first.symbol ?? null,
        decimals: first.decimals ?? null,
      };
    }
    return null;
  },

  async enrichMetadata(item, normalized, options) {
    const batchReader = typeof options?.evmMetadataBatchReader === "function"
      ? options.evmMetadataBatchReader
      : queryEvmTokenMetadataBatch;
    let meta = null;
    if (typeof options?.evmMetadataReader === "function") {
      meta = await options.evmMetadataReader({
        query: normalized.tokenAddress,
        network: normalized.network ?? item.network,
        kind: "address",
      }, options);
    } else {
      const batchRes = await batchReader([{ token: normalized.tokenAddress }], {
        ...(options?.evmMetadataOptions && typeof options.evmMetadataOptions === "object" ? options.evmMetadataOptions : {}),
        network: normalized.network ?? item.network ?? undefined,
        networkName: normalized.network ?? item.network ?? undefined,
      });
      meta = batchRes?.items?.[0] ?? null;
    }
    if (!meta || typeof meta !== "object") return normalized;
    return {
      ...normalized,
      name: normalized.name ?? (meta.name ?? null),
      symbol: normalized.symbol ?? (meta.symbol ?? null),
      decimals: Number.isFinite(Number(meta.decimals)) ? Number(meta.decimals) : normalized.decimals,
    };
  },
};

// ─── BTC ──────────────────────────────────────────────────────────────────────

/** @type {ChainTokenAdapter} */
const btcAdapter = {
  chain: "btc",
  networkNames: ["btc", "bitcoin", "testnet", "regtest", "signet"],
  networkAliases: [],
  proofNetworks: [],
  addressTokenFormat: null,

  resolveToken(input) {
    return resolveBtcToken(input);
  },

  resolveNativeToken(network) {
    return { chain: "btc", network: network || "mainnet", tokenAddress: "native", symbol: "BTC", name: "Bitcoin", decimals: 8 };
  },
};

// ─── TRX ──────────────────────────────────────────────────────────────────────

/** @type {ChainTokenAdapter} */
const trxAdapter = {
  chain: "trx",
  networkNames: ["mainnet", "nile", "shasta"],
  networkAliases: ["tron", "trx"],
  proofNetworks: [],
  addressTokenFormat: "^T[1-9A-HJ-NP-Za-km-z]{25,34}$",

  resolveToken(input) {
    return resolveTrxToken(input);
  },

  resolveNativeToken(network) {
    if ((network ?? "mainnet") === "mainnet") {
      return { chain: "trx", network: "mainnet", tokenAddress: "native", symbol: "TRX", name: "TRON", decimals: 6 };
    }
    return null;
  },

  async resolveMetadata(item, options) {
    if (typeof options?.trxMetadataReader === "function") {
      return options.trxMetadataReader(item, options);
    }
    const meta = await queryTrxTokenMetadata({
      tokenAddress: item.query,
      network: item.network ?? undefined,
      networkName: item.network ?? undefined,
      callerAddress: options?.trxCallerAddress ?? options?.callerAddress ?? undefined,
    });
    if (!meta || typeof meta !== "object") return null;
    return {
      chain: "trx",
      network: item.network ?? "mainnet",
      tokenAddress: item.query,
      name: meta.name ?? null,
      symbol: meta.symbol ?? null,
      decimals: meta.decimals ?? null,
    };
  },

  async enrichMetadata(item, normalized, options) {
    let meta = null;
    if (typeof options?.trxMetadataReader === "function") {
      meta = await options.trxMetadataReader({
        query: normalized.tokenAddress,
        network: normalized.network ?? item.network ?? "mainnet",
        kind: "address",
      }, options);
    } else {
      meta = await queryTrxTokenMetadata({
        tokenAddress: normalized.tokenAddress,
        network: normalized.network ?? item.network ?? undefined,
        networkName: normalized.network ?? item.network ?? undefined,
        callerAddress: options?.trxCallerAddress ?? options?.callerAddress ?? undefined,
      });
    }
    if (!meta || typeof meta !== "object") return normalized;
    return {
      ...normalized,
      name: normalized.name ?? (meta.name ?? null),
      symbol: normalized.symbol ?? (meta.symbol ?? null),
      decimals: Number.isFinite(Number(meta.decimals)) ? Number(meta.decimals) : normalized.decimals,
    };
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────
// 增加新链：在此追加一个适配器对象即可，其余文件无需修改。

/** @type {ChainTokenAdapter[]} */
export const CHAIN_ADAPTERS = [evmAdapter, btcAdapter, trxAdapter];

/**
 * 根据 chain 标识符查找适配器
 * @param {string} chain
 * @returns {ChainTokenAdapter | undefined}
 */
export function getChainAdapter(chain) {
  return CHAIN_ADAPTERS.find((a) => a.chain === chain);
}
