function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function createPortfolioSummaryState() {
  return {
    byChain: {},
    totalValueUsd: 0,
  };
}

export function addAddressAssetsToSummary(state, payload = {}) {
  const chain = normalizeLower(payload?.chain) || "unknown";
  const address = String(payload?.address ?? "").trim() || null;
  const assets = Array.isArray(payload?.assets) ? payload.assets : [];

  if (!state.byChain[chain]) {
    state.byChain[chain] = {
      totalValueUsd: 0,
      assets: [],
      addresses: [],
    };
  }

  const target = state.byChain[chain];
  if (address && !target.addresses.includes(address)) {
    target.addresses.push(address);
  }

  for (const asset of assets) {
    const valuation = asset?.extra?.valuation && typeof asset.extra.valuation === "object"
      ? asset.extra.valuation
      : {};
    const valueUsd = Number(valuation?.valueUsd ?? 0);
    const safeValue = Number.isFinite(valueUsd) ? valueUsd : 0;

    target.assets.push(asset);
    target.totalValueUsd += safeValue;
    state.totalValueUsd += safeValue;
  }
}

export default {
  createPortfolioSummaryState,
  addAddressAssetsToSummary,
};
