function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function extractEvmPortfolioRiskFlags(payload = {}) {
  const address = String(payload?.address ?? "").trim() || null;
  const assets = Array.isArray(payload?.assets) ? payload.assets : [];
  const out = [];

  for (const asset of assets) {
    if (normalizeLower(asset?.chain) !== "evm") continue;

    const valuation = asset?.extra?.valuation && typeof asset.extra.valuation === "object"
      ? asset.extra.valuation
      : {};
    const quantity = toNumber(valuation?.quantity);
    const priceUsd = toNumber(valuation?.priceUsd);
    if (quantity > 0 && priceUsd === 0) {
      out.push({
        chain: "evm",
        network: String(asset?.network ?? "").trim() || null,
        address,
        asset: String(asset?.symbol ?? asset?.title ?? "ASSET").trim(),
        tokenAddress: String(asset?.tokenAddress ?? "").trim() || null,
        reason: "price=0",
      });
    }
  }

  return out;
}

export default {
  extractEvmPortfolioRiskFlags,
};