import { DataSourceBase } from "../base.mjs";

function isAddressLike(value) {
  const v = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(v) || /^T[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(v);
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTokenKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function pickPairsByTokenRelevance(pairs = [], tokenQuery) {
  const query = normalizeTokenKey(tokenQuery);
  if (!query || isAddressLike(tokenQuery)) return pairs;

  const symbolMatches = pairs.filter((pair) => {
    const baseSymbol = normalizeTokenKey(pair?.baseToken?.symbol);
    const quoteSymbol = normalizeTokenKey(pair?.quoteToken?.symbol);
    return baseSymbol === query || quoteSymbol === query;
  });
  if (symbolMatches.length > 0) return symbolMatches;

  const nameMatches = pairs.filter((pair) => {
    const baseName = normalizeTokenKey(pair?.baseToken?.name);
    const quoteName = normalizeTokenKey(pair?.quoteToken?.name);
    return baseName === query || quoteName === query;
  });
  if (nameMatches.length > 0) return nameMatches;

  return pairs;
}

function normalizeNetworkName(network) {
  const raw = String(network ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "ethereum") return "eth";
  if (raw === "binance-smart-chain") return "bsc";
  if (raw === "trx") return "mainnet";
  return raw;
}

function getPreferredDexChainIds(network) {
  const net = normalizeNetworkName(network);
  if (!net) return null;
  if (net === "eth") return new Set(["ethereum", "eth"]);
  if (net === "bsc") return new Set(["bsc", "binance-smart-chain"]);
  if (net === "mainnet") return new Set(["tron", "trx"]);
  if (net === "polygon") return new Set(["polygon"]);
  if (net === "arb" || net === "arbitrum") return new Set(["arbitrum", "arb"]);
  if (net === "op" || net === "optimism") return new Set(["optimism", "op"]);
  if (net === "base") return new Set(["base"]);
  return new Set([net]);
}

function deriveTokenUsdPriceFromPair(pair, tokenQuery) {
  if (!pair) return null;

  const query = normalizeTokenKey(tokenQuery);
  const baseAddress = normalizeTokenKey(pair?.baseToken?.address);
  const quoteAddress = normalizeTokenKey(pair?.quoteToken?.address);
  const baseSymbol = normalizeTokenKey(pair?.baseToken?.symbol);
  const quoteSymbol = normalizeTokenKey(pair?.quoteToken?.symbol);
  const baseUsd = toNumberOrNull(pair?.priceUsd);

  if (!Number.isFinite(baseUsd)) return null;

  const isBase = query && (query === baseAddress || query === baseSymbol);
  if (isBase) return baseUsd;

  const isQuote = query && (query === quoteAddress || query === quoteSymbol);
  if (isQuote) {
    const priceNative = toNumberOrNull(pair?.priceNative);
    if (!Number.isFinite(priceNative) || priceNative <= 0) return null;
    return baseUsd / priceNative;
  }

  return baseUsd;
}

function pickBestPair(pairs = [], options = {}) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const preferredChainIds = options.preferredChainIds instanceof Set
    ? options.preferredChainIds
    : null;

  const inPreferredChain = preferredChainIds && preferredChainIds.size > 0
    ? pairs.filter((pair) => preferredChainIds.has(String(pair?.chainId ?? "").trim().toLowerCase()))
    : [];

  const pool = inPreferredChain.length > 0 ? inPreferredChain : pairs;
  const sorted = [...pool].sort((a, b) => {
    const liqA = Number(a?.liquidity?.usd ?? 0);
    const liqB = Number(b?.liquidity?.usd ?? 0);
    if (liqB !== liqA) return liqB - liqA;
    const volA = Number(a?.volume?.h24 ?? 0);
    const volB = Number(b?.volume?.h24 ?? 0);
    return volB - volA;
  });
  return sorted[0];
}

function normalizePair(pair) {
  if (!pair) return null;
  return {
    chainId: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    priceUsd: toNumberOrNull(pair.priceUsd),
    priceNative: toNumberOrNull(pair.priceNative),
    liquidityUsd: toNumberOrNull(pair?.liquidity?.usd),
    volume24h: toNumberOrNull(pair?.volume?.h24),
    baseToken: pair.baseToken ?? null,
    quoteToken: pair.quoteToken ?? null,
    fdv: toNumberOrNull(pair.fdv),
    marketCap: toNumberOrNull(pair.marketCap),
    pairCreatedAt: pair.pairCreatedAt ?? null,
    info: pair.info ?? null,
    labels: pair.labels ?? [],
  };
}

function mapChainIdToChainNetwork(chainId) {
  const raw = String(chainId ?? "").trim().toLowerCase();
  if (["ethereum", "eth"].includes(raw)) return { chain: "evm", network: "eth" };
  if (["bsc", "binance-smart-chain"].includes(raw)) return { chain: "evm", network: "bsc" };
  if (["tron", "trx"].includes(raw)) return { chain: "trx", network: "mainnet" };
  if (["bitcoin", "btc"].includes(raw)) return { chain: "btc", network: "mainnet" };
  return { chain: null, network: null };
}

export class DexScreenerSource extends DataSourceBase {
  metadata = {
    name: "dexscreener",
    version: "1.0.0",
    description: "DexScreener - DEX pairs, token prices, liquidity and trading stats",
    capabilities: ["getPrice", "getTokenInfo", "getPairInfo"],
    rateLimit: { requests: 60, period: 60000 },
    cacheTTL: 30000,
  };

  constructor(options = {}) {
    super(options);
    this.baseUrl = options.baseUrl ?? "https://api.dexscreener.com/latest/dex";
    this.timeout = options.timeout ?? 5000;
  }

  async init(config = {}) {
    this.baseUrl = config.baseUrl ?? this.baseUrl;
    this.timeout = config.timeout ?? this.timeout;
    this.state = DataSourceBase.State.HEALTHY;
  }

  async requestJson(url) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`DexScreener API 错误: ${response.status}`);
    }

    return response.json();
  }

  async healthCheck() {
    const start = Date.now();
    await this.requestJson(`${this.baseUrl}/search?q=usdt`);
    this.recordSuccess(Date.now() - start);
    return { ok: true };
  }

  async getPairInfo(chainId, pairAddress) {
    const start = Date.now();
    const data = await this.requestJson(`${this.baseUrl}/pairs/${chainId}/${pairAddress}`);
    const pair = pickBestPair(data?.pairs ?? []);
    this.recordSuccess(Date.now() - start);
    return normalizePair(pair);
  }

  async resolvePairs(tokenQuery) {
    const token = String(tokenQuery ?? "").trim();
    if (!token) return [];

    if (isAddressLike(token)) {
      const data = await this.requestJson(`${this.baseUrl}/tokens/${token}`);
      return data?.pairs ?? [];
    }

    const data = await this.requestJson(`${this.baseUrl}/search?q=${encodeURIComponent(token)}`);
    return data?.pairs ?? [];
  }

  async getPrice(tokens, options = {}) {
    const start = Date.now();
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];
    const out = {};
    const preferredChainIds = getPreferredDexChainIds(options.network);

    for (const token of tokenList) {
      const pairs = await this.resolvePairs(token);
      const relevantPairs = pickPairsByTokenRelevance(pairs, token);
      const best = pickBestPair(relevantPairs, { preferredChainIds });
      const priceUsd = deriveTokenUsdPriceFromPair(best, token);
      out[String(token)] = best
        ? {
          usd: priceUsd,
          chainId: best.chainId,
          dexId: best.dexId,
          pairAddress: best.pairAddress,
          liquidityUsd: toNumberOrNull(best?.liquidity?.usd),
          volume24h: toNumberOrNull(best?.volume?.h24),
        }
        : null;
    }

    this.recordSuccess(Date.now() - start);
    return out;
  }

  async getTokenInfo(token, options = {}) {
    const start = Date.now();
    const pairs = await this.resolvePairs(token);
    const preferredChainIds = getPreferredDexChainIds(options.network);
    const relevantPairs = pickPairsByTokenRelevance(pairs, token);
    const best = pickBestPair(relevantPairs, { preferredChainIds });

    this.recordSuccess(Date.now() - start);

    if (!best) {
      return null;
    }

    return {
      source: "dexscreener",
      query: String(token),
      chainId: best.chainId,
      dexId: best.dexId,
      pairAddress: best.pairAddress,
      baseToken: best.baseToken ?? null,
      quoteToken: best.quoteToken ?? null,
      priceUsd: toNumberOrNull(best.priceUsd),
      liquidityUsd: toNumberOrNull(best?.liquidity?.usd),
      volume24h: toNumberOrNull(best?.volume?.h24),
      fdv: toNumberOrNull(best.fdv),
      marketCap: toNumberOrNull(best.marketCap),
      info: best.info ?? null,
      labels: best.labels ?? [],
    };
  }

  async getTokenCandidates(token, options = {}) {
    const start = Date.now();
    const pairs = await this.resolvePairs(token);
    const preferredChainIds = getPreferredDexChainIds(options.network);
    const relevantPairs = pickPairsByTokenRelevance(pairs, token);

    const ranked = [...relevantPairs].sort((a, b) => {
      const aPreferred = preferredChainIds?.has?.(String(a?.chainId ?? "").trim().toLowerCase()) ? 1 : 0;
      const bPreferred = preferredChainIds?.has?.(String(b?.chainId ?? "").trim().toLowerCase()) ? 1 : 0;
      if (bPreferred !== aPreferred) return bPreferred - aPreferred;
      const liqA = Number(a?.liquidity?.usd ?? 0);
      const liqB = Number(b?.liquidity?.usd ?? 0);
      if (liqB !== liqA) return liqB - liqA;
      const volA = Number(a?.volume?.h24 ?? 0);
      const volB = Number(b?.volume?.h24 ?? 0);
      return volB - volA;
    });

    const dedup = new Map();
    for (const pair of ranked) {
      const base = pair?.baseToken ?? null;
      const quote = pair?.quoteToken ?? null;
      for (const tokenSide of [base, quote]) {
        const tokenAddress = String(tokenSide?.address ?? "").trim();
        if (!tokenAddress) continue;
        const { chain, network } = mapChainIdToChainNetwork(pair?.chainId);
        const key = `${String(pair?.chainId ?? "").toLowerCase()}:${tokenAddress.toLowerCase()}`;
        if (dedup.has(key)) continue;
        dedup.set(key, {
          chain,
          network,
          chainId: pair?.chainId ?? null,
          tokenAddress,
          symbol: tokenSide?.symbol ?? null,
          name: tokenSide?.name ?? null,
          dexId: pair?.dexId ?? null,
          pairAddress: pair?.pairAddress ?? null,
          liquidityUsd: toNumberOrNull(pair?.liquidity?.usd),
          volume24h: toNumberOrNull(pair?.volume?.h24),
        });
      }
    }

    this.recordSuccess(Date.now() - start);
    return [...dedup.values()].slice(0, Math.max(1, Number(options.limit ?? 10)));
  }
}

export default DexScreenerSource;
