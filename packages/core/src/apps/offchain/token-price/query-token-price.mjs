import { DexScreenerSource } from "../sources/dexscreener/index.mjs";
import { resolveEvmToken } from "../../evm/configs/tokens.js";
import {
  getCachedTokenPriceMap,
  putCachedTokenPrice,
} from "../../../modules/assets-engine/token-price-cache.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeNetworkName(network) {
  const raw = normalizeLower(network);
  if (!raw) return null;
  if (raw === "trx") return "mainnet";
  if (raw === "ethereum") return "eth";
  if (raw === "binance-smart-chain") return "bsc";
  return raw;
}

function normalizeMetaItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const query = normalizeString(item?.query);
    const queryKind = normalizeLower(item?.queryKind || "auto") || "auto";
    const chain = normalizeLower(item?.chain);
    const network = normalizeNetworkName(item?.network);
    const tokenAddress = normalizeString(item?.tokenAddress);
    const symbol = normalizeString(item?.symbol) || null;
    const name = normalizeString(item?.name) || null;

    return {
      ok: Boolean(item?.ok),
      query,
      queryKind,
      chain,
      network,
      tokenAddress,
      symbol,
      name,
      error: normalizeString(item?.error) || null,
      source: normalizeString(item?.source) || null,
    };
  });
}

function buildCacheApi(options = {}) {
  const custom = options.cache ?? {};
  return {
    async getMap(input) {
      return typeof custom.getMap === "function"
        ? await custom.getMap(input)
        : await getCachedTokenPriceMap(input);
    },
    async put(input) {
      return typeof custom.put === "function"
        ? await custom.put(input)
        : await putCachedTokenPrice(input);
    },
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

function toPriceUsd(value) {
  if (value == null) return null;
  if (typeof value === "object") {
    const candidate = value.usd ?? value.priceUsd ?? null;
    const n = Number(candidate);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function groupByChainNetwork(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const chain = normalizeLower(row?.chain);
    const network = normalizeNetworkName(row?.network) ?? "default";
    const tokenAddress = normalizeLower(row?.tokenAddress);
    if (!chain || !tokenAddress) continue;
    const key = `${chain}:${network}`;
    if (!map.has(key)) {
      map.set(key, { chain, network, rows: [] });
    }
    map.get(key).rows.push({ ...row, tokenAddress });
  }
  return [...map.values()];
}

function buildRemoteQueryToken(meta) {
  const tokenAddress = normalizeLower(meta?.tokenAddress);
  if (tokenAddress && tokenAddress !== "native") return tokenAddress;

  const chain = normalizeLower(meta?.chain);
  const network = normalizeNetworkName(meta?.network);
  const symbol = normalizeLower(meta?.symbol);

  if (chain === "evm") {
    try {
      const wrapped = network === "bsc"
        ? resolveEvmToken({ network, key: "wbnb" })
        : resolveEvmToken({ network, key: "weth" });
      const address = normalizeString(wrapped?.address);
      if (address) return normalizeLower(address);
    } catch {
      // ignore and fallback to symbol
    }
  }

  return symbol || null;
}

function buildStablecoinGuardWarning(meta, priceUsd, options = {}) {
  const symbol = normalizeLower(meta?.symbol);
  const stableSymbols = new Set(
    Array.isArray(options.stableSymbols) && options.stableSymbols.length > 0
      ? options.stableSymbols.map((v) => normalizeLower(v)).filter(Boolean)
      : ["usdt", "usdc", "dai", "fdusd", "usde"]
  );
  if (!stableSymbols.has(symbol)) return null;

  const minUsd = Number.isFinite(Number(options.stableMinUsd)) ? Number(options.stableMinUsd) : 0.9;
  const maxUsd = Number.isFinite(Number(options.stableMaxUsd)) ? Number(options.stableMaxUsd) : 1.1;
  if (priceUsd < minUsd || priceUsd > maxUsd) {
    return `稳定币价格偏离区间[${minUsd}, ${maxUsd}]: ${symbol.toUpperCase()}=${priceUsd}`;
  }
  return null;
}

async function resolveRemotePriceMap(requests = [], options = {}) {
  if (requests.length === 0) return new Map();

  const queryTokens = requests
    .map((item) => normalizeLower(item?.queryToken))
    .filter(Boolean);
  if (queryTokens.length === 0) return new Map();

  const queryToKeys = new Map();
  for (const item of requests) {
    const queryToken = normalizeLower(item?.queryToken);
    const key = normalizeLower(item?.key);
    if (!queryToken || !key) continue;
    if (!queryToKeys.has(queryToken)) queryToKeys.set(queryToken, new Set());
    queryToKeys.get(queryToken).add(key);
  }

  const sourceStats = [];

  const makeSourceMetric = (name) => ({
    source: String(name ?? "unknown"),
    attempts: 0,
    hits: 0,
    errors: 0,
  });

  const addSourceHit = (metric, count) => {
    metric.hits += Number.isFinite(Number(count)) ? Number(count) : 0;
  };

  try {
    if (typeof options.priceBatchResolver === "function") {
      const remote = await options.priceBatchResolver([...new Set(queryTokens)], options);
      const map = new Map();
      const metric = makeSourceMetric("priceBatchResolver");
      metric.attempts += 1;
      for (const token of queryToKeys.keys()) {
        const row = remote?.[token] ?? remote?.[normalizeLower(token)] ?? null;
        const priceUsd = toPriceUsd(row);
        if (!Number.isFinite(priceUsd)) continue;
        addSourceHit(metric, 1);
        for (const key of queryToKeys.get(token)) {
          map.set(key, priceUsd);
        }
      }
      sourceStats.push(metric);
      return { map, sourceStats };
    }

    const map = new Map();
    let sources = [];

    if (Array.isArray(options.priceSources)) {
      sources = options.priceSources.filter((source) => source && typeof source.getPrice === "function");
    } else if (options.priceSource && typeof options.priceSource.getPrice === "function") {
      sources = [options.priceSource];
    } else {
      const defaultSource = await getDefaultDexScreenerSource();
      if (defaultSource && typeof defaultSource.getPrice === "function") {
        sources = [defaultSource];
      }
    }

    if (sources.length === 0) return { map, sourceStats };

    const remaining = new Set(queryToKeys.keys());

    for (let i = 0; i < sources.length; i += 1) {
      const source = sources[i];
      if (remaining.size === 0) break;
      const metric = makeSourceMetric(source?.metadata?.name ?? `source#${i + 1}`);
      sourceStats.push(metric);

      let remote = null;
      try {
        metric.attempts += 1;
        remote = await source.getPrice([...remaining]);
      } catch {
        metric.errors += 1;
        continue;
      }

      for (const token of [...remaining]) {
        const row = remote?.[token] ?? remote?.[normalizeLower(token)] ?? null;
        const priceUsd = toPriceUsd(row);
        if (!Number.isFinite(priceUsd)) continue;
        addSourceHit(metric, 1);
        for (const key of queryToKeys.get(token) ?? []) {
          map.set(key, priceUsd);
        }
        remaining.delete(token);
      }
    }

    return { map, sourceStats };
  } catch {
    return {
      map: new Map(),
      sourceStats,
    };
  }
}

export async function queryTokenPriceBatchByMeta(metaItems = [], options = {}) {
  const rows = normalizeMetaItems(metaItems);
  const stats = options.debugStats
    ? {
      totalInput: rows.length,
      uniqueInput: 0,
      dedupeHits: 0,
      cacheHits: 0,
      remoteHits: 0,
      unresolved: 0,
      guardWarnings: 0,
      sourceStats: [],
    }
    : null;
  const cacheApi = buildCacheApi(options);
  const results = [];
  const dedupMap = new Map();
  const queuedKeySet = new Set();

  const dedupKeyOf = (item) => {
    const network = item.network ?? "default";
    return `${item.chain}:${network}:${normalizeLower(item.tokenAddress)}`;
  };

  const metasToPrice = [];

  for (const item of rows) {
    if (!item.ok || !item.chain || !item.tokenAddress) {
      const unresolved = {
        ok: false,
        query: item.query,
        queryKind: item.queryKind,
        chain: item.chain || null,
        network: item.network || null,
        tokenAddress: item.tokenAddress || null,
        symbol: item.symbol,
        name: item.name,
        priceUsd: null,
        source: "unresolved",
        error: item.error || `未解析 token: ${item.query}`,
      };
      if (stats) stats.unresolved += 1;
      results.push(unresolved);
      continue;
    }

    const dedupKey = dedupKeyOf(item);
    if (queuedKeySet.has(dedupKey)) {
      if (stats) stats.dedupeHits += 1;
      results.push({
        __kind: "dedup-placeholder",
        __dedupKey: dedupKey,
        __query: item.query,
        __queryKind: item.queryKind,
      });
      continue;
    }
    queuedKeySet.add(dedupKey);
    metasToPrice.push({ ...item, dedupKey });
  }

  for (const group of groupByChainNetwork(metasToPrice)) {
    const cacheMap = new Map();
    const requests = [];
    for (const meta of group.rows) {
      const key = normalizeLower(meta.tokenAddress);
      const queryToken = buildRemoteQueryToken(meta);
      if (!key || !queryToken) continue;
      requests.push({ key, queryToken });
    }

    const remoteResolved = await resolveRemotePriceMap(requests, options);
    const remoteMap = remoteResolved?.map instanceof Map ? remoteResolved.map : new Map();
    if (stats && Array.isArray(remoteResolved?.sourceStats)) {
      for (const row of remoteResolved.sourceStats) {
        const sourceName = String(row?.source ?? "unknown");
        let target = stats.sourceStats.find((v) => v.source === sourceName);
        if (!target) {
          target = { source: sourceName, attempts: 0, hits: 0, errors: 0 };
          stats.sourceStats.push(target);
        }
        target.attempts += Number(row?.attempts ?? 0);
        target.hits += Number(row?.hits ?? 0);
        target.errors += Number(row?.errors ?? 0);
      }
    }
    const savable = [];
    for (const [tokenAddress, priceUsd] of remoteMap.entries()) {
      savable.push({ tokenAddress, priceUsd });
    }
    if (savable.length > 0) {
      await cacheApi.put({
        chain: group.chain,
        network: group.network,
        items: savable,
      });
    }

    for (const meta of group.rows) {
      const tokenAddress = normalizeLower(meta.tokenAddress);
      const cached = cacheMap.get(tokenAddress);
      const priceFromCache = Number(cached?.priceUsd);
      const priceFromRemote = Number(remoteMap.get(tokenAddress));
      const hasCache = Number.isFinite(priceFromCache);
      const hasRemote = Number.isFinite(priceFromRemote);

      if (hasCache || hasRemote) {
        const source = hasRemote ? "remote" : "cache";
        const pickedPrice = hasRemote ? priceFromRemote : priceFromCache;
        const guardWarning = buildStablecoinGuardWarning(meta, pickedPrice, options);
        const out = {
          ok: true,
          query: meta.query,
          queryKind: meta.queryKind,
          chain: meta.chain,
          network: meta.network,
          tokenAddress: meta.tokenAddress,
          symbol: meta.symbol,
          name: meta.name,
          priceUsd: pickedPrice,
          source,
        };
        if (guardWarning) {
          out.warning = guardWarning;
          if (stats) stats.guardWarnings += 1;
        }
        if (stats) {
          if (source === "cache") stats.cacheHits += 1;
          if (source === "remote") stats.remoteHits += 1;
        }
        dedupMap.set(meta.dedupKey, out);
        results.push(out);
      } else {
        const out = {
          ok: false,
          query: meta.query,
          queryKind: meta.queryKind,
          chain: meta.chain,
          network: meta.network,
          tokenAddress: meta.tokenAddress,
          symbol: meta.symbol,
          name: meta.name,
          priceUsd: null,
          source: "unresolved",
          error: `未解析价格: ${meta.query}`,
        };
        if (stats) stats.unresolved += 1;
        dedupMap.set(meta.dedupKey, out);
        results.push(out);
      }
    }
  }

  for (let i = 0; i < results.length; i += 1) {
    const row = results[i];
    if (row?.__kind !== "dedup-placeholder") continue;
    const resolved = dedupMap.get(row.__dedupKey);
    if (!resolved) {
      results[i] = {
        ok: false,
        query: row.__query,
        queryKind: row.__queryKind,
        chain: null,
        network: null,
        tokenAddress: null,
        symbol: null,
        name: null,
        priceUsd: null,
        source: "unresolved",
        error: `未解析价格: ${row.__query}`,
      };
      if (stats) stats.unresolved += 1;
      continue;
    }
    results[i] = {
      ...resolved,
      query: row.__query,
      queryKind: row.__queryKind,
    };
  }

  if (stats) {
    stats.uniqueInput = dedupMap.size;
  }

  const output = {
    ok: true,
    items: results,
  };
  if (stats) output.stats = stats;
  return output;
}

export async function queryTokenPriceByMeta(metaItem, options = {}) {
  const res = await queryTokenPriceBatchByMeta([metaItem], options);
  return res.items[0] ?? null;
}

export default {
  queryTokenPriceBatchByMeta,
  queryTokenPriceByMeta,
};
