import { createBrc20Searcher } from "./protocols/brc20-searcher.mjs";
import { createTokenAggregator } from "./token-aggregator.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function createBtcTokenSearchProvider(options = {}) {
  const customSearchers = Array.isArray(options.searchers) ? options.searchers : [];

  const defaultSearchers = [
    createBrc20Searcher(),
    // Future: createRunesSearcher(),
    // Future: createOtherProtocolSearcher(),
  ];

  const aggregator = createTokenAggregator([...defaultSearchers, ...customSearchers]);

  async function searchToken(input = {}) {
    // 参数验证
    const query = String(input?.query ?? "").trim();
    if (!query) {
      throw new TypeError("query 不能为空");
    }

    const network = String(input?.network ?? "mainnet").trim().toLowerCase() || "mainnet";

    // 调用 aggregator
    return await aggregator.search({
      ...input,
      query,
      network,
    });
  }

  return {
    id: "btc-token",
    chain: "btc",
    networks: ["mainnet", "testnet", "signet", "regtest"],
    capabilities: ["token"],
    searchToken,
  };
}

export default {
  createBtcTokenSearchProvider,
};
