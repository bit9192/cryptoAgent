/**
 * token-price 层 ChainTokenAdapter 注册表
 *
 * 从中心链身份表（chain-registry.mjs）import 基础定义，
 * 在此追加 token-price 专有方法后导出 CHAIN_ADAPTERS。
 *
 * 增加新链：
 *   1. 先在 src/apps/chain-registry.mjs 注册链身份
 *   2. 在本文件末尾追加对应的业务方法扩展，加入 CHAIN_ADAPTERS
 *
 * @typedef {import("../../chain-registry.mjs").ChainMeta & {
 *   resolveToken:          (input: {network?, address?, key?}) => object | null,
 *   resolveNativeToken?:   (network: string) => object | null,
 *   proofAddressNetworks?: (tokenAddress: string) => Promise<string[]>,
 *   resolveMetadata?:      (item: object, options: object) => Promise<object | null>,
 *   enrichMetadata?:       (item: object, normalized: object, options: object) => Promise<object>,
 * }} ChainTokenAdapter
 */

import { getChainMeta } from "../../chain-registry.mjs";
import { resolveEvmToken } from "../../evm/configs/tokens.js";
import { resolveBtcToken } from "../../btc/config/tokens.js";
import { resolveTrxToken } from "../../trx/config/tokens.js";
import { queryEvmTokenMetadataBatch } from "../../evm/assets/token-metadata.mjs";
import { queryTrxTokenMetadata } from "../../trx/assets/token-metadata.mjs";

// ─── EVM ──────────────────────────────────────────────────────────────────────

/** @type {ChainTokenAdapter} */
const evmAdapter = {
  ...getChainMeta("evm"),

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
  ...getChainMeta("btc"),

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
  ...getChainMeta("trx"),

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
// 增加新链：
//   1. 先在 src/apps/chain-registry.mjs 注册链身份
//   2. 在此追加业务方法扩展并加入 CHAIN_ADAPTERS

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
