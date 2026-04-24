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

function pickBestPair(pairs = []) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const sorted = [...pairs].sort((a, b) => {
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

  async getPrice(tokens) {
    const start = Date.now();
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];
    const out = {};

    for (const token of tokenList) {
      const pairs = await this.resolvePairs(token);
      const best = pickBestPair(pairs);
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

  async getTokenInfo(token) {
    const start = Date.now();
    const pairs = await this.resolvePairs(token);
    const best = pickBestPair(pairs);

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
}

export default DexScreenerSource;
