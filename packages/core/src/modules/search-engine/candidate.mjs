import { normalizeLower, normalizeDomain, normalizeNetworkHint } from "./utils.mjs";

export function normalizeCandidate(raw, defaults = {}) {
  if (!raw || typeof raw !== "object") return null;
  const chain = String(raw.chain ?? defaults.chain ?? "").trim();
  const network = String(raw.network ?? defaults.network ?? "").trim();
  const address = String(raw.address ?? raw.tokenAddress ?? "").trim();
  const tokenAddress = String(raw.tokenAddress ?? address).trim();
  if (!chain || !network || !address) return null;
  const domain = normalizeDomain(raw.domain ?? defaults.domain ?? "token");

  const confidenceNum = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceNum)
    ? Math.max(0, Math.min(1, confidenceNum))
    : 0.5;

  const normalizedId = String(raw.id ?? `${normalizeLower(domain)}:${normalizeLower(chain)}:${normalizeLower(network)}:${normalizeLower(address)}`);
  const title = raw.title != null
    ? String(raw.title)
    : String(raw.name ?? raw.symbol ?? raw.tokenAddress ?? raw.address ?? "");

  let extra = {};
  if (raw.extra && typeof raw.extra === "object" && !Array.isArray(raw.extra)) {
    extra = { ...raw.extra };
  }
  if (raw.txHash != null) extra.txHash = raw.txHash;
  if (raw.routeSummary != null) extra.routeSummary = raw.routeSummary;
  if (raw.riskLevel != null) extra.riskLevel = raw.riskLevel;
  if (raw.tags != null) extra.tags = raw.tags;
  if (raw.score != null) extra.score = raw.score;

  return {
    domain,
    id: normalizedId,
    title,
    chain,
    network,
    address,
    tokenAddress,
    symbol: raw.symbol == null ? null : String(raw.symbol),
    name: raw.name == null ? null : String(raw.name),
    decimals: raw.decimals == null ? null : Number(raw.decimals),
    source: String(raw.source ?? defaults.source ?? "provider"),
    providerId: String(raw.providerId ?? defaults.providerId ?? "unknown"),
    confidence,
    extra,
  };
}

export function resolveCandidateRank(candidate, input = {}, rankConfig = {}) {
  let rank = 0;
  const chain = normalizeLower(candidate.chain);
  const network = normalizeLower(candidate.network);
  const inputChain = normalizeLower(input.chain);
  const inputNetwork = normalizeNetworkHint(input.network);

  if (inputChain && inputChain === chain) rank += 200;
  if (inputNetwork) {
    if (inputNetwork === network) rank += 160;
    if (inputNetwork === chain) rank += 150;
  }

  if (network === "mainnet") rank += 6;

  const chainPriority = rankConfig.chainPriority && typeof rankConfig.chainPriority === "object"
    ? rankConfig.chainPriority
    : {};
  const networkPriority = rankConfig.networkPriority && typeof rankConfig.networkPriority === "object"
    ? rankConfig.networkPriority
    : {};

  const chainWeight = Number(chainPriority[chain]);
  const networkWeight = Number(networkPriority[network]);

  if (Number.isFinite(chainWeight)) rank += chainWeight;
  if (Number.isFinite(networkWeight)) rank += networkWeight;

  return rank;
}

export function dedupeAndSortCandidates(candidates, query, input = {}, rankConfig = {}) {
  const dedupMap = new Map();
  const queryLower = normalizeLower(query);

  for (const row of candidates) {
    const key = String(row.id ?? `${normalizeLower(row.chain)}:${normalizeLower(row.network)}:${normalizeLower(row.address ?? row.tokenAddress)}`);
    const old = dedupMap.get(key);
    if (!old || row.confidence > old.confidence) {
      dedupMap.set(key, row);
    }
  }

  const list = [...dedupMap.values()];
  list.sort((a, b) => {
    const aExact = normalizeLower(a.symbol) === queryLower ? 1 : 0;
    const bExact = normalizeLower(b.symbol) === queryLower ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const aRank = resolveCandidateRank(a, input, rankConfig);
    const bRank = resolveCandidateRank(b, input, rankConfig);
    if (aRank !== bRank) return bRank - aRank;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return normalizeLower(a.tokenAddress).localeCompare(normalizeLower(b.tokenAddress));
  });

  return list;
}

export default {
  normalizeCandidate,
  resolveCandidateRank,
  dedupeAndSortCandidates,
};
