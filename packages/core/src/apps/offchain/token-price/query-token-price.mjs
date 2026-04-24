import { DexScreenerSource } from "../sources/dexscreener/index.mjs";
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

async function resolveRemotePriceMap(tokens = [], options = {}) {
  if (tokens.length === 0) return new Map();

  try {
    if (typeof options.priceBatchResolver === "function") {
      const remote = await options.priceBatchResolver(tokens, options);
      const map = new Map();
      for (const token of tokens) {
        const row = remote?.[token] ?? remote?.[normalizeLower(token)] ?? null;
        const priceUsd = toPriceUsd(row);
        if (!Number.isFinite(priceUsd)) continue;
        map.set(normalizeLower(token), priceUsd);
      }
      return map;
    }

    const source = options.priceSource ?? await getDefaultDexScreenerSource();
    if (!source || typeof source.getPrice !== "function") return new Map();
    const remote = await source.getPrice(tokens);

    const map = new Map();
    for (const token of tokens) {
      const row = remote?.[token] ?? remote?.[normalizeLower(token)] ?? null;
      const priceUsd = toPriceUsd(row);
      if (!Number.isFinite(priceUsd)) continue;
      map.set(normalizeLower(token), priceUsd);
    }
    return map;
  } catch {
    return new Map();
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
    const tokens = [...new Set(group.rows.map((v) => normalizeLower(v.tokenAddress)).filter(Boolean))];
    const cacheMap = options.forceRemote === true
      ? new Map()
      : await cacheApi.getMap({
        chain: group.chain,
        network: group.network,
        tokens,
        maxAgeMs: options.cacheMaxAgeMs,
      });

    const missing = [];
    for (const tokenAddress of tokens) {
      if (!cacheMap.has(tokenAddress)) {
        missing.push(tokenAddress);
      }
    }

    const remoteMap = await resolveRemotePriceMap(missing, options);
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
        const out = {
          ok: true,
          query: meta.query,
          queryKind: meta.queryKind,
          chain: meta.chain,
          network: meta.network,
          tokenAddress: meta.tokenAddress,
          symbol: meta.symbol,
          name: meta.name,
          priceUsd: hasRemote ? priceFromRemote : priceFromCache,
          source,
        };
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
