import { getTrxTokenBook } from "../config/tokens.js";
import { createTrxDexScreenerTokenSource } from "./sources/dexscreener-token-source.mjs";
import { createTronscanTokenSearchSource } from "./sources/tronscan-token-search-source.mjs";

function normalizeInput(value) {
  return String(value ?? "").trim();
}

function includesIgnoreCase(text, query) {
  return String(text ?? "").toLowerCase().includes(String(query ?? "").toLowerCase());
}

export function createTrxTokenResolver(options = {}) {
  const tokenBookReader = options.tokenBookReader ?? getTrxTokenBook;
  const remoteSource = options.remoteSource ?? createTrxDexScreenerTokenSource(options.remoteOptions ?? {});
  const fallbackSource = options.fallbackSource ?? createTronscanTokenSearchSource(options.fallbackOptions ?? {});

  async function resolveLocal(query, network) {
    const { tokens } = tokenBookReader({ network });
    const list = Object.values(tokens ?? {});
    if (!query || list.length === 0) {
      return [];
    }

    const lower = query.toLowerCase();
    const upper = query.toUpperCase();

    return list.filter((token) => {
      const symbol = normalizeInput(token?.symbol).toUpperCase();
      const name = normalizeInput(token?.name);
      const address = normalizeInput(token?.address);

      // 地址命中优先：大小写不敏感精确匹配
      if (address.toLowerCase() === lower) {
        return true;
      }

      return symbol === upper || includesIgnoreCase(name, query);
    });
  }

  async function resolveRemote(query, network, limit = 20, matchMode = "fuzzy") {
    if (options.disableRemote === true) {
      return [];
    }
    if (network !== "mainnet") {
      return [];
    }

    if (remoteSource && typeof remoteSource.search === "function") {
      try {
        const result = await remoteSource.search({ query, network, limit, matchMode });
        if (Array.isArray(result) && result.length > 0) {
          return result;
        }
      } catch {
        // fall through to fallback
      }
    }

    if (fallbackSource && typeof fallbackSource.search === "function") {
      try {
        return await fallbackSource.search({ query, network, limit, matchMode });
      } catch {
        return [];
      }
    }

    return [];
  }

  async function resolve(input = {}) {
    const query = normalizeInput(input?.query);
    const network = normalizeInput(input?.network).toLowerCase() || "mainnet";
    const matchMode = normalizeInput(input?.matchMode).toLowerCase() === "exact"
      ? "exact"
      : "fuzzy";

    if (!query) {
      return [];
    }

    const local = await resolveLocal(query, network);
    if (local.length > 0) {
      return local;
    }

    return await resolveRemote(query, network, input?.limit ?? 20, matchMode);
  }

  return {
    resolve,
  };
}

export default {
  createTrxTokenResolver,
};
