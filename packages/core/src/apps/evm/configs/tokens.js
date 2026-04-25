import "../../../load-env.mjs";

import { getEvmNetworkConfig } from "./networks.js";

const EVM_DEFAULT_TOKENS = Object.freeze({
  1: Object.freeze({
    weth: Object.freeze({
      name: "Wrapped Ether",
      symbol: "WETH",
      decimals: 18,
      address: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
    }),
    usdt: Object.freeze({
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    }),
    usdc: Object.freeze({
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    }),
    uni: Object.freeze({
      name: "Uniswap",
      symbol: "UNI",
      decimals: 18,
      address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    }),
  }),
  56: Object.freeze({
    wbnb: Object.freeze({
      name: "Wrapped BNB",
      symbol: "WBNB",
      decimals: 18,
      address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    }),
    usdt: Object.freeze({
      name: "Tether USD",
      symbol: "USDT",
      decimals: 18,
      address: "0x55d398326f99059fF775485246999027B3197955",
    }),
  }),
  31337: Object.freeze({}),
});

function parseChainId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAddress(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("0x") ? raw.toLowerCase() : `0x${raw}`.toLowerCase();
}

function normalizeTokenEntry(key, token) {
  return Object.freeze({
    key: String(key ?? "").trim().toLowerCase(),
    name: String(token?.name ?? "").trim(),
    symbol: String(token?.symbol ?? "").trim().toUpperCase(),
    decimals: Number(token?.decimals ?? 0),
    address: normalizeAddress(token?.address),
  });
}

export function getEvmTokenBook(input = {}) {
  const config = getEvmNetworkConfig(input.network);
  const chainId = parseChainId(input.chainId)
    ?? config.chainId;
  const sourceChainId = parseChainId(input.forkSourceChainId)
    ?? parseChainId(config.forkSourceChainId);
  const sourceBase = config.network === "fork" && sourceChainId
    ? (EVM_DEFAULT_TOKENS[sourceChainId] || {})
    : {};
  const localBase = EVM_DEFAULT_TOKENS[chainId] || {};
  const overrides = input.overrides && typeof input.overrides === "object"
    ? input.overrides
    : {};

  const tokens = {};
  for (const [key, value] of Object.entries({ ...sourceBase, ...localBase, ...overrides })) {
    tokens[String(key).trim().toLowerCase()] = normalizeTokenEntry(key, value);
  }

  return {
    chainId,
    sourceChainId,
    tokens,
  };
}

export function resolveEvmToken(input = {}) {
  const key = String(input.key ?? input.symbol ?? input.address ?? "").trim();
  if (!key) {
    throw new Error("key 不能为空");
  }

  const envKey = String(input.envKey ?? "").trim();
  if (envKey && process.env[envKey]) {
    return normalizeTokenEntry(input.key ?? input.symbol ?? "token", {
      ...input.fallback,
      symbol: input.symbol ?? input.key ?? "TOKEN",
      address: process.env[envKey],
      decimals: input.decimals ?? input.fallback?.decimals ?? 18,
      name: input.name ?? input.fallback?.name ?? String(input.symbol ?? input.key ?? "TOKEN"),
    });
  }

  const { tokens } = getEvmTokenBook(input);
  const normalizedKey = key.toLowerCase();
  const normalizedAddress = normalizeAddress(key);

  for (const token of Object.values(tokens)) {
    if (token.key === normalizedKey) return token;
    if (token.symbol.toLowerCase() === normalizedKey) return token;
    if (token.address && token.address === normalizedAddress) return token;
  }

  throw new Error(`未找到 EVM token 配置: ${key}`);
}

export { EVM_DEFAULT_TOKENS };