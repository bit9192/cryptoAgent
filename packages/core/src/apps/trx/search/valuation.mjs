function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildTrxAssetValuationInput(asset = {}) {
  const extra = asset?.extra && typeof asset.extra === "object" ? asset.extra : {};
  const protocol = String(extra?.protocol ?? "").trim().toLowerCase();

  if (protocol === "native" || String(extra?.assetType ?? "").trim().toLowerCase() === "native") {
    return {
      quantity: parseNumber(extra?.balance ?? 0),
      priceQuery: "TRX",
      priceNetwork: "trx",
    };
  }

  return {
    quantity: parseNumber(extra?.balance ?? 0),
    priceQuery: String(extra?.contractAddress ?? asset?.tokenAddress ?? asset?.symbol ?? "").trim(),
    priceNetwork: "trx",
  };
}

export default {
  buildTrxAssetValuationInput,
};
