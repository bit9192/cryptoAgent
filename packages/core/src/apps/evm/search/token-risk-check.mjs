import { checkTokenRiskStatic } from "./token-risk-static.mjs";
import { checkTokenRiskMarket } from "./token-risk-market.mjs";

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value ?? "").trim());
}

function toScore(level) {
  if (level === "high") return 85;
  if (level === "medium") return 55;
  if (level === "low") return 20;
  return null;
}

function pickRiskLevel(staticResult, marketResult, contractResult) {
  const tradeResult = arguments.length > 3 ? arguments[3] : null;
  const levels = [staticResult?.level, marketResult?.level, contractResult?.level, tradeResult?.level];
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  if (levels.includes("low")) return "low";
  return "unknown";
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeResult(input, fallbackFlag) {
  const level = String(input?.level ?? "unknown").trim().toLowerCase();
  const rawScore = input?.score;
  const hasScore = rawScore !== null && rawScore !== undefined && rawScore !== "";
  const scoreRaw = hasScore ? Number(rawScore) : Number.NaN;
  const flags = Array.isArray(input?.flags) ? input.flags : [];
  return {
    level: ["high", "medium", "low"].includes(level) ? level : "unknown",
    score: Number.isFinite(scoreRaw) ? scoreRaw : null,
    flags: flags.length > 0 ? flags : [fallbackFlag],
  };
}

function createSourceDetail(name, status, result, reason = null) {
  return {
    name,
    status,
    level: result?.level ?? "unknown",
    score: result?.score ?? null,
    flagsCount: Array.isArray(result?.flags) ? result.flags.length : 0,
    reason,
    updatedAt: nowIso(),
  };
}

function toFiniteScore(value) {
  if (value === null || value === undefined || value === "") return Number.NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTradeSummary(summary = {}) {
  return {
    pairCount: Number.isFinite(Number(summary?.pairCount)) ? Number(summary.pairCount) : 0,
    liquidityUsd: toFiniteNumber(summary?.totalLiquidityUsd ?? summary?.liquidityUsd) ?? 0,
    volume24h: toFiniteNumber(summary?.totalVolume24h ?? summary?.volume24h) ?? 0,
  };
}

function mapTradeSummaryToRisk(summary = {}, options = {}) {
  const normalized = normalizeTradeSummary(summary);
  const highRiskLiquidityUsd = Number.isFinite(Number(options?.highRiskLiquidityUsd))
    ? Number(options.highRiskLiquidityUsd)
    : 50000;
  const mediumRiskLiquidityUsd = Number.isFinite(Number(options?.mediumRiskLiquidityUsd))
    ? Number(options.mediumRiskLiquidityUsd)
    : 250000;

  if (normalized.pairCount <= 0) {
    return {
      level: "unknown",
      score: null,
      flags: ["trade-no-route"],
    };
  }

  if (normalized.liquidityUsd < highRiskLiquidityUsd) {
    return {
      level: "high",
      score: 85,
      flags: ["trade-low-liquidity"],
    };
  }

  if (normalized.liquidityUsd < mediumRiskLiquidityUsd) {
    return {
      level: "medium",
      score: 55,
      flags: ["trade-limited-liquidity"],
    };
  }

  return {
    level: "low",
    score: 20,
    flags: [],
  };
}

export async function tokenRiskCheck(input = {}, options = {}) {
  const tokenAddress = String(input.tokenAddress ?? "").trim();
  if (!isEvmAddress(tokenAddress)) {
    throw new TypeError("tokenAddress 必须是合法 EVM 地址");
  }

  const staticChecker = options.staticChecker ?? checkTokenRiskStatic;
  const marketChecker = options.marketChecker ?? checkTokenRiskMarket;
  const staticOptions = options.staticOptions && typeof options.staticOptions === "object"
    ? options.staticOptions
    : {};
  const marketOptions = options.marketOptions && typeof options.marketOptions === "object"
    ? options.marketOptions
    : {};
  const contractOptions = options.contractOptions && typeof options.contractOptions === "object"
    ? options.contractOptions
    : {};

  const contractChecker = typeof options.contractChecker === "function"
    ? options.contractChecker
    : null;
  const tradeSummaryChecker = typeof options.tradeSummaryChecker === "function"
    ? options.tradeSummaryChecker
    : null;
  const tradeOptions = options.tradeOptions && typeof options.tradeOptions === "object"
    ? options.tradeOptions
    : {};

  let staticResult = { level: "unknown", score: null, flags: ["static-unavailable"] };
  let marketResult = { level: "unknown", score: null, flags: ["market-unavailable"] };
  let contractResult = normalizeResult(input.contractRisk, "contract-unavailable");
  let tradeResult = { level: "unknown", score: null, flags: ["trade-unavailable"] };
  let hasTradeSource = false;

  const sources = [];

  try {
    staticResult = normalizeResult(await staticChecker(input, staticOptions), "static-unavailable");
    sources.push(createSourceDetail("static", "ok", staticResult));
  } catch {
    staticResult = { level: "unknown", score: null, flags: ["static-unavailable"] };
    sources.push(createSourceDetail("static", "error", staticResult, "checker-error"));
  }

  try {
    marketResult = normalizeResult(await marketChecker(input, marketOptions), "market-unavailable");
    sources.push(createSourceDetail("market", "ok", marketResult));
  } catch {
    marketResult = { level: "unknown", score: null, flags: ["market-unavailable"] };
    sources.push(createSourceDetail("market", "error", marketResult, "checker-error"));
  }

  if (contractChecker) {
    try {
      contractResult = normalizeResult(await contractChecker(input, contractOptions), "contract-unavailable");
      sources.push(createSourceDetail("contract", "ok", contractResult));
    } catch {
      contractResult = { level: "unknown", score: null, flags: ["contract-unavailable"] };
      sources.push(createSourceDetail("contract", "error", contractResult, "checker-error"));
    }
  } else if (input.contractRisk && typeof input.contractRisk === "object") {
    sources.push(createSourceDetail("contract", "ok", contractResult, "input-contract-risk"));
  } else {
    sources.push(createSourceDetail("contract", "skipped", contractResult, "checker-not-configured"));
  }

  if (tradeSummaryChecker) {
    hasTradeSource = true;
    try {
      tradeResult = normalizeResult(
        mapTradeSummaryToRisk(await tradeSummaryChecker(input, tradeOptions), tradeOptions),
        "trade-unavailable",
      );
      sources.push(createSourceDetail("trade", "ok", tradeResult));
    } catch {
      tradeResult = { level: "unknown", score: null, flags: ["trade-unavailable"] };
      sources.push(createSourceDetail("trade", "error", tradeResult, "checker-error"));
    }
  } else if (input.tradeSummary && typeof input.tradeSummary === "object") {
    hasTradeSource = true;
    tradeResult = normalizeResult(
      mapTradeSummaryToRisk(input.tradeSummary, tradeOptions),
      "trade-unavailable",
    );
    sources.push(createSourceDetail("trade", "ok", tradeResult, "input-trade-summary"));
  }

  const riskLevel = pickRiskLevel(staticResult, marketResult, contractResult, hasTradeSource ? tradeResult : null);
  const fallbackScore = toScore(riskLevel);
  const staticScore = toFiniteScore(staticResult?.score);
  const marketScore = toFiniteScore(marketResult?.score);
  const contractScore = toFiniteScore(contractResult?.score);
  const tradeScore = hasTradeSource ? toFiniteScore(tradeResult?.score) : Number.NaN;
  const scoreList = [staticScore, marketScore, contractScore, tradeScore].filter((x) => Number.isFinite(x));
  const riskScore = scoreList.length > 0
    ? Math.round(scoreList.reduce((sum, x) => sum + x, 0) / scoreList.length)
    : fallbackScore;

  const riskFlags = [...new Set([
    ...(Array.isArray(staticResult?.flags) ? staticResult.flags : []),
    ...(Array.isArray(marketResult?.flags) ? marketResult.flags : []),
    ...(Array.isArray(contractResult?.flags) ? contractResult.flags : []),
    ...(hasTradeSource && Array.isArray(tradeResult?.flags) ? tradeResult.flags : []),
  ])];

  return {
    riskLevel,
    riskScore,
    riskFlags,
    sources,
  };
}

export default {
  tokenRiskCheck,
};