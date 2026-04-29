import { extractEvmPortfolioRiskFlags } from "../../../../apps/evm/search/risk.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

const PORTFOLIO_RISK_EXTRACTORS = Object.freeze({
  evm: extractEvmPortfolioRiskFlags,
});

export function extractPortfolioRiskFlags(payload = {}) {
  const assets = Array.isArray(payload?.assets) ? payload.assets : [];
  if (assets.length === 0) {
    return [];
  }

  const grouped = new Map();
  for (const asset of assets) {
    const chain = normalizeLower(asset?.chain);
    if (!chain) continue;
    const list = grouped.get(chain) ?? [];
    list.push(asset);
    grouped.set(chain, list);
  }

  const out = [];
  for (const [chain, chainAssets] of grouped.entries()) {
    const extractor = PORTFOLIO_RISK_EXTRACTORS[chain];
    if (typeof extractor !== "function") continue;
    out.push(...extractor({
      ...payload,
      assets: chainAssets,
    }));
  }

  return out;
}

export default {
  extractPortfolioRiskFlags,
};
