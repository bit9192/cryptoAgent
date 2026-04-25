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

function pickRiskLevel(staticResult, marketResult) {
  const levels = [staticResult?.level, marketResult?.level];
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  if (levels.includes("low")) return "low";
  return "unknown";
}

export async function tokenRiskCheck(input = {}, options = {}) {
  const tokenAddress = String(input.tokenAddress ?? "").trim();
  if (!isEvmAddress(tokenAddress)) {
    throw new TypeError("tokenAddress 必须是合法 EVM 地址");
  }

  const staticChecker = options.staticChecker ?? checkTokenRiskStatic;
  const marketChecker = options.marketChecker ?? checkTokenRiskMarket;

  let staticResult = { level: "unknown", score: null, flags: ["static-unavailable"] };
  let marketResult = { level: "unknown", score: null, flags: ["market-unavailable"] };

  const sources = [];

  try {
    staticResult = await staticChecker(input);
    sources.push({ name: "static", status: "ok" });
  } catch {
    sources.push({ name: "static", status: "error" });
  }

  try {
    marketResult = await marketChecker(input);
    sources.push({ name: "market", status: "ok" });
  } catch {
    sources.push({ name: "market", status: "error" });
  }

  const riskLevel = pickRiskLevel(staticResult, marketResult);
  const fallbackScore = toScore(riskLevel);
  const staticScore = Number(staticResult?.score);
  const marketScore = Number(marketResult?.score);
  const scoreList = [staticScore, marketScore].filter((x) => Number.isFinite(x));
  const riskScore = scoreList.length > 0
    ? Math.round(scoreList.reduce((sum, x) => sum + x, 0) / scoreList.length)
    : fallbackScore;

  const riskFlags = [
    ...(Array.isArray(staticResult?.flags) ? staticResult.flags : []),
    ...(Array.isArray(marketResult?.flags) ? marketResult.flags : []),
  ];

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