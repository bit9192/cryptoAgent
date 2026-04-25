import { DexScreenerSource } from "../../offchain/sources/dexscreener/index.mjs";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNetwork(value) {
  return normalizeText(value).toLowerCase() || "mainnet";
}

function normalizeLimit(value) {
  const n = Number(value ?? 10);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(Math.floor(n), 100);
}

function isTrxAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeText(value));
}

function toNumberOrZero(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toTradeItem(pair, tokenAddress) {
  const pairAddress = normalizeText(pair?.pairAddress);
  if (!pairAddress) return null;

  const dexId = normalizeText(pair?.dexId) || "dex";
  const baseSymbol = normalizeText(pair?.baseToken?.symbol) || "TOKEN";
  const quoteSymbol = normalizeText(pair?.quoteToken?.symbol) || "QUOTE";

  return {
    domain: "trade",
    chain: "trx",
    network: "mainnet",
    id: `trade:trx:mainnet:${tokenAddress}:${pairAddress}`,
    title: `${baseSymbol}/${quoteSymbol} (${dexId})`,
    symbol: baseSymbol,
    address: tokenAddress,
    source: "dexscreener",
    confidence: 0.9,
    extra: {
      pairAddress,
      dexId,
      pairLabel: `${baseSymbol}/${quoteSymbol}`,
      priceNative: pair?.priceNative ?? null,
      priceUsd: pair?.priceUsd ?? null,
      liquidityUsd: toNumberOrZero(pair?.liquidity?.usd),
      volume24h: toNumberOrZero(pair?.volume?.h24),
    },
  };
}

function createDexScreenerFacade(options = {}) {
  const source = new DexScreenerSource(options);
  let inited = false;

  async function ensureInit() {
    if (inited) return;
    await source.init();
    inited = true;
  }

  return {
    async resolvePairs(tokenAddress) {
      await ensureInit();
      const rows = await source.resolvePairs(tokenAddress);
      return Array.isArray(rows) ? rows : [];
    },
  };
}

export function createTrxTradeSearchProvider(options = {}) {
  const dexSource = options.dexSource ?? createDexScreenerFacade(options);

  async function searchTrade(input = {}) {
    const query = normalizeText(input?.query);
    if (!query) {
      throw new TypeError("query 不能为空");
    }

    const network = normalizeNetwork(input?.network);
    const limit = normalizeLimit(input?.limit);

    if (network !== "mainnet") {
      return [];
    }

    if (!isTrxAddress(query)) {
      return [];
    }

    try {
      const pairs = await dexSource.resolvePairs(query, { network });
      return (Array.isArray(pairs) ? pairs : [])
        .filter((pair) => {
          const chainId = normalizeText(pair?.chainId).toLowerCase();
          return chainId === "tron" || chainId === "trx";
        })
        .sort((a, b) => toNumberOrZero(b?.liquidity?.usd) - toNumberOrZero(a?.liquidity?.usd))
        .slice(0, limit)
        .map((pair) => toTradeItem(pair, query))
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  return {
    id: "trx-trade",
    chain: "trx",
    networks: ["mainnet"],
    capabilities: ["trade"],
    searchTrade,
  };
}

export default {
  createTrxTradeSearchProvider,
};
