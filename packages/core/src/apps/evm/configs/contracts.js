import "../../../load-env.mjs";

import { getEvmNetworkConfig } from "./networks.js";

const EVM_DEFAULT_CONTRACT_BOOK = Object.freeze({
  1: Object.freeze({
    multicall3: "0xca11bde05977b3631167028862be2a173976ca11",
  }),
  56: Object.freeze({
    multicall3: "0xca11bde05977b3631167028862be2a173976ca11",
  }),
  31337: Object.freeze({}),
});

function normalizeAddress(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

function parseChainId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getEvmContractBook(input = {}) {
  const config = getEvmNetworkConfig(input.network);
  const chainId = parseChainId(input.chainId) ?? config.chainId;
  const sourceChainId = parseChainId(input.forkSourceChainId)
    ?? parseChainId(config.forkSourceChainId);
  const sourceBase = config.network === "fork" && sourceChainId
    ? (EVM_DEFAULT_CONTRACT_BOOK[sourceChainId] || {})
    : {};
  const localBase = EVM_DEFAULT_CONTRACT_BOOK[chainId] || {};
  const overrides = input.overrides && typeof input.overrides === "object"
    ? input.overrides
    : {};

  return {
    chainId,
    sourceChainId,
    contracts: {
      ...sourceBase,
      ...localBase,
      ...overrides,
    },
  };
}

export function resolveEvmContract(input = {}) {
  const key = String(input.key ?? "").trim().toLowerCase();
  if (!key) {
    throw new Error("key 不能为空");
  }

  const envKey = String(input.envKey ?? "").trim();
  if (envKey && process.env[envKey]) {
    const fromEnv = normalizeAddress(process.env[envKey]);
    if (fromEnv) return fromEnv;
  }

  const { contracts } = getEvmContractBook(input);
  const value = normalizeAddress(contracts[key]);
  if (!value) {
    throw new Error(`未找到合约地址配置: ${key}`);
  }
  return value;
}

export { EVM_DEFAULT_CONTRACT_BOOK };
