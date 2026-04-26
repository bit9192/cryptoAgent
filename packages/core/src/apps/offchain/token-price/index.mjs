import { detectAddressKind } from "../address-validators.mjs";
import { DexScreenerSource } from "../sources/dexscreener/index.mjs";
import { CoinGeckoSource } from "../sources/coingecko/index.mjs";
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
import {
  queryTokenPriceBatchByMeta,
  queryTokenPriceByMeta,
  queryTokenPriceLiteByQuery,
} from "./query-token-price.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeQueryKind(kind) {
  const value = normalizeLower(kind || "auto") || "auto";
  return value;
}

function normalizeNetworkName(network) {
  const raw = normalizeLower(network);
  if (!raw) return null;
  if (raw === "trx") return "mainnet";
  if (raw === "ethereum") return "eth";
  if (raw === "binance-smart-chain") return "bsc";
  return raw;
}

function detectAddressKindSafe(value) {
  try {
    return detectAddressKind(value);
  } catch {
    return null;
  }
}

function inferExpectedChainFromNetwork(network, networkRaw = null) {
  const rawHint = normalizeLower(networkRaw);
  if (["trx", "tron"].includes(rawHint)) return "trx";
  if (["btc", "bitcoin"].includes(rawHint)) return "btc";
  if (["eth", "ethereum", "evm", "bsc", "binance-smart-chain", "polygon", "arb", "arbitrum", "op", "optimism", "base", "avax", "linea", "scroll", "zksync"].includes(rawHint)) {
    return "evm";
  }

  const net = normalizeNetworkName(network);
  if (!net) return null;
  if (["eth", "bsc", "polygon", "arb", "arbitrum", "op", "optimism", "base", "avax", "linea", "scroll", "zksync"].includes(net)) {
    return "evm";
  }
  if (["nile", "shasta"].includes(net)) {
    return "trx";
  }
  if (["btc", "bitcoin", "testnet", "regtest", "signet"].includes(net)) {
    return "btc";
  }
  return null;
}

function isRemoteMatchForItem(item, normalized) {
  const queryKind = inferQueryKind(item);
  const tokenAddress = normalizeString(normalized?.tokenAddress);
  const tokenKind = detectAddressKindSafe(tokenAddress);
  const expectedNetwork = normalizeNetworkName(item.network);
  const actualNetwork = normalizeNetworkName(normalized?.network);

  if (queryKind === "address") {
    const expected = detectAddressKindSafe(item.query);
    if (!expected) return true;
    if (tokenKind !== expected) return false;
    if (expectedNetwork && actualNetwork && expectedNetwork !== actualNetwork) return false;
    return true;
  }

  const expectedChain = inferExpectedChainFromNetwork(item.network, item.networkRaw);
  if (!expectedChain) return true;
  if (normalized?.chain && normalized.chain !== expectedChain) return false;
  if (tokenKind && tokenKind !== expectedChain) return false;
  if (!tokenKind && tokenAddress && tokenAddress !== "native") {
    if (expectedChain === "evm" && !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) return false;
    if (expectedChain === "trx" && !/^T[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(tokenAddress)) return false;
  }
  if (expectedNetwork && actualNetwork && expectedNetwork !== actualNetwork) return false;
  if (expectedNetwork && !actualNetwork) return false;
  if (!normalized?.chain && !tokenKind) return false;
  return true;
}

function looksLikeMalformedAddress(query) {
  const value = normalizeString(query);
  if (!value) return false;
  if (value.startsWith("0x")) {
    return !/^0x[a-fA-F0-9]{40}$/.test(value);
  }
  const looksLikeTrxAddress = /^T/i.test(value) && (value.length >= 25 || /\d/.test(value));
  if (looksLikeTrxAddress) {
    return !/^T[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value);
  }
  const looksLikeBtcAddress = /^(bc1|tb1|bcrt1)[ac-hj-np-z02-9]{11,71}$/i.test(value)
    || /^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,62}$/.test(value);
  if (looksLikeBtcAddress) {
    return detectAddressKindSafe(value) == null;
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
      return { query, network: null, networkRaw: null, kind: "auto" };
    }
    if (!item || typeof item !== "object") {
      throw new Error("query item 必须是字符串或对象");
    }
    const query = normalizeString(item.query ?? item.address ?? item.symbol ?? item.name ?? item.key);
    if (!query) {
      throw new Error("query 不能为空");
    }
    const kind = normalizeQueryKind(item.kind);
    if ((kind === "auto" || kind === "address") && looksLikeMalformedAddress(query)) {
      throw new Error(`非法地址: ${query}`);
    }
    const networkRaw = normalizeLower(item.network);
    const network = normalizeNetworkName(item.network);
    return { query, network, networkRaw, kind };
  });
}

function inferQueryKind(item) {
  if (item.kind && item.kind !== "auto") return item.kind;
  return detectAddressKindSafe(item.query) ? "address" : "symbol";
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

  if (raw.tokenAddress) {
    const address = normalizeString(raw.tokenAddress);
    const tokenAddress = address.startsWith("0x") ? address.toLowerCase() : address;
    return {
      chain: raw.chain ?? inferExpectedChainFromNetwork(item?.network),
      network: raw.network ?? null,
      tokenAddress,
      symbol: normalizeString(raw.symbol) || null,
      name: normalizeString(raw.name) || null,
      decimals: Number.isFinite(Number(raw.decimals)) ? Number(raw.decimals) : null,
    };
  }

  const baseToken = raw.baseToken ?? null;
  const quoteToken = raw.quoteToken ?? null;
  const query = normalizeLower(item?.query);
  const baseSymbol = normalizeLower(baseToken?.symbol);
  const quoteSymbol = normalizeLower(quoteToken?.symbol);
  const baseName = normalizeLower(baseToken?.name);
  const quoteName = normalizeLower(quoteToken?.name);

  let preferred = null;
  if (query && (baseSymbol === query || baseName === query)) {
    preferred = baseToken;
  } else if (query && (quoteSymbol === query || quoteName === query)) {
    preferred = quoteToken;
  } else if (baseToken?.address) {
    preferred = baseToken;
  } else if (quoteToken?.address) {
    preferred = quoteToken;
  }

  const chainLike = mapDexScreenerChainId(raw.chainId);
  const tokenAddress = normalizeString(preferred?.address);
  if (!tokenAddress) return null;

  return {
    chain: chainLike.chain,
    network: chainLike.network ?? item.network,
    tokenAddress,
    symbol: normalizeString(preferred?.symbol) || null,
    name: normalizeString(preferred?.name) || null,
    decimals: Number.isFinite(Number(preferred?.decimals)) ? Number(preferred.decimals) : null,
  };
}

function resolveNativeTokenCandidate(query, network) {
  const key = normalizeLower(query);
  const net = normalizeNetworkName(network);

  if (net === "bsc" && ["bnb", "native"].includes(key)) {
    return {
      chain: "evm",
      network: "bsc",
      tokenAddress: "native",
      symbol: "BNB",
      name: "BNB",
      decimals: 18,
    };
  }

  if (net === "eth" && ["eth", "native"].includes(key)) {
    return {
      chain: "evm",
      network: "eth",
      tokenAddress: "native",
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
    };
  }

  if (net === "mainnet" && ["trx", "native"].includes(key)) {
    return {
      chain: "trx",
      network: "mainnet",
      tokenAddress: "native",
      symbol: "TRX",
      name: "TRON",
      decimals: 6,
    };
  }

  if (["btc", "bitcoin", "mainnet"].includes(net || "") && ["btc", "native"].includes(key)) {
    return {
      chain: "btc",
      network: net || "mainnet",
      tokenAddress: "native",
      symbol: "BTC",
      name: "Bitcoin",
      decimals: 8,
    };
  }

  return null;
}

let _defaultDexScreenerSource = null;
let _defaultCoinGeckoSource = null;

async function getDefaultDexScreenerSource() {
  if (_defaultDexScreenerSource) return _defaultDexScreenerSource;
  const source = new DexScreenerSource();
  await source.init();
  _defaultDexScreenerSource = source;
  return source;
}

async function getDefaultCoinGeckoSource() {
  if (_defaultCoinGeckoSource) return _defaultCoinGeckoSource;
  const source = new CoinGeckoSource({ timeout: 10000 });
  await source.init();
  _defaultCoinGeckoSource = source;
  return source;
}

async function getDefaultTokenInfoSources() {
  const coinGecko = await getDefaultCoinGeckoSource();
  const dexscreener = await getDefaultDexScreenerSource();
  return [coinGecko, dexscreener].filter(Boolean);
}

const EVM_PROOF_NETWORKS = ["eth", "bsc"];

async function resolveEvmAddressNetworksByMetadata(tokenAddress) {
  const normalizedAddress = normalizeString(tokenAddress).toLowerCase();
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
    return [];
  }

  const matchedNetworks = [];
  for (const network of EVM_PROOF_NETWORKS) {
    try {
      const metadata = await queryEvmTokenMetadataBatch([normalizedAddress], { network });
      const row = Array.isArray(metadata?.items) ? metadata.items[0] : null;
      if (!row) continue;
      const hasMetadata = Boolean(row?.symbol || row?.name || Number.isFinite(Number(row?.decimals)));
      if (hasMetadata) matchedNetworks.push(network);
    } catch {
      // ignore network proof error, keep trying other networks
    }
  }
  return matchedNetworks;
}

async function resolveConfigCandidates(item) {
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

  let proofNetworks = null;
  if (kind === "address") {
    const detected = detectAddressKindSafe(query);
    if (detected === "evm") {
      if (network) {
        maybeResolve("evm", resolveEvmToken, { network, address: query });
      } else {
        const matchedNetworks = await resolveEvmAddressNetworksByMetadata(query);
        proofNetworks = matchedNetworks;
        for (const matchedNetwork of matchedNetworks) {
          maybeResolve("evm", resolveEvmToken, { network: matchedNetwork, address: query });
        }
      }
    }
    if (detected === "btc") maybeResolve("btc", resolveBtcToken, { network, address: query });
    if (detected === "trx") maybeResolve("trx", resolveTrxToken, { network, address: query });
    return { candidates, proofNetworks };
  }

  const nativeCandidate = resolveNativeTokenCandidate(query, network);
  if (nativeCandidate) {
    pushRow(normalizeResolvedRow(nativeCandidate, {
      chain: nativeCandidate.chain,
      network: nativeCandidate.network,
    }));
  }

  maybeResolve("evm", resolveEvmToken, { network, key: query });
  maybeResolve("btc", resolveBtcToken, { network, key: query });
  maybeResolve("trx", resolveTrxToken, { network, key: query });
  return { candidates, proofNetworks };
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
  const chain = kind === "address" ? detectAddressKindSafe(item.query) : null;
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
  if (!found) return null;
  const normalized = normalizeResolvedRow(found, found);
  if (!isRemoteMatchForItem(item, normalized)) return null;
  return { ...normalized, source: "cache" };
}

async function enrichResolvedMetadata(item, normalized, options = {}) {
  if (!normalized?.tokenAddress || !normalized?.chain) return normalized;

  if (normalized.chain === "evm" && detectAddressKindSafe(normalized.tokenAddress) === "evm") {
    try {
      let meta = null;
      if (typeof options.evmMetadataReader === "function") {
        meta = await options.evmMetadataReader({
          query: normalized.tokenAddress,
          network: normalized.network ?? item.network,
          kind: "address",
        }, options);
      } else {
        const batchReader = typeof options.evmMetadataBatchReader === "function"
          ? options.evmMetadataBatchReader
          : queryEvmTokenMetadataBatch;
        const batchRes = await batchReader([{ token: normalized.tokenAddress }], {
          ...(options.evmMetadataOptions && typeof options.evmMetadataOptions === "object" ? options.evmMetadataOptions : {}),
          network: normalized.network ?? item.network ?? undefined,
          networkName: normalized.network ?? item.network ?? undefined,
        });
        meta = batchRes?.items?.[0] ?? null;
      }

      if (meta && typeof meta === "object") {
        return {
          ...normalized,
          name: normalized.name ?? (meta.name ?? null),
          symbol: normalized.symbol ?? (meta.symbol ?? null),
          decimals: Number.isFinite(Number(meta.decimals)) ? Number(meta.decimals) : normalized.decimals,
        };
      }
    } catch {
      // ignore enrichment failure, keep normalized remote result
    }
  }

  if (normalized.chain === "trx" && detectAddressKindSafe(normalized.tokenAddress) === "trx") {
    try {
      let meta = null;
      if (typeof options.trxMetadataReader === "function") {
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
          callerAddress: options.trxCallerAddress ?? options.callerAddress ?? undefined,
        });
      }

      if (meta && typeof meta === "object") {
        return {
          ...normalized,
          name: normalized.name ?? (meta.name ?? null),
          symbol: normalized.symbol ?? (meta.symbol ?? null),
          decimals: Number.isFinite(Number(meta.decimals)) ? Number(meta.decimals) : normalized.decimals,
        };
      }
    } catch {
      // ignore enrichment failure, keep normalized remote result
    }
  }

  return normalized;
}

async function resolveFromRemote(item, options, cacheApi) {
  let resolved = null;
  try {
    if (typeof options.remoteResolver === "function") {
      resolved = await options.remoteResolver(item, options);
    } else {
      const queryKind = inferQueryKind(item);
      if (queryKind === "address" && detectAddressKindSafe(item.query) === "evm") {
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

      if (queryKind === "address" && !resolved && detectAddressKindSafe(item.query) === "trx") {
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

      const sources = Array.isArray(options.tokenInfoSources)
        ? options.tokenInfoSources
        : (options.tokenInfoSource ? [options.tokenInfoSource] : await getDefaultTokenInfoSources());
      for (const source of sources) {
        if (resolved) break;
        if (!source || typeof source.getTokenInfo !== "function") continue;
        try {
          const tokenInfo = await source.getTokenInfo(item.query, {
            network: item.network,
            queryKind,
          });
          const candidate = normalizeRemoteTokenInfo(tokenInfo, item);
          if (!candidate) continue;
          const normalizedCandidate = normalizeResolvedRow(candidate, {
            chain: candidate.chain ?? detectAddressKindSafe(candidate.tokenAddress ?? item.query),
            network: candidate.network ?? null,
          });
          if (!normalizedCandidate.tokenAddress) continue;
          if (!isRemoteMatchForItem(item, normalizedCandidate)) continue;
          resolved = normalizedCandidate;
        } catch {
          // ignore this source and continue fallback
        }
      }
    }
  } catch {
    return null;
  }

  if (!resolved || typeof resolved !== "object") return null;
  const normalized = normalizeResolvedRow(resolved, {
    chain: resolved.chain ?? detectAddressKindSafe(resolved.tokenAddress ?? item.query),
    network: resolved.network ?? item.network,
  });
  if (!normalized.tokenAddress) return null;
  if (!isRemoteMatchForItem(item, normalized)) return null;
  const queryKind = inferQueryKind(item);
  const enriched = queryKind === "address"
    ? normalized
    : await enrichResolvedMetadata(item, normalized, options);
  await cacheApi.put({
    chain: enriched.chain,
    network: enriched.network ?? "default",
    items: [enriched],
  });
  return { ...enriched, source: "remote" };
}

async function resolveRemoteCandidates(item, options = {}) {
  const sources = Array.isArray(options.tokenInfoSources)
    ? options.tokenInfoSources
    : (options.tokenInfoSource ? [options.tokenInfoSource] : await getDefaultTokenInfoSources());

  const out = [];
  const dedup = new Set();

  for (const source of sources) {
    try {
      if (!source || typeof source.getTokenCandidates !== "function") continue;
      const candidates = await source.getTokenCandidates(item.query, {
        network: item.network,
        limit: Number(options.candidateLimit ?? 10),
      });
      for (const row of Array.isArray(candidates) ? candidates : []) {
        const key = `${normalizeLower(row?.chain)}:${normalizeLower(row?.network)}:${normalizeLower(row?.tokenAddress)}:${normalizeLower(row?.symbol)}`;
        if (dedup.has(key)) continue;
        dedup.add(key);
        out.push(row);
      }
    } catch {
      // ignore source-level candidate errors
    }
  }

  return out;
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

    const { candidates: resolvedCandidates, proofNetworks } = await resolveConfigCandidates(item);
    const matchedConfigCandidates = resolvedCandidates
      .map((row) => normalizeResolvedRow(row, row))
      .filter((row) => isRemoteMatchForItem(item, row));
    if (matchedConfigCandidates.length > 0) {
      const chosen = matchedConfigCandidates[0];
      const output = {
        ok: true,
        query: item.query,
        queryKind,
        ...chosen,
        source: "config",
      };
      if (proofNetworks !== null) output.debugStats = { ...(output.debugStats ?? {}), proofNetworks };
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
    if (queryKind === "symbol") {
      const candidates = await resolveRemoteCandidates(item, options);
      if (candidates.length > 0) {
        output.candidates = candidates;
      }
    }
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

export async function queryTokenPriceBatch(input = [], options = {}) {
  const tokenMetaOptions = {
    ...(options.tokenMetaOptions && typeof options.tokenMetaOptions === "object" ? options.tokenMetaOptions : {}),
    cache: options.metaCache,
    cacheMaxAgeMs: options.metaCacheMaxAgeMs,
    forceRemote: options.metaForceRemote,
    debugStats: false,
  };

  if (tokenMetaOptions.cache == null) delete tokenMetaOptions.cache;
  if (tokenMetaOptions.cacheMaxAgeMs == null) delete tokenMetaOptions.cacheMaxAgeMs;
  if (tokenMetaOptions.forceRemote == null) delete tokenMetaOptions.forceRemote;

  const metaRes = await queryTokenMetaBatch(input, tokenMetaOptions);
  const priceRes = await queryTokenPriceBatchByMeta(metaRes.items, options);
  return priceRes;
}

export async function queryTokenPrice(input, options = {}) {
  const meta = await queryTokenMeta(input, {
    ...(options.tokenMetaOptions && typeof options.tokenMetaOptions === "object" ? options.tokenMetaOptions : {}),
    cache: options.metaCache,
    cacheMaxAgeMs: options.metaCacheMaxAgeMs,
    forceRemote: options.metaForceRemote,
    debugStats: false,
  });
  return await queryTokenPriceByMeta(meta, options);
}

function shapeLitePriceRow(row = {}, fallback = {}) {
  return {
    ok: Boolean(row?.ok),
    query: normalizeString(row?.query ?? fallback.query) || null,
    chain: row?.chain ?? fallback.chain ?? null,
    network: normalizeNetworkName(row?.network ?? fallback.network) ?? null,
    tokenAddress: normalizeString(row?.tokenAddress) || null,
    symbol: normalizeString(row?.symbol) || (normalizeString(fallback.query).toUpperCase() || null),
    priceUsd: Number.isFinite(Number(row?.priceUsd)) ? Number(row.priceUsd) : null,
    source: normalizeString(row?.source) || (row?.ok ? "remote" : "unresolved"),
    error: row?.ok ? null : (normalizeString(row?.error) || "未解析价格"),
  };
}

export async function queryTokenPriceLite(input, options = {}) {
  const query = normalizeString(input?.query ?? input?.symbol ?? input?.name ?? input);
  const network = normalizeNetworkName(input?.network);

  if (!query) {
    return shapeLitePriceRow({
      ok: false,
      source: "unresolved",
      error: "query 不能为空",
    }, {
      query,
      network,
      chain: inferExpectedChainFromNetwork(network, network),
    });
  }

  if (!network) {
    return shapeLitePriceRow({
      ok: false,
      source: "unresolved",
      error: "network 不能为空",
    }, {
      query,
      network,
      chain: inferExpectedChainFromNetwork(network, network),
    });
  }

  const chain = inferExpectedChainFromNetwork(network, network);
  const primary = await queryTokenPrice({
    query,
    network,
    kind: normalizeQueryKind(input?.kind),
  }, options);

  if (primary?.ok) {
    return shapeLitePriceRow(primary, {
      query,
      network,
      chain,
    });
  }

  // If token metadata cannot be resolved, fallback to direct symbol pricing for display usage.
  const isAddressQuery = Boolean(detectAddressKindSafe(query));
  if (!isAddressQuery) {
    const fallback = await queryTokenPriceLiteByQuery({ query, network, chain }, options);
    if (fallback?.ok) {
      return shapeLitePriceRow(fallback, {
        query,
        network,
        chain,
      });
    }
  }

  // B-6: EVM address query fallback to trade summary resolver.
  const tradeSummaryResolver = typeof options.tradeSummaryResolver === "function"
    ? options.tradeSummaryResolver
    : null;
  if (isAddressQuery && tradeSummaryResolver) {
    try {
      const summary = await tradeSummaryResolver(query, network);
      const priceUsd = Number.isFinite(Number(summary?.priceUsd)) ? Number(summary.priceUsd) : null;
      if (priceUsd != null) {
        return shapeLitePriceRow({
          ok: true,
          query,
          chain,
          network,
          tokenAddress: query,
          symbol: null,
          priceUsd,
          source: "trade-summary",
        }, {
          query,
          network,
          chain,
        });
      }
    } catch {
      // trade summary resolver failure is downgraded; fall through to unresolved
    }
  }

  return shapeLitePriceRow(primary, {
    query,
    network,
    chain,
  });
}

export default {
  queryTokenMeta,
  queryTokenMetaBatch,
  queryTokenPrice,
  queryTokenPriceBatch,
  queryTokenPriceLite,
};