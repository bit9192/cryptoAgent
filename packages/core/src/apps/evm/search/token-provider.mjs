import { parseTokenSearchInput } from "./token-query-parser.mjs";
import { resolveEvmTokenCandidates } from "./token-resolver.mjs";
import { normalizeEvmTokenSearchItems } from "./token-normalizer.mjs";
import { tokenRiskCheck } from "./token-risk-check.mjs";

export function createEvmTokenSearchProvider(options = {}) {
  const parseInput = options.parseInput ?? parseTokenSearchInput;
  const resolveCandidates = options.resolveCandidates ?? resolveEvmTokenCandidates;
  const normalizeItems = options.normalizeItems ?? normalizeEvmTokenSearchItems;

  return {
    id: "evm-token-config",
    chain: "evm",
    networks: ["eth", "bsc"],
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