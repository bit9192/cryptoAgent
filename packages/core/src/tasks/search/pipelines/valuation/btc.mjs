function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildBtcAssetValuationInput(asset = {}) {
  const extra = asset?.extra && typeof asset.extra === "object" ? asset.extra : {};
  const isNative = String(extra?.assetType ?? "").trim().toLowerCase() === "native";

  if (isNative) {
    return {
      quantity: parseNumber(extra?.confirmed ?? 0),
      priceQuery: "BTC",
      priceNetwork: "btc",
      allowPricing: true,
    };
  }

  return {
    quantity: parseNumber(extra?.balance ?? 0),
    priceQuery: String(extra?.ticker ?? asset?.symbol ?? "").trim() || "BTC",
    priceNetwork: "btc",
    // BTC 非原生资产默认不估值，避免 symbol 误匹配放大组合价值。
    allowPricing: false,
  };
}

export default {
  buildBtcAssetValuationInput,
};
