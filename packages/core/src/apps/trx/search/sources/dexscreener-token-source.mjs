import { DexScreenerSource } from "../../../offchain/sources/dexscreener/index.mjs";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNetwork(value) {
  return normalizeText(value).toLowerCase() || "mainnet";
}

function normalizeLimit(value) {
  const n = Number(value ?? 20);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(Math.floor(n), 100);
}

function normalizeMatchMode(value) {
  const mode = normalizeText(value).toLowerCase();
  return mode === "exact" ? "exact" : "fuzzy";
}

function looksLikeTrxAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeText(value));
}

function pickExactMatches(candidates = [], query) {
  const raw = normalizeText(query);
  if (!raw) return [];

  const lower = raw.toLowerCase();
  const upper = raw.toUpperCase();

  if (looksLikeTrxAddress(raw)) {
    return (Array.isArray(candidates) ? candidates : [])
      .filter((item) => normalizeText(item?.address).toLowerCase() === lower);
  }

  const exactSymbol = (Array.isArray(candidates) ? candidates : [])
    .filter((item) => normalizeText(item?.symbol).toUpperCase() === upper);
  if (exactSymbol.length > 0) {
    return exactSymbol;
  }

  return (Array.isArray(candidates) ? candidates : [])
    .filter((item) => normalizeText(item?.name).toLowerCase() === lower);
}

function scoreFuzzyCandidate(item = {}, query) {
  const raw = normalizeText(query);
  if (!raw) return 0;

  const qLower = raw.toLowerCase();
  const qUpper = raw.toUpperCase();
  const symbol = normalizeText(item?.symbol).toUpperCase();
  const name = normalizeText(item?.name).toLowerCase();

  if (!symbol && !name) return 0;
  if (symbol === qUpper) return 100;
  if (name === qLower) return 90;
  if (symbol.startsWith(qUpper)) return 80;
  if (name.startsWith(qLower)) return 70;
  if (symbol.includes(qUpper)) return 60;
  if (name.includes(qLower)) return 50;
  // Query expansion fallback: DOGE should be able to match DOG-like symbols.
  if (symbol.length >= 3 && qUpper.includes(symbol)) return 40;
  return 0;
}

function pickFuzzyMatches(candidates = [], query, limit = 20) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((item) => ({ item, score: scoreFuzzyCandidate(item, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const liqA = Number(a?.item?.extra?.liquidityUsd ?? 0);
      const liqB = Number(b?.item?.extra?.liquidityUsd ?? 0);
      return liqB - liqA;
    })
    .slice(0, limit)
    .map((row) => row.item);
}

function normalizeCandidate(row = {}) {
  const address = normalizeText(row?.tokenAddress);
  const symbol = normalizeText(row?.symbol).toUpperCase();
  const name = normalizeText(row?.name);

  if (!looksLikeTrxAddress(address)) {
    return null;
  }

  return {
    name,
    symbol,
    address,
    decimals: null,
    source: "remote-dexscreener",
    confidence: 0.78,
    extra: {
      remote: true,
      source: "dexscreener",
      dexId: row?.dexId ?? null,
      pairAddress: row?.pairAddress ?? null,
      liquidityUsd: Number.isFinite(Number(row?.liquidityUsd)) ? Number(row.liquidityUsd) : null,
      volume24h: Number.isFinite(Number(row?.volume24h)) ? Number(row.volume24h) : null,
    },
  };
}

export function createTrxDexScreenerTokenSource(options = {}) {
  const source = options.source ?? new DexScreenerSource(options);
  let initPromise = null;

  async function ensureInit() {
    if (!initPromise) {
      initPromise = source.init();
    }
    await initPromise;
  }

  async function search(input = {}) {
    const query = normalizeText(input?.query);
    const network = normalizeNetwork(input?.network);
    const limit = normalizeLimit(input?.limit);
    const matchMode = normalizeMatchMode(input?.matchMode);

    if (!query) return [];
    if (network !== "mainnet") return [];

    try {
      await ensureInit();
      const candidates = await source.getTokenCandidates(query, {
        network,
        limit,
      });

      const normalized = (Array.isArray(candidates) ? candidates : [])
        .filter((row) => String(row?.chain ?? "").toLowerCase() === "trx")
        .map((row) => normalizeCandidate(row))
        .filter(Boolean);

      const exact = pickExactMatches(normalized, query);
      if (matchMode === "exact") {
        return exact.slice(0, limit);
      }

      // fuzzy mode: prefer exact result set if available, else fallback to fuzzy rank.
      if (exact.length > 0) {
        return exact.slice(0, limit);
      }

      return pickFuzzyMatches(normalized, query, limit);
    } catch {
      return [];
    }
  }

  return {
    search,
  };
}

export default {
  createTrxDexScreenerTokenSource,
};
