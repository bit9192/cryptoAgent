import { DexScreenerSource } from "../../offchain/sources/dexscreener/index.mjs";
import { getEvmDexConfigs } from "../configs/dexes.js";
import { searchOnchainLiquidityPairs } from "./trade-onchain-liquidity.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeNetworkHint(value) {
  const raw = normalizeLower(value);
  if (!raw) return "";
  if (["eth", "ethereum", "mainnet", "evm"].includes(raw)) return raw;
  if (["trx", "tron"].includes(raw)) return "trx";
  if (["btc", "bitcoin"].includes(raw)) return "btc";
  return raw;
}

const EVM_CHAIN_IDS = new Set(["ethereum", "eth", "bsc", "binance-smart-chain"]);

function isEvmChainId(chainId) {
  return EVM_CHAIN_IDS.has(normalizeLower(chainId));
}

function mapDexChainIdToEvmNetwork(chainId, fallbackNetwork = "eth") {
  const raw = normalizeLower(chainId);
  if (["ethereum", "eth"].includes(raw)) return "eth";
  if (["bsc", "binance-smart-chain"].includes(raw)) return "bsc";
  return fallbackNetwork;
}

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapPairToTradeItem(pair, requestedNetwork) {
  const network = mapDexChainIdToEvmNetwork(pair?.chainId, requestedNetwork);
  const dexId = String(pair?.dexId ?? "dex").trim() || "dex";
  const pairAddress = String(pair?.pairAddress ?? "").trim();
  const baseSymbol = String(pair?.baseToken?.symbol ?? "").trim();
  const quoteSymbol = String(pair?.quoteToken?.symbol ?? "").trim();

  if (!pairAddress) return null;

  return {
    domain: "trade",
    chain: "evm",
    network,
    id: `trade:evm:${network}:${normalizeLower(pairAddress)}`,
    title: `${baseSymbol || "TOKEN"}/${quoteSymbol || "QUOTE"} @ ${dexId}`,
    address: pairAddress,
    source: "remote",
    confidence: 0.86,
    extra: {
      dexId,
      chainId: pair?.chainId ?? null,
      pairAddress,
      baseToken: pair?.baseToken ?? null,
      quoteToken: pair?.quoteToken ?? null,
      priceUsd: toFiniteNumber(pair?.priceUsd),
      liquidityUsd: toFiniteNumber(pair?.liquidity?.usd),
      volume24h: toFiniteNumber(pair?.volume?.h24),
      routeSummary: `${dexId}:${baseSymbol || "TOKEN"}/${quoteSymbol || "QUOTE"}`,
    },
  };
}

function dedupTradeItems(items = []) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = String(item?.id ?? "").trim() || `${normalizeLower(item?.network)}:${normalizeLower(item?.address)}`;
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    const liqExisting = toFiniteNumber(existing?.extra?.liquidityUsd) ?? 0;
    const liqNext = toFiniteNumber(item?.extra?.liquidityUsd) ?? 0;
    if (liqNext > liqExisting) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

function buildEmptyTradeSummary(input = {}) {
  const tokenAddress = String(input?.tokenAddress ?? input?.query ?? "").trim() || null;
  const network = normalizeNetworkHint(input?.network) || null;
  return {
    chain: "evm",
    network,
    tokenAddress,
    pairCount: 0,
    topDex: null,
    topPairAddress: null,
    priceUsd: null,
    liquidityUsd: null,
    volume24h: null,
    totalLiquidityUsd: 0,
    totalVolume24h: 0,
    source: "dexscreener",
  };
}

function getIntermediateTokenFromPair(item = {}, sourceTokenAddress) {
  const source = normalizeLower(sourceTokenAddress);
  const base = item?.extra?.baseToken ?? null;
  const quote = item?.extra?.quoteToken ?? null;
  const baseAddress = normalizeLower(base?.address);
  const quoteAddress = normalizeLower(quote?.address);

  if (baseAddress === source && quoteAddress) {
    return {
      address: String(quote?.address ?? "").trim(),
      symbol: String(quote?.symbol ?? "").trim() || null,
      name: String(quote?.name ?? "").trim() || null,
    };
  }

  if (quoteAddress === source && baseAddress) {
    return {
      address: String(base?.address ?? "").trim(),
      symbol: String(base?.symbol ?? "").trim() || null,
      name: String(base?.name ?? "").trim() || null,
    };
  }

  return null;
}

function pairContainsSymbol(item = {}, symbol) {
  const target = normalizeLower(symbol);
  if (!target) return false;
  const baseSymbol = normalizeLower(item?.extra?.baseToken?.symbol);
  const quoteSymbol = normalizeLower(item?.extra?.quoteToken?.symbol);
  return baseSymbol === target || quoteSymbol === target;
}

function createDexScreenerFacade() {
  const source = new DexScreenerSource();
  let initPromise = null;

  async function ensureInit() {
    if (!initPromise) {
      initPromise = source.init();
    }
    await initPromise;
  }

  return {
    async resolvePairs(query, options) {
      await ensureInit();
      const pairs = await source.resolvePairs(query, options);
      return Array.isArray(pairs) ? pairs : [];
    },
    async getTokenInfo(query, options) {
      await ensureInit();
      return await source.getTokenInfo(query, options);
    },
  };
}

export function createEvmDexScreenerTradeProvider(options = {}) {
  const dexscreener = options.dexscreener ?? createDexScreenerFacade();
  const offchainSources = Array.isArray(options.offchainSources)
    ? options.offchainSources
    : [{
      id: "dexscreener",
      async resolvePairs(query, sourceOptions = {}) {
        if (typeof dexscreener.resolvePairs !== "function") return [];
        return await dexscreener.resolvePairs(query, sourceOptions);
      },
    }];

  const onchainLiquiditySearcher = typeof options.onchainLiquiditySearcher === "function"
    ? options.onchainLiquiditySearcher
    : searchOnchainLiquidityPairs;

  async function resolvePairsFromSources(tokenAddress, requestedNetwork, dexConfigs) {
    const merged = [];

    for (const source of offchainSources) {
      try {
        if (!source || typeof source.resolvePairs !== "function") continue;
        const rows = await source.resolvePairs(tokenAddress, {
          network: requestedNetwork,
          dexConfigs,
        });
        for (const row of Array.isArray(rows) ? rows : []) {
          merged.push({
            ...row,
            __sourceId: String(source?.id ?? "remote").trim() || "remote",
          });
        }
      } catch {
        // source-level failure is downgraded; continue fallback chain
      }
    }

    return merged;
  }

  async function searchTradePairs(input = {}) {
    const tokenAddress = String(input?.tokenAddress ?? input?.query ?? "").trim();
    const requestedNetwork = normalizeNetworkHint(input?.network);
    const limit = Number.isInteger(Number(input?.limit)) && Number(input.limit) > 0
      ? Number(input.limit)
      : 20;

    if (!requestedNetwork) {
      throw new TypeError("network 不能为空");
    }

    if (!isEvmAddress(tokenAddress)) {
      return [];
    }

    try {
      const dexConfigs = getEvmDexConfigs({ network: requestedNetwork });

      let pairs = await resolvePairsFromSources(tokenAddress, requestedNetwork, dexConfigs);
      if (pairs.length === 0 && options.enableOnchainFallback === true) {
        const onchainPairs = await onchainLiquiditySearcher({
          tokenAddress,
          network: requestedNetwork,
          dexConfigs,
        }, {
          network: requestedNetwork,
          dexConfigs,
        });
        pairs = Array.isArray(onchainPairs) ? onchainPairs : [];
      }

      const filtered = dedupTradeItems((Array.isArray(pairs) ? pairs : [])
        .map((pair) => ({
          pair,
          network: mapDexChainIdToEvmNetwork(pair?.chainId, requestedNetwork),
          liquidityUsd: toFiniteNumber(pair?.liquidity?.usd) ?? 0,
        }))
        .filter((entry) => entry.network === requestedNetwork)
        .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
        .slice(0, limit)
        .map((entry) => mapPairToTradeItem(entry.pair, requestedNetwork))
        .filter(Boolean));

      return filtered;
    } catch {
      return [];
    }
  }

  async function getTokenTradeSummary(input = {}) {
    const requestedNetwork = normalizeNetworkHint(input?.network);
    if (!requestedNetwork) {
      throw new TypeError("network 不能为空");
    }

    const pairs = await searchTradePairs({
      tokenAddress: input?.tokenAddress,
      query: input?.query,
      network: requestedNetwork,
      limit: input?.limit,
    });

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return buildEmptyTradeSummary({
        tokenAddress: input?.tokenAddress,
        query: input?.query,
        network: requestedNetwork,
      });
    }

    const top = pairs[0];
    let totalLiquidityUsd = 0;
    let totalVolume24h = 0;

    for (const item of pairs) {
      totalLiquidityUsd += toFiniteNumber(item?.extra?.liquidityUsd) ?? 0;
      totalVolume24h += toFiniteNumber(item?.extra?.volume24h) ?? 0;
    }

    return {
      chain: "evm",
      network: requestedNetwork,
      tokenAddress: String(input?.tokenAddress ?? input?.query ?? "").trim() || null,
      pairCount: pairs.length,
      topDex: String(top?.extra?.dexId ?? "").trim() || null,
      topPairAddress: String(top?.extra?.pairAddress ?? top?.address ?? "").trim() || null,
      priceUsd: toFiniteNumber(top?.extra?.priceUsd),
      liquidityUsd: toFiniteNumber(top?.extra?.liquidityUsd),
      volume24h: toFiniteNumber(top?.extra?.volume24h),
      totalLiquidityUsd,
      totalVolume24h,
      source: "dexscreener",
    };
  }

  async function searchTwoHopRoutes(input = {}) {
    const sourceTokenAddress = String(input?.tokenAddress ?? input?.query ?? "").trim();
    const requestedNetwork = normalizeNetworkHint(input?.network);
    const targetSymbol = String(input?.targetSymbol ?? "USDT").trim() || "USDT";
    const routeLimit = Number.isInteger(Number(input?.limit)) && Number(input.limit) > 0
      ? Number(input.limit)
      : 5;
    const firstHopLimit = Number.isInteger(Number(input?.firstHopLimit)) && Number(input.firstHopLimit) > 0
      ? Number(input.firstHopLimit)
      : 20;
    const secondHopLimit = Number.isInteger(Number(input?.secondHopLimit)) && Number(input.secondHopLimit) > 0
      ? Number(input.secondHopLimit)
      : 20;

    if (!requestedNetwork) {
      throw new TypeError("network 不能为空");
    }

    if (!isEvmAddress(sourceTokenAddress)) {
      return [];
    }

    const firstHopPairs = await searchTradePairs({
      tokenAddress: sourceTokenAddress,
      network: requestedNetwork,
      limit: firstHopLimit,
    });
    if (!Array.isArray(firstHopPairs) || firstHopPairs.length === 0) {
      return [];
    }

    const routes = [];
    const visitedIntermediate = new Set();

    for (const firstHop of firstHopPairs) {
      const intermediate = getIntermediateTokenFromPair(firstHop, sourceTokenAddress);
      const intermediateAddress = normalizeLower(intermediate?.address);
      if (!intermediateAddress || visitedIntermediate.has(intermediateAddress)) {
        continue;
      }
      visitedIntermediate.add(intermediateAddress);

      const secondHopPairs = await searchTradePairs({
        tokenAddress: intermediate.address,
        network: requestedNetwork,
        limit: secondHopLimit,
      });

      for (const secondHop of Array.isArray(secondHopPairs) ? secondHopPairs : []) {
        if (!pairContainsSymbol(secondHop, targetSymbol)) continue;

        const liq1 = toFiniteNumber(firstHop?.extra?.liquidityUsd) ?? 0;
        const liq2 = toFiniteNumber(secondHop?.extra?.liquidityUsd) ?? 0;
        routes.push({
          chain: "evm",
          network: requestedNetwork,
          sourceTokenAddress,
          targetSymbol: String(targetSymbol).toUpperCase(),
          intermediateToken: intermediate,
          firstHop,
          secondHop,
          bottleneckLiquidityUsd: Math.min(liq1, liq2),
        });
      }
    }

    return routes
      .sort((a, b) => {
        const bottleneckA = toFiniteNumber(a?.bottleneckLiquidityUsd) ?? 0;
        const bottleneckB = toFiniteNumber(b?.bottleneckLiquidityUsd) ?? 0;
        if (bottleneckB !== bottleneckA) return bottleneckB - bottleneckA;
        const firstA = toFiniteNumber(a?.firstHop?.extra?.liquidityUsd) ?? 0;
        const firstB = toFiniteNumber(b?.firstHop?.extra?.liquidityUsd) ?? 0;
        return firstB - firstA;
      })
      .slice(0, routeLimit);
  }

  return {
    id: "evm-trade-dexscreener",
    chain: "evm",
    networks: ["eth", "bsc"],
    capabilities: ["trade"],
    searchTradePairs,
    getTokenTradeSummary,
    searchTwoHopRoutes,
    async searchTrade(input) {
      const query = String(input?.query ?? "").trim();
      const requestedNetwork = normalizeNetworkHint(input?.network) || "eth";
      if (isEvmAddress(query)) {
        return await searchTradePairs({
          tokenAddress: query,
          network: requestedNetwork,
          limit: input?.limit,
        });
      }

      const info = await dexscreener.getTokenInfo(query, {
        network: requestedNetwork,
      });
      if (!info || !info.pairAddress) return [];
      // DexScreener 对热门 symbol 可能返回非 EVM 链（如 Solana）结果，必须过滤
      if (!isEvmChainId(info.chainId)) return [];
      const item = mapPairToTradeItem({
        chainId: info.chainId,
        dexId: info.dexId,
        pairAddress: info.pairAddress,
        priceUsd: info.priceUsd,
        liquidity: { usd: info.liquidityUsd },
        volume: { h24: info.volume24h },
        baseToken: info.baseToken,
        quoteToken: info.quoteToken,
      }, requestedNetwork);
      return item ? [item] : [];
    },
  };
}

export async function searchTradePairs(input = {}, options = {}) {
  const provider = createEvmDexScreenerTradeProvider(options);
  return await provider.searchTradePairs(input);
}

export async function getTokenTradeSummary(input = {}, options = {}) {
  const provider = createEvmDexScreenerTradeProvider(options);
  return await provider.getTokenTradeSummary(input);
}

export async function searchTwoHopRoutes(input = {}, options = {}) {
  const provider = createEvmDexScreenerTradeProvider(options);
  return await provider.searchTwoHopRoutes(input);
}

export default {
  createEvmDexScreenerTradeProvider,
  searchTradePairs,
  getTokenTradeSummary,
  searchTwoHopRoutes,
};
