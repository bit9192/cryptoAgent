import { getBtcTokenBook } from "../../../../apps/btc/config/tokens.js";

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTicker(value) {
  return String(value ?? "").trim().toUpperCase();
}

function buildBtcNonNativePriceWhitelist(network) {
  try {
    const { tokens } = getBtcTokenBook({ network });
    return new Set(
      Object.values(tokens ?? {})
        .map((token) => normalizeTicker(token?.symbol))
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export function buildBtcAssetValuationInput(asset = {}, network = "btc") {
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

  const whitelist = buildBtcNonNativePriceWhitelist(network);
  return {
    quantity: parseNumber(extra?.balance ?? 0),
    priceQuery: String(extra?.ticker ?? asset?.symbol ?? "").trim() || "BTC",
    priceNetwork: "btc",
    // BTC 非原生资产仅对白名单 ticker 放开估值；白名单来源于 BTC token 配置。
    allowPricing: whitelist.has(
      normalizeTicker(extra?.ticker ?? asset?.symbol),
    ),
  };
}

export default {
  buildBtcAssetValuationInput,
};
