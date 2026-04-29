function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildEvmAssetValuationInput(asset = {}, network = "eth") {
  const extra = asset?.extra && typeof asset.extra === "object" ? asset.extra : {};
  const nested = extra?.asset && typeof extra.asset === "object" ? extra.asset : {};
  const net = String(network ?? "eth").trim().toLowerCase() || "eth";

  const isNative = normalizeLower(nested?.assetType ?? extra?.assetType) === "native"
    || normalizeLower(extra?.protocol) === "native"
    || normalizeLower(asset?.tokenAddress) === "native";

  if (isNative) {
    const quantity = parseNumber(nested?.formatted ?? nested?.balance ?? extra?.balance ?? 0);
    return {
      quantity,
      priceQuery: net === "bsc" ? "BNB" : "ETH",
      priceNetwork: net,
    };
  }

  const quantity = parseNumber(nested?.formatted ?? nested?.balance ?? extra?.balance ?? 0);
  const tokenAddress = String(asset?.tokenAddress ?? nested?.address ?? extra?.contractAddress ?? "").trim();
  const symbol = String(asset?.symbol ?? nested?.symbol ?? "").trim();

  return {
    quantity,
    priceQuery: tokenAddress || symbol,
    priceNetwork: net,
  };
}

export default {
  buildEvmAssetValuationInput,
};
