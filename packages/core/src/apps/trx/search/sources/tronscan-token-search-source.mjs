import "../../../../load-env.mjs";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNetwork(value) {
  return normalizeText(value).toLowerCase() || "mainnet";
}

function normalizeLimit(value) {
  const n = Number(value ?? 20);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(Math.floor(n), 50);
}

function normalizeMatchMode(value) {
  const mode = normalizeText(value).toLowerCase();
  return mode === "exact" ? "exact" : "fuzzy";
}

function looksLikeTrxAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeText(value));
}

function normalizeCandidate(row = {}) {
  const address = normalizeText(row?.token_id);
  const symbol = normalizeText(row?.abbr).toUpperCase();
  const name = normalizeText(row?.name);

  if (!looksLikeTrxAddress(address)) {
    return null;
  }

  return {
    name,
    symbol,
    address,
    decimals: null,
    source: "remote-tronscan",
    confidence: 0.85,
    extra: {
      remote: true,
      source: "tronscan",
      vip: row?.vip === true,
      level: row?.level ?? null,
      holders: Number.isFinite(Number(row?.holders)) ? Number(row.holders) : null,
      marketCapUsd: Number.isFinite(Number(row?.market_cap_usd)) ? Number(row.market_cap_usd) : null,
      volume24h: Number.isFinite(Number(row?.volume24h)) ? Number(row.volume24h) : null,
    },
  };
}

function pickExactMatches(candidates = [], query) {
  const raw = normalizeText(query);
  if (!raw) return [];

  const lower = raw.toLowerCase();
  const upper = raw.toUpperCase();

  if (looksLikeTrxAddress(raw)) {
    return candidates.filter((item) => normalizeText(item?.address).toLowerCase() === lower);
  }

  const exactSymbol = candidates.filter((item) => normalizeText(item?.symbol).toUpperCase() === upper);
  if (exactSymbol.length > 0) return exactSymbol;

  return candidates.filter((item) => normalizeText(item?.name).toLowerCase() === lower);
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
  return 0;
}

function pickFuzzyMatches(candidates = [], query, limit = 20) {
  return candidates
    .map((item) => ({ item, score: scoreFuzzyCandidate(item, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const capA = Number(a.item?.extra?.marketCapUsd ?? 0);
      const capB = Number(b.item?.extra?.marketCapUsd ?? 0);
      return capB - capA;
    })
    .slice(0, limit)
    .map((row) => row.item);
}

export function createTronscanTokenSearchSource(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  function resolveApiKey() {
    return normalizeText(
      options.apiKey
        ?? process.env.TRXERSCAN_API_KEY
        ?? process.env.TRX_MAINNET_API_KEY
        ?? process.env.TRX_API_KEY
        ?? "",
    );
  }

  function resolveApiBase() {
    return normalizeText(
      options.apiBase ?? process.env.TRXSCAN_API_BASE ?? "https://apilist.tronscan.org",
    ).replace(/\/+$/, "");
  }

  async function fetchCandidates(query, limit) {
    const apiKey = resolveApiKey();
    const apiBase = resolveApiBase();

    const url = new URL(`${apiBase}/api/search/v2`);
    url.searchParams.set("term", query);
    url.searchParams.set("type", "token");
    url.searchParams.set("start", "0");
    url.searchParams.set("limit", String(Math.min(limit, 50)));

    const headers = { accept: "application/json" };
    if (apiKey) {
      headers["TRON-PRO-API-KEY"] = apiKey;
    }

    const response = await fetchImpl(url.toString(), { method: "GET", headers });

    if (!response.ok) {
      throw new Error(`Tronscan search failed: HTTP ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json?.Error) {
      throw new Error(`Tronscan search error: ${json.Error}`);
    }

    return Array.isArray(json?.token) ? json.token : [];
  }

  async function search(input = {}) {
    const query = normalizeText(input?.query);
    const network = normalizeNetwork(input?.network);
    const limit = normalizeLimit(input?.limit);
    const matchMode = normalizeMatchMode(input?.matchMode);

    if (!query) return [];
    if (network !== "mainnet") return [];

    try {
      const rows = await fetchCandidates(query, limit);

      const candidates = rows
        .map((row) => normalizeCandidate(row))
        .filter(Boolean);

      const exact = pickExactMatches(candidates, query);
      if (matchMode === "exact") {
        return exact.slice(0, limit);
      }

      if (exact.length > 0) {
        return exact.slice(0, limit);
      }

      return pickFuzzyMatches(candidates, query, limit);
    } catch {
      return [];
    }
  }

  return { search };
}

export default { createTronscanTokenSearchSource };
