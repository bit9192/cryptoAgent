import { parseTokenSearchInput } from "./token-query-parser.mjs";
import { resolveEvmTokenCandidates } from "./token-resolver.mjs";
import { normalizeEvmTokenSearchItems } from "./token-normalizer.mjs";
import { tokenRiskCheck } from "./token-risk-check.mjs";
import { evmNetworks } from "../configs/networks.js";

function resolveEvmSearchNetworks() {
  const all = Object.entries(evmNetworks)
    .filter(([, cfg]) => cfg && cfg.isMainnet === true)
    .map(([name]) => String(name).trim())
    .filter(Boolean);

  if (all.length > 0) {
    return all;
  }

  return ["eth", "bsc"];
}

export function createEvmTokenSearchProvider(options = {}) {
  const parseInput = options.parseInput ?? parseTokenSearchInput;
  const resolveCandidates = options.resolveCandidates ?? resolveEvmTokenCandidates;
  const normalizeItems = options.normalizeItems ?? normalizeEvmTokenSearchItems;

  return {
    id: "evm-token-config",
    chain: "evm",
    networks: resolveEvmSearchNetworks(),
    capabilities: ["token"],
    async searchToken(input = {}) {
      try {
        const parsed = parseInput(input);
        const tokens = resolveCandidates(parsed);
        return normalizeItems(tokens, parsed);
      } catch {
        return [];
      }
    },
  };
}

export async function searchToken(input = {}, options = {}) {
  const provider = createEvmTokenSearchProvider(options);
  return await provider.searchToken(input);
}

export { tokenRiskCheck };

export default {
  createEvmTokenSearchProvider,
  searchToken,
  tokenRiskCheck,
};