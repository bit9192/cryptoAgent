import { resolveBtcToken, getBtcTokenBook } from "../../config/tokens.js";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function mapTokenToSearchItem(token, network) {
  return {
    domain: "token",
    chain: "btc",
    network,
    id: `token:btc:${normalizeLower(network)}:${normalizeLower(token.address)}`,
    title: `${token.symbol} (BRC20)`,
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    source: "btc-config",
    confidence: 0.95,
    extra: {
      protocol: token.protocol,
      tokenType: "brc20",
    },
  };
}

function filterByKeywordOrSymbol(tokens, query) {
  const target = normalizeLower(query);
  const results = [];

  for (const token of Object.values(tokens)) {
    if (token.key === target) {
      results.push(token);
    } else if (token.symbol.toLowerCase() === target) {
      results.push(token);
    } else if (token.address === target) {
      results.push(token);
    }
  }

  return results;
}

export function createBrc20Searcher() {
  return {
    protocol: "brc20",

    async search(input = {}) {
      const query = String(input?.query ?? "").trim();
      // query 验证由 provider 负责

      const network = String(input?.network ?? "mainnet").trim().toLowerCase() || "mainnet";

      try {
        const { tokens } = getBtcTokenBook({ network });
        const matched = filterByKeywordOrSymbol(tokens, query);

        return matched.map((token) => mapTokenToSearchItem(token, network));
      } catch {
        // 网络或配置错误，返回空数组（优雅降级）
        return [];
      }
    },
  };
}

export default {
  createBrc20Searcher,
};
