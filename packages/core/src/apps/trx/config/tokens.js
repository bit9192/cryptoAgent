import { getTrxNetworkConfig } from "./networks.js";

const TRX_DEFAULT_TOKENS = Object.freeze({
  mainnet: Object.freeze({
    usdt: Object.freeze({
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    }),
  }),
  nile: Object.freeze({
    usdt: Object.freeze({
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    }),
  }),
  shasta: Object.freeze({}),
  local: Object.freeze({}),
});

function normalizeTokenEntry(key, token) {
  return Object.freeze({
    key: String(key ?? "").trim().toLowerCase(),
    name: String(token?.name ?? "").trim(),
    symbol: String(token?.symbol ?? "").trim().toUpperCase(),
    decimals: Number(token?.decimals ?? 0),
    address: String(token?.address ?? "").trim(),
  });
}

export function getTrxTokenBook(input = {}) {
  const networkName = getTrxNetworkConfig(input.network ?? input.networkName).networkName;
  const base = TRX_DEFAULT_TOKENS[networkName] || {};
  const overrides = input.overrides && typeof input.overrides === "object"
    ? input.overrides
    : {};

  const tokens = {};
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    tokens[String(key).trim().toLowerCase()] = normalizeTokenEntry(key, value);
  }

  return {
    networkName,
    tokens,
  };
}

export function resolveTrxToken(input = {}) {
  const key = String(input.key ?? input.symbol ?? input.address ?? "").trim();
  if (!key) {
    throw new Error("key 不能为空");
  }

  const { tokens } = getTrxTokenBook(input);
  const normalizedKey = key.toLowerCase();

  for (const token of Object.values(tokens)) {
    if (token.key === normalizedKey) return token;
    if (token.symbol.toLowerCase() === normalizedKey) return token;
    if (token.address.toLowerCase() === key.toLowerCase()) return token;
  }

  throw new Error(`未找到 TRX token 配置: ${key}`);
}

export { TRX_DEFAULT_TOKENS };