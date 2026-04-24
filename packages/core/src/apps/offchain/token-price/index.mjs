import { detectAddressKind } from "../address-validators.mjs";
import { DexScreenerSource } from "../sources/dexscreener/index.mjs";
import { resolveEvmToken } from "../../evm/configs/tokens.js";
import { resolveBtcToken } from "../../btc/config/tokens.js";
import { resolveTrxToken } from "../../trx/config/tokens.js";
import { queryEvmTokenMetadataBatch } from "../../evm/assets/token-metadata.mjs";
import { queryTrxTokenMetadata } from "../../trx/assets/token-metadata.mjs";
import {
  getCachedTokenMetadataMap,
  putCachedTokenMetadata,
  findCachedTokenMetadata,
} from "../../../modules/assets-engine/token-metadata-cache.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function looksLikeMalformedAddress(query) {
  const value = normalizeString(query);
  if (!value) return false;
  if (value.startsWith("0x")) {
    return !/^0x[a-fA-F0-9]{40}$/.test(value);
  }
  if (/^T/i.test(value)) {
    return !/^T[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value);
  }
  const looksLikeBtcAddress = /^(bc1|tb1|bcrt1)[ac-hj-np-z02-9]{11,71}$/i.test(value)
    || /^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,62}$/.test(value);
  if (looksLikeBtcAddress) {
    return detectAddressKind(value) == null;
  }
  return false;
}

function normalizeItems(input) {
  const list = Array.isArray(input) ? input : [input];
  return list.map((item) => {
    if (typeof item === "string") {
      const query = normalizeString(item);
      if (!query) {
        throw new Error("query 不能为空");
      }
      return { query, network: null, kind: "auto" };
    }
    if (!item || typeof item !== "object") {
      throw new Error("query item 必须是字符串或对象");
    }
    const query = normalizeString(item.query ?? item.address ?? item.symbol ?? item.name ?? item.key);
    if (!query) {
      throw new Error("query 不能为空");
    }
    if (looksLikeMalformedAddress(query)) {
      throw new Error(`非法地址: ${query}`);
    }
    const network = normalizeString(item.network) || null;
    const kind = normalizeLower(item.kind || "auto") || "auto";
    return { query, network, kind };
  });
}

function inferQueryKind(item) {
  if (item.kind && item.kind !== "auto") return item.kind;
  return detectAddressKind(item.query) ? "address" : "symbol";
}

function normalizeResolvedRow(row = {}, fallback = {}) {
  return {
    chain: row.chain ?? fallback.chain ?? null,
    network: row.network ?? fallback.network ?? null,
    tokenAddress: normalizeString(row.tokenAddress ?? row.address),
    symbol: normalizeString(row.symbol).toUpperCase() || null,
    name: normalizeString(row.name) || null,
    decimals: Number.isFinite(Number(row.decimals)) ? Number(row.decimals) : null,
  };
}

function mapDexScreenerChainId(chainId) {
  const raw = normalizeLower(chainId);
  if (["ethereum", "eth"].includes(raw)) return { chain: "evm", network: "eth" };
  if (["bsc", "binance-smart-chain"].includes(raw)) return { chain: "evm", network: "bsc" };
  if (["tron", "trx"].includes(raw)) return { chain: "trx", network: "mainnet" };
  return { chain: null, network: null };
}

function normalizeRemoteTokenInfo(raw, item) {
  if (!raw || typeof raw !== "object") return null;

  const baseToken = raw.baseToken ?? null;
  const quoteToken = raw.quoteToken ?? null;
  const preferred = baseToken?.address ? baseToken : (quoteToken?.address ? quoteToken : null);
  const chainLike = mapDexScreenerChainId(raw.chainId);
  const tokenAddress = normalizeString(preferred?.address);
  if (!tokenAddress) return null;

  return {
    chain: chainLike.chain,
    network: item.network ?? chainLike.network,
    tokenAddress,
    symbol: normalizeString(preferred?.symbol) || null,
    name: normalizeString(preferred?.name) || null,
    decimals: Number.isFinite(Number(preferred?.decimals)) ? Number(preferred.decimals) : null,
  };
}

let _defaultDexScreenerSource = null;

async function getDefaultDexScreenerSource() {
  if (_defaultDexScreenerSource) return _defaultDexScreenerSource;
  const source = new DexScreenerSource();
  await source.init();
  _defaultDexScreenerSource = source;
  return source;
}

function resolveConfigCandidates(item) {
  const query = item.query;
  const network = item.network;
  const kind = inferQueryKind(item);
  const candidates = [];

  const pushRow = (row) => {
    if (!row?.tokenAddress) return;
    const key = `${row.chain}:${row.network ?? "default"}:${normalizeLower(row.tokenAddress)}`;
    if (!candidates.some((existing) => `${existing.chain}:${existing.network ?? "default"}:${normalizeLower(existing.tokenAddress)}` === key)) {
      candidates.push(row);
    }
  };

  const maybeResolve = (chain, resolver, resolverInput) => {
    try {
      const resolved = resolver(resolverInput);
      pushRow(normalizeResolvedRow(resolved, { chain, network }));
    } catch {
      // ignore
    }
  };

  if (kind === "address") {
    const detected = detectAddressKind(query);
    if (detected === "evm") maybeResolve("evm", resolveEvmToken, { network, address: query });
    if (detected === "btc") maybeResolve("btc", resolveBtcToken, { network, address: query });
    if (detected === "trx") maybeResolve("trx", resolveTrxToken, { network, address: query });
    return candidates;
  }

  maybeResolve("evm", resolveEvmToken, { network, key: query });
  maybeResolve("btc", resolveBtcToken, { network, key: query });
  maybeResolve("trx", resolveTrxToken, { network, key: query });
  return candidates;
}

function buildCacheApi(options = {}) {
  const custom = options.cache ?? {};
  return {
    async getMap(input) {
      return typeof custom.getMap === "function"
        ? await custom.getMap(input)
        : await getCachedTokenMetadataMap(input);
    },
    async put(input) {
      return typeof custom.put === "function"
        ? await custom.put(input)
        : await putCachedTokenMetadata(input);
    },
    async find(input) {
      return typeof custom.find === "function"
        ? await custom.find(input)
        : await findCachedTokenMetadata(input);
    },
  };
}

async function resolveFromCache(item, cacheApi, options = {}) {
  const kind = inferQueryKind(item);
  const chain = kind === "address" ? detectAddressKind(item.query) : null;
  const maxAgeMs = options.cacheMaxAgeMs;

  if (kind === "address" && chain) {
    const map = await cacheApi.getMap({
      chain,
      network: item.network ?? "default",
      tokens: [item.query],
      maxAgeMs,
    });
    const found = map.get(normalizeLower(item.query));
    return found ? { ...normalizeResolvedRow(found, { chain, network: item.network }), source: "cache" } : null;
  }

  const found = await cacheApi.find({
    chain,
    network: item.network,
    query: item.query,
    kind,
    maxAgeMs,
  });
  return found ? { ...normalizeResolvedRow(found, found), source: "cache" } : null;
}

async function resolveFromRemote(item, options, cacheApi) {
  let resolved = null;
  try {
    if (typeof options.remoteResolver === "function") {
      resolved = await options.remoteResolver(item, options);
    } else {
      const queryKind = inferQueryKind(item);
      if (queryKind === "address" && detectAddressKind(item.query) === "evm") {
        if (typeof options.evmMetadataReader === "function") {
          resolved = await options.evmMetadataReader(item, options);
        } else {
          const batchReader = typeof options.evmMetadataBatchReader === "function"
            ? options.evmMetadataBatchReader
            : queryEvmTokenMetadataBatch;
          const batchRes = await batchReader([
            { token: item.query },
          ], {
            ...(options.evmMetadataOptions && typeof options.evmMetadataOptions === "object" ? options.evmMetadataOptions : {}),
            network: item.network ?? undefined,
            networkName: item.network ?? undefined,
          });
          const first = batchRes?.items?.[0] ?? null;
          if (first && (first.name != null || first.symbol != null || first.decimals != null)) {
            resolved = {
              chain: "evm",
              network: item.network,
              tokenAddress: item.query,
              name: first.name ?? null,
              symbol: first.symbol ?? null,
              decimals: first.decimals ?? null,
            };
          }
        }
      }

      if (queryKind === "address" && !resolved && detectAddressKind(item.query) === "trx") {
        if (typeof options.trxMetadataReader === "function") {
          resolved = await options.trxMetadataReader(item, options);
        } else {
          const meta = await queryTrxTokenMetadata({
            tokenAddress: item.query,
            network: item.network ?? undefined,
            networkName: item.network ?? undefined,
            callerAddress: options.trxCallerAddress ?? options.callerAddress ?? undefined,
          });
          if (meta && typeof meta === "object") {
            resolved = {
              chain: "trx",
              network: item.network ?? "mainnet",
              tokenAddress: item.query,
              name: meta.name ?? null,
              symbol: meta.symbol ?? null,
              decimals: meta.decimals ?? null,
            };
          }
        }
      }

      const source = options.tokenInfoSource ?? await getDefaultDexScreenerSource();
      if (!resolved && source && typeof source.getTokenInfo === "function") {
        const tokenInfo = await source.getTokenInfo(item.query);
        resolved = normalizeRemoteTokenInfo(tokenInfo, item);
      }
    }
  } catch {
    return null;
  }

  if (!resolved || typeof resolved !== "object") return null;
  const normalized = normalizeResolvedRow(resolved, {
    chain: resolved.chain ?? detectAddressKind(resolved.tokenAddress ?? item.query),
    network: resolved.network ?? item.network,
  });
  if (!normalized.tokenAddress) return null;
  await cacheApi.put({
    chain: normalized.chain,
    network: normalized.network ?? "default",
    items: [normalized],
  });
  return { ...normalized, source: "remote" };
}

export async function queryTokenMetaBatch(input = [], options = {}) {
  const items = normalizeItems(input);
  const cacheApi = buildCacheApi(options);
  const results = [];
  const dedupResultMap = new Map();
  const stats = options.debugStats
    ? {
      totalInput: items.length,
      uniqueInput: 0,
      dedupeHits: 0,
      configHits: 0,
      cacheHits: 0,
      remoteHits: 0,
      unresolved: 0,
    }
    : null;

  const dedupKeyOf = (item, queryKind) => {
    const networkKey = normalizeLower(item.network || "default") || "default";
    return `${queryKind}:${normalizeLower(item.query)}:${networkKey}`;
  };

  for (const item of items) {
    const queryKind = inferQueryKind(item);
    const dedupKey = dedupKeyOf(item, queryKind);
    const existing = dedupResultMap.get(dedupKey);
    if (existing) {
      if (stats) stats.dedupeHits += 1;
      results.push({ ...existing, query: item.query, queryKind });
      continue;
    }

    if (options.forceRemote === true) {
      const remoteOnly = await resolveFromRemote(item, options, cacheApi);
      if (remoteOnly) {
        const output = {
          ok: true,
          query: item.query,
          queryKind,
          ...remoteOnly,
        };
        if (stats) stats.remoteHits += 1;
        dedupResultMap.set(dedupKey, output);
        results.push(output);
        continue;
      }
    }

    const configCandidates = resolveConfigCandidates(item);
    if (configCandidates.length > 0) {
      const chosen = configCandidates[0];
      const output = {
        ok: true,
        query: item.query,
        queryKind,
        ...chosen,
        source: "config",
      };
      if (stats) stats.configHits += 1;
      dedupResultMap.set(dedupKey, output);
      results.push(output);
      continue;
    }

    if (options.forceRemote !== true) {
      const cached = await resolveFromCache(item, cacheApi, options);
      if (cached) {
        const output = {
          ok: true,
          query: item.query,
          queryKind,
          ...cached,
        };
        if (stats) stats.cacheHits += 1;
        dedupResultMap.set(dedupKey, output);
        results.push(output);
        continue;
      }
    }

    const remote = await resolveFromRemote(item, options, cacheApi);
    if (remote) {
      const output = {
        ok: true,
        query: item.query,
        queryKind,
        ...remote,
      };
      if (stats) stats.remoteHits += 1;
      dedupResultMap.set(dedupKey, output);
      results.push(output);
      continue;
    }

    const output = {
      ok: false,
      query: item.query,
      queryKind,
      chain: null,
      network: item.network,
      tokenAddress: null,
      symbol: null,
      name: null,
      decimals: null,
      source: "unresolved",
      error: `未解析 token: ${item.query}`,
    };
    if (stats) stats.unresolved += 1;
    dedupResultMap.set(dedupKey, output);
    results.push(output);
  }

  if (stats) {
    stats.uniqueInput = dedupResultMap.size;
  }

  const output = {
    ok: true,
    items: results,
  };
  if (stats) {
    output.stats = stats;
  }
  return output;
}

export async function queryTokenMeta(input, options = {}) {
  const result = await queryTokenMetaBatch([input], options);
  return result.items[0] ?? null;
}

export default {
  queryTokenMeta,
  queryTokenMetaBatch,
};