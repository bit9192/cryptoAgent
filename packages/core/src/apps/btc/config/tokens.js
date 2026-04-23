import { getBtcNetworkConfig } from "./networks.js";

const BTC_DEFAULT_TOKENS = Object.freeze({
  mainnet: Object.freeze({
    ordi: Object.freeze({
      name: "Ordinals",
      symbol: "ORDI",
      decimals: 18,
      address: "ordi",
      protocol: "brc20",
    }),
    sats: Object.freeze({
      name: "SATS",
      symbol: "SATS",
      decimals: 18,
      address: "sats",
      protocol: "brc20",
    }),
    rats: Object.freeze({
      name: "RATS",
      symbol: "RATS",
      decimals: 18,
      address: "rats",
      protocol: "brc20",
    }),
  }),
  testnet: Object.freeze({}),
  signet: Object.freeze({}),
  regtest: Object.freeze({}),
});

function normalizeTokenEntry(key, token) {
  return Object.freeze({
    key: String(key ?? "").trim().toLowerCase(),
    name: String(token?.name ?? "").trim(),
    symbol: String(token?.symbol ?? "").trim().toUpperCase(),
    decimals: Number(token?.decimals ?? 0),
    address: String(token?.address ?? "").trim().toLowerCase(),
    protocol: String(token?.protocol ?? "").trim().toLowerCase() || "brc20",
  });
}

export function getBtcTokenBook(input = {}) {
  const networkName = getBtcNetworkConfig(input.network ?? input.networkName).networkName;
  const base = BTC_DEFAULT_TOKENS[networkName] || {};
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

export function resolveBtcToken(input = {}) {
  const key = String(input.key ?? input.symbol ?? input.address ?? "").trim();
  if (!key) {
    throw new Error("key 不能为空");
  }

  const { tokens } = getBtcTokenBook(input);
  const normalizedKey = key.toLowerCase();

  for (const token of Object.values(tokens)) {
    if (token.key === normalizedKey) return token;
    if (token.symbol.toLowerCase() === normalizedKey) return token;
    if (token.address === normalizedKey) return token;
  }

  throw new Error(`未找到 BTC token 配置: ${key}`);
}

export { BTC_DEFAULT_TOKENS };