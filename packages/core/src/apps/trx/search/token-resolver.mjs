import { getTrxTokenBook } from "../config/tokens.js";

function normalizeInput(value) {
  return String(value ?? "").trim();
}

function includesIgnoreCase(text, query) {
  return String(text ?? "").toLowerCase().includes(String(query ?? "").toLowerCase());
}

export function createTrxTokenResolver(options = {}) {
  const tokenBookReader = options.tokenBookReader ?? getTrxTokenBook;

  async function resolve(input = {}) {
    const query = normalizeInput(input?.query);
    const network = normalizeInput(input?.network).toLowerCase() || "mainnet";

    const { tokens } = tokenBookReader({ network });
    const list = Object.values(tokens ?? {});
    if (!query || list.length === 0) {
      return [];
    }

    const lower = query.toLowerCase();
    const upper = query.toUpperCase();

    const results = list.filter((token) => {
      const symbol = normalizeInput(token?.symbol).toUpperCase();
      const name = normalizeInput(token?.name);
      const address = normalizeInput(token?.address);

      // 地址命中优先：大小写不敏感精确匹配
      if (address.toLowerCase() === lower) {
        return true;
      }

      return symbol === upper || includesIgnoreCase(name, query);
    });

    return results;
  }

  return {
    resolve,
  };
}

export default {
  createTrxTokenResolver,
};
