import { toTrxBase58Address } from "../address-codec.mjs";
import { createNativeBalanceResolver } from "./protocols/native-balance-resolver.mjs";
import { createTrc20BalanceResolver } from "./protocols/trc20-balance-resolver.mjs";

function normalizeNetwork(value) {
  return String(value ?? "mainnet").trim().toLowerCase() || "mainnet";
}

function normalizeAddress(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new TypeError("address 不能为空");
  }
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw)) {
    throw new TypeError("address 格式不合法");
  }
  try {
    return toTrxBase58Address(raw);
  } catch {
    throw new TypeError("address 格式不合法");
  }
}

async function safeResolve(resolver, input) {
  if (!resolver || typeof resolver.resolve !== "function") {
    return [];
  }
  try {
    const rows = await resolver.resolve(input);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function createAddressResolver(options = {}) {
  const nativeResolver = options.nativeResolver ?? createNativeBalanceResolver(options);
  const trc20Resolver = options.trc20Resolver ?? createTrc20BalanceResolver(options);

  async function resolve(input = {}) {
    const address = normalizeAddress(input?.address);
    const network = normalizeNetwork(input?.network);

    const [nativeItems, trc20Items] = await Promise.all([
      safeResolve(nativeResolver, { address, network }),
      safeResolve(trc20Resolver, { address, network }),
    ]);

    return [...nativeItems, ...trc20Items];
  }

  return {
    resolve,
  };
}

export default {
  createAddressResolver,
};
