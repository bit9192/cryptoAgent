import { parseTokenSearchInput } from "./token-query-parser.mjs";
import { resolveEvmTokenCandidates } from "./token-resolver.mjs";
import { normalizeEvmTokenSearchItems } from "./token-normalizer.mjs";
import { tokenRiskCheck } from "./token-risk-check.mjs";
import { queryEvmTokenMetadata } from "../assets/token-metadata.mjs";
import { queryEvmTokenMetadataBatch } from "../assets/token-metadata.mjs";
import { enrichTokenSearchBatchWithOnchainMetadata } from "./token-batch-enricher.mjs";
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
  const metadataSingleReader = options.metadataSingleReader ?? queryEvmTokenMetadata;
  const metadataBatchReader = options.metadataBatchReader ?? queryEvmTokenMetadataBatch;

  async function hydrateSingleAddressItem(item, parsed) {
    try {
      const meta = await metadataSingleReader({
        tokenAddress: item.tokenAddress,
        network: parsed.network,
        networkName: parsed.network,
        multicall: options.multicall,
        chainId: options.chainId,
        contractOverrides: options.contractOverrides,
      });

      return {
        ...item,
        name: meta?.name ?? item.name,
        symbol: meta?.symbol ?? item.symbol,
        decimals: meta?.decimals ?? item.decimals,
        extra: {
          ...(item.extra && typeof item.extra === "object" ? item.extra : {}),
          metadataSource: "single-reader",
        },
      };
    } catch {
      return item;
    }
  }

  async function runSingle(input = {}) {
    const parsed = parseInput(input);
    let tokens = resolveCandidates(parsed);
    if (tokens.length === 0 && parsed.queryKind === "address") {
      // Address search should at least return a placeholder candidate, even if config misses.
      tokens = [{
        key: null,
        symbol: null,
        name: null,
        decimals: null,
        address: parsed.query,
      }];
    }

    let items = normalizeItems(tokens, parsed);
    if (items.length > 0 && parsed.queryKind === "address") {
      items = await Promise.all(items.map(async (item) => await hydrateSingleAddressItem(item, parsed)));
    }

    return {
      ok: true,
      query: parsed.query,
      network: parsed.network,
      queryKind: parsed.queryKind,
      items,
      sourceStats: {
        total: 1,
        success: 1,
        failed: 0,
        hit: items.length > 0 ? 1 : 0,
        empty: items.length > 0 ? 0 : 1,
        timeout: 0,
      },
    };
  }

  return {
    id: "evm-token-config",
    chain: "evm",
    networks: resolveEvmSearchNetworks(),
    capabilities: ["token"],
    async searchToken(input = {}) {
      try {
        const row = await runSingle(input);
        return row.items;
      } catch {
        return [];
      }
    },
    async searchTokenBatch(input = []) {
      if (!Array.isArray(input)) {
        throw new TypeError("searchTokenBatch 输入必须是数组");
      }

      const baseRows = await Promise.all(input.map(async (entry) => {
        try {
          return await runSingle(entry);
        } catch {
          return {
            ok: true,
            query: String(entry?.query ?? "").trim(),
            network: String(entry?.network ?? "eth").trim() || "eth",
            queryKind: "auto",
            items: [],
            sourceStats: {
              total: 1,
              success: 0,
              failed: 1,
              hit: 0,
              empty: 1,
              timeout: 0,
            },
          };
        }
      }));

      return await enrichTokenSearchBatchWithOnchainMetadata(baseRows, {
        metadataBatchReader,
        multicall: options.multicall,
        chainId: options.chainId,
        contractOverrides: options.contractOverrides,
      });
    },
  };
}

export async function searchToken(input = {}, options = {}) {
  const provider = createEvmTokenSearchProvider(options);
  return await provider.searchToken(input);
}

export async function searchTokenBatch(input = [], options = {}) {
  const provider = createEvmTokenSearchProvider(options);
  return await provider.searchTokenBatch(input);
}

export { tokenRiskCheck };

export default {
  createEvmTokenSearchProvider,
  searchToken,
  searchTokenBatch,
  tokenRiskCheck,
};