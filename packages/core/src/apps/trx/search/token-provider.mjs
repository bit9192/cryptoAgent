import { createTrxTokenResolver } from "./token-resolver.mjs";
import { toTokenSearchItem } from "./token-normalizer.mjs";

function normalizeQuery(value) {
  return String(value ?? "").trim();
}

function normalizeNetwork(value) {
  return String(value ?? "mainnet").trim().toLowerCase() || "mainnet";
}

function normalizeLimit(value) {
  const n = Number(value ?? 20);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(Math.floor(n), 100);
}

export function createTrxTokenSearchProvider(options = {}) {
  const resolver = options.resolver ?? createTrxTokenResolver(options);

  async function searchToken(input = {}) {
    const query = normalizeQuery(input?.query);
    if (!query) {
      throw new TypeError("query 不能为空");
    }

    const network = normalizeNetwork(input?.network);
    const limit = normalizeLimit(input?.limit);
    const matchMode = String(input?.matchMode ?? "").trim().toLowerCase() || "fuzzy";

    try {
      const tokens = await resolver.resolve({ query, network, limit, matchMode });
      return tokens
        .slice(0, limit)
        .map((token) => toTokenSearchItem(token, network));
    } catch {
      // 内部错误降级为空结果，避免泄露底层信息
      return [];
    }
  }

  return {
    id: "trx-token",
    chain: "trx",
    networks: ["mainnet", "nile", "shasta", "local"],
    capabilities: ["token"],
    searchToken,
  };
}

export default {
  createTrxTokenSearchProvider,
};
