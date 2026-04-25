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
  const levels = [staticResult?.level, marketResult?.level, contractResult?.level];
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
  const scoreRaw = Number(input?.score);
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

  let staticResult = { level: "unknown", score: null, flags: ["static-unavailable"] };
  let marketResult = { level: "unknown", score: null, flags: ["market-unavailable"] };
  let contractResult = normalizeResult(input.contractRisk, "contract-unavailable");

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

  const riskLevel = pickRiskLevel(staticResult, marketResult, contractResult);
  const fallbackScore = toScore(riskLevel);
  const staticScore = Number(staticResult?.score);
  const marketScore = Number(marketResult?.score);
  const contractScore = Number(contractResult?.score);
  const scoreList = [staticScore, marketScore, contractScore].filter((x) => Number.isFinite(x));
  const riskScore = scoreList.length > 0
    ? Math.round(scoreList.reduce((sum, x) => sum + x, 0) / scoreList.length)
    : fallbackScore;

  const riskFlags = [...new Set([
    ...(Array.isArray(staticResult?.flags) ? staticResult.flags : []),
    ...(Array.isArray(marketResult?.flags) ? marketResult.flags : []),
    ...(Array.isArray(contractResult?.flags) ? contractResult.flags : []),
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