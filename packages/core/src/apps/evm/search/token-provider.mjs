import { parseTokenSearchInput } from "./token-query-parser.mjs";
import { resolveEvmTokenCandidates } from "./token-resolver.mjs";
import { normalizeEvmTokenSearchItems } from "./token-normalizer.mjs";
import { tokenRiskCheck as tokenRiskCheckCore } from "./token-risk-check.mjs";
import { getTokenTradeSummary } from "./trade-provider.mjs";
import { queryEvmTokenMetadata } from "../assets/token-metadata.mjs";
import { queryEvmTokenMetadataBatch } from "../assets/token-metadata.mjs";
import { enrichTokenSearchBatchWithOnchainMetadata } from "./token-batch-enricher.mjs";
import { evmNetworks } from "../configs/networks.js";
import { CoinGeckoSource } from "../../offchain/sources/coingecko/index.mjs";
import { DexScreenerSource } from "../../offchain/sources/dexscreener/index.mjs";
import { resolveEvmTokenProfile } from "../configs/token-profiles.js";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hasExplicitNetwork(input = {}) {
  return Object.prototype.hasOwnProperty.call(input, "network")
    && String(input?.network ?? "").trim().length > 0;
}

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

function isNameVerifiedByOnchain(query, item = {}) {
  const queryLower = normalizeLower(query);
  const onchainName = normalizeLower(item?.name);
  if (!queryLower || !onchainName) return false;
  return queryLower === onchainName;
}

function isSymbolVerifiedByOnchain(query, item = {}) {
  const queryLower = normalizeLower(query);
  const onchainSymbol = normalizeLower(item?.symbol);
  if (!queryLower || !onchainSymbol) return false;
  return queryLower === onchainSymbol;
}

function isMulticallVerifiedItem(item = {}) {
  return normalizeLower(item?.extra?.metadataSource) === "multicall";
}

function applyNameVerification(queryKind, query, items = []) {
  if (queryKind !== "name") return items;
  return items.filter((item) => isNameVerifiedByOnchain(query, item));
}

function applyNameVerificationOnBatchRows(rows = []) {
  return rows.map((row) => {
    if (String(row?.queryKind ?? "").trim() !== "name") {
      return row;
    }

    const filtered = applyNameVerification("name", row?.query, Array.isArray(row?.items) ? row.items : []);
    const hit = filtered.length > 0 ? 1 : 0;
    const empty = filtered.length > 0 ? 0 : 1;

    return {
      ...row,
      items: filtered,
      sourceStats: {
        ...(row?.sourceStats && typeof row.sourceStats === "object" ? row.sourceStats : {}),
        hit,
        empty,
      },
    };
  });
}

function applyCrossNetworkOnchainVerification(queryKind, query, items = []) {
  if (queryKind !== "name" && queryKind !== "symbol") {
    return items;
  }

  const result = [];

  for (const item of items) {
    if (isMulticallVerifiedItem(item)) {
      // Standard path: multicall returned data, verify against query.
      const passes = queryKind === "name"
        ? isNameVerifiedByOnchain(query, item)
        : isSymbolVerifiedByOnchain(query, item);
      if (passes) {
        result.push(item);
      }
    } else if (queryKind === "symbol" && isSymbolVerifiedByOnchain(query, item)) {
      // Relaxed path (ETS-10): batch reader had no entry for this token (e.g. non-standard
      // ERC20 on bsc), but the remote candidate symbol precisely matches the query.
      // Retain the item but mark it as unverified so callers can distinguish.
      result.push({
        ...item,
        extra: {
          ...(item.extra && typeof item.extra === "object" ? item.extra : {}),
          metadataSource: "network-resolver",
          unverified: true,
        },
      });
    }
    // queryKind=name && !multicall → not retained (name relaxation not applied).
  }

  return result;
}

function buildCrossNetworkRows(items = [], parsed) {
  const rowsByNetwork = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const network = String(item?.network ?? "eth").trim() || "eth";
    const row = rowsByNetwork.get(network) ?? {
      ok: true,
      query: parsed.query,
      network,
      queryKind: parsed.queryKind,
      items: [],
      sourceStats: {
        total: 1,
        success: 1,
        failed: 0,
        hit: 1,
        empty: 0,
        timeout: 0,
      },
    };

    row.items.push(item);
    rowsByNetwork.set(network, row);
  }

  return [...rowsByNetwork.values()];
}

function flattenRows(rows = [], limit = 20) {
  const max = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 20;
  const flat = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const item of Array.isArray(row?.items) ? row.items : []) {
      flat.push(item);
      if (flat.length >= max) {
        return flat;
      }
    }
  }
  return flat;
}

function mapNetworkEntriesToSearchItems(entries = [], query, limit = 20) {
  const max = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 20;
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.chain && entry?.network && entry?.tokenAddress)
    .map((entry) => {
      const chain = String(entry.chain).trim();
      const network = String(entry.network).trim();
      const tokenAddress = String(entry.tokenAddress).trim();
      const symbol = String(entry.symbol ?? "").trim() || null;
      const name = String(entry.name ?? "").trim() || null;
      return {
        domain: "token",
        chain,
        network,
        id: `token:${normalizeLower(chain)}:${normalizeLower(network)}:${normalizeLower(tokenAddress)}`,
        title: symbol || name || tokenAddress,
        address: tokenAddress,
        tokenAddress,
        symbol,
        name,
        decimals: null,
        source: "remote",
        confidence: 0.82,
        extra: {
          key: null,
          project: resolveEvmTokenProfile({
            network,
            symbol,
            address: tokenAddress,
            tokenAddress,
          }),
          metadataSource: "network-resolver",
          query: String(query ?? "").trim() || null,
        },
      };
    })
    .slice(0, max);
}

async function resolveNameListItems(input = {}, networkResolver) {
  if (typeof networkResolver !== "function") return [];
  const query = String(input?.query ?? "").trim();
  if (!query) return [];

  try {
    const entries = await networkResolver(query);
    if (!Array.isArray(entries) || entries.length === 0) return [];

    const explicitNetwork = hasExplicitNetwork(input)
      ? normalizeLower(input.network)
      : "";

    const filtered = entries.filter((entry) => {
      const chain = normalizeLower(entry?.chain);
      const network = normalizeLower(entry?.network);
      if (chain !== "evm") return false;
      if (explicitNetwork && network !== explicitNetwork) return false;
      return true;
    });

    return mapNetworkEntriesToSearchItems(filtered, query, input?.limit);
  } catch {
    return [];
  }
}

function createDexScreenerRemoteSymbolFallback() {
  const source = new DexScreenerSource();
  let initPromise = null;

  return async function remoteSymbolFallback(query, options = {}) {
    if (!initPromise) {
      initPromise = source.init();
    }
    await initPromise;
    // getTokenCandidates resolves both base/quote sides and maps chain/network.
    const candidates = await source.getTokenCandidates(query, { network: options.network, limit: 10 });
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const requestedNetwork = String(options.network ?? "").trim().toLowerCase();

    const evmCandidates = candidates.filter(
      (c) => c.chain === "evm" && isEvmAddress(c.tokenAddress)
    );
    const match = requestedNetwork
      ? (evmCandidates.find((c) => String(c.network ?? "").toLowerCase() === requestedNetwork) ?? null)
      : (evmCandidates[0] ?? null);

    if (!match) return null;
    return {
      address: String(match.tokenAddress).trim(),
      symbol: String(match.symbol ?? "").trim() || null,
      name: String(match.name ?? "").trim() || null,
    };
  };
}

function createCoinGeckoRemoteSymbolFallback() {
  const source = new CoinGeckoSource();
  let initPromise = null;

  return async function remoteSymbolFallback(query, options = {}) {
    if (!initPromise) {
      initPromise = source.init();
    }
    await initPromise;
    const requestedNetwork = String(options.network ?? "").trim().toLowerCase();
    const info = await source.getTokenInfo(query, { network: options.network });
    if (!info?.tokenAddress || !isEvmAddress(info.tokenAddress)) return null;
    if (requestedNetwork && normalizeLower(info?.network) !== requestedNetwork) {
      return null;
    }
    return {
      address: String(info.tokenAddress).trim(),
      symbol: String(info.symbol ?? "").trim() || null,
      name: String(info.name ?? "").trim() || null,
    };
  };
}

function createCompositeRemoteSymbolFallback() {
  const coingecko = createCoinGeckoRemoteSymbolFallback();
  const dexscreener = createDexScreenerRemoteSymbolFallback();

  return async function remoteSymbolFallback(query, options = {}) {
    const hasNetwork = String(options?.network ?? "").trim().length > 0;
    // With explicit network, prefer DexScreener first (more chain-specific symbol routing).
    if (hasNetwork) {
      try {
        const dex = await dexscreener(query, options);
        if (dex) return dex;
      } catch {
        // ignore and fall through
      }
      try {
        return await coingecko(query, options);
      } catch {
        return null;
      }
    }

    // Without explicit network, keep CoinGecko first for broad canonical discovery.
    try {
      const cg = await coingecko(query, options);
      if (cg) return cg;
    } catch {
      // ignore and fall through
    }
    try {
      return await dexscreener(query, options);
    } catch {
      return null;
    }
  };
}

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

function createCoinGeckoNetworkResolver() {
  const coingecko = new CoinGeckoSource();
  const dexscreener = new DexScreenerSource();
  let coinInitPromise = null;
  let dexInitPromise = null;

  function normalizeEntries(list = [], sourceName = "coingecko") {
    return (Array.isArray(list) ? list : [])
      .filter((c) => c.chain && c.network && c.tokenAddress)
      .map((c) => ({
        chain: c.chain,
        network: c.network,
        tokenAddress: c.tokenAddress,
        symbol: c.symbol ?? null,
        name: c.name ?? null,
        source: c.source ?? sourceName,
      }));
  }

  function dedupeEntries(entries = []) {
    const seen = new Set();
    const deduped = [];
    for (const entry of entries) {
      const key = `${normalizeLower(entry?.chain)}:${normalizeLower(entry?.network)}:${normalizeLower(entry?.tokenAddress)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
    }
    return deduped;
  }

  return async function networkResolver(query) {
    if (!coinInitPromise) {
      coinInitPromise = coingecko.init();
    }
    if (!dexInitPromise) {
      dexInitPromise = dexscreener.init();
    }

    let cgEntries = [];
    try {
      await coinInitPromise;
      const candidates = await coingecko.getTokenCandidates(query, { limit: 20 });
      cgEntries = normalizeEntries(candidates, "coingecko");
    } catch {
      cgEntries = [];
    }

    if (cgEntries.length > 0) {
      return dedupeEntries(cgEntries);
    }

    try {
      await dexInitPromise;
      const dexCandidates = await dexscreener.getTokenCandidates(query, { limit: 20 });
      const dexEntries = normalizeEntries(dexCandidates, "dexscreener");
      return dedupeEntries(dexEntries);
    } catch {
      return [];
    }
  };
}

export function createEvmTokenSearchProvider(options = {}) {
  const parseInput = options.parseInput ?? parseTokenSearchInput;
  const resolveCandidates = options.resolveCandidates ?? resolveEvmTokenCandidates;
  const normalizeItems = options.normalizeItems ?? normalizeEvmTokenSearchItems;
  const metadataSingleReader = options.metadataSingleReader ?? queryEvmTokenMetadata;
  const metadataBatchReader = options.metadataBatchReader ?? queryEvmTokenMetadataBatch;
  const remoteSymbolFallback = options.remoteSymbolFallback ?? createCompositeRemoteSymbolFallback();
  const networkResolver = options.networkResolver ?? createCoinGeckoNetworkResolver();

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

  async function runSingle(input = {}, runOptions = {}) {
    const forBatch = runOptions?.forBatch === true;
    const parsed = parseInput(input);

    let effectiveQueryKind = parsed.queryKind;
    let tokens = resolveCandidates(parsed);
    let needsMetadataHydration = parsed.queryKind === "name";

    // Keep caller API simple: symbol-like query first tries symbol, then name fallback.
    if (
      tokens.length === 0
      && parsed.queryKind === "symbol"
    ) {
      const parsedAsName = {
        ...parsed,
        queryKind: "name",
      };
      const nameTokens = resolveCandidates(parsedAsName);
      if (nameTokens.length > 0) {
        tokens = nameTokens;
        effectiveQueryKind = "name";
        needsMetadataHydration = true;
      }
    }

    if (tokens.length === 0 && effectiveQueryKind === "address") {
      // Address search should at least return a placeholder candidate, even if config misses.
      tokens = [{
        key: null,
        symbol: null,
        name: null,
        decimals: null,
        address: parsed.query,
      }];
      needsMetadataHydration = true;
    }

    if (tokens.length === 0 && (effectiveQueryKind === "symbol" || effectiveQueryKind === "name")) {
      try {
        const remote = await remoteSymbolFallback(parsed.query, { network: parsed.network });
        if (remote?.address) {
          tokens = [{
            key: null,
            symbol: remote.symbol,
            name: remote.name,
            decimals: null,
            address: remote.address,
          }];
          needsMetadataHydration = true;
        }
      } catch {
        // fallback failure is silent — return empty
      }
    }

    let items = normalizeItems(tokens, parsed);
    const shouldHydrateNow = items.length > 0
      && needsMetadataHydration
      && !(forBatch && effectiveQueryKind === "name");
    if (shouldHydrateNow) {
      items = await Promise.all(items.map(async (item) => await hydrateSingleAddressItem(item, parsed)));
    }
    items = applyNameVerification(effectiveQueryKind, parsed.query, items);

    return {
      ok: true,
      query: parsed.query,
      network: parsed.network,
      queryKind: effectiveQueryKind,
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

  async function runCrossNetworkVerified(input = {}, parsed) {
    try {
      const entries = await networkResolver(parsed.query);
      if (!Array.isArray(entries) || entries.length === 0) {
        return [];
      }

      const filtered = entries.filter((entry) => normalizeLower(entry?.chain) === "evm");
      const items = mapNetworkEntriesToSearchItems(filtered, parsed.query, parsed.limit);
      if (items.length === 0) {
        return [];
      }

      const rows = buildCrossNetworkRows(items, parsed);
      const enrichedRows = await enrichTokenSearchBatchWithOnchainMetadata(rows, {
        metadataBatchReader,
        multicall: options.multicall,
        chainId: options.chainId,
        contractOverrides: options.contractOverrides,
      });

      const verifiedRows = enrichedRows.map((row) => {
        const verifiedItems = applyCrossNetworkOnchainVerification(
          parsed.queryKind,
          parsed.query,
          Array.isArray(row?.items) ? row.items : [],
        );
        return {
          ...row,
          items: verifiedItems,
          sourceStats: {
            ...(row?.sourceStats && typeof row.sourceStats === "object" ? row.sourceStats : {}),
            hit: verifiedItems.length > 0 ? 1 : 0,
            empty: verifiedItems.length > 0 ? 0 : 1,
          },
        };
      });

      return flattenRows(verifiedRows, parsed.limit);
    } catch {
      return [];
    }
  }

  return {
    id: "evm-token-config",
    chain: "evm",
    networks: resolveEvmSearchNetworks(),
    capabilities: ["token"],
    async searchToken(input = {}) {
      try {
        const parsed = parseInput(input);

        // Name-shaped query with explicit network keeps onchain verification.
        if (parsed.queryKind === "name" && hasExplicitNetwork(input)) {
          const listItems = await resolveNameListItems(input, networkResolver);
          if (listItems.length > 0) {
            const hydratedItems = await Promise.all(listItems.map(async (item) => {
              const parsedForItem = {
                ...parsed,
                network: String(item?.network ?? parsed.network).trim() || parsed.network,
              };
              return await hydrateSingleAddressItem(item, parsedForItem);
            }));
            const verifiedItems = applyNameVerification("name", parsed.query, hydratedItems);
            if (verifiedItems.length > 0) {
              return verifiedItems;
            }
          }
        }

        // No network restriction: group candidates by network and verify onchain via multicall.
        if (!hasExplicitNetwork(input) && (parsed.queryKind === "symbol" || parsed.queryKind === "name")) {
          const verifiedItems = await runCrossNetworkVerified(input, parsed);
          if (verifiedItems.length > 0) {
            return verifiedItems;
          }
        }

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
          const parsed = parseInput(entry);
          if (parsed.queryKind === "name") {
            const listItems = await resolveNameListItems(entry, networkResolver);
            if (listItems.length > 0) {
              return {
                ok: true,
                query: parsed.query,
                network: parsed.network,
                queryKind: "name",
                items: listItems,
                sourceStats: {
                  total: 1,
                  success: 1,
                  failed: 0,
                  hit: 1,
                  empty: 0,
                  timeout: 0,
                },
              };
            }
          }

          return await runSingle(entry, { forBatch: true });
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

      const enrichedRows = await enrichTokenSearchBatchWithOnchainMetadata(baseRows, {
        metadataBatchReader,
        multicall: options.multicall,
        chainId: options.chainId,
        contractOverrides: options.contractOverrides,
      });

      return applyNameVerificationOnBatchRows(enrichedRows);
    },
    async resolveTokenNetworks(input = {}) {
      const query = String(input?.query ?? "").trim();
      if (!query) return [];
      try {
        const entries = await networkResolver(query);
        if (!Array.isArray(entries) || entries.length === 0) return [];
        // Deduplicate by chain:network:tokenAddress.
        const seen = new Set();
        const deduped = [];
        for (const entry of entries) {
          const key = `${entry.chain}:${entry.network}:${String(entry.tokenAddress).toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(entry);
        }
        // Sort: evm/eth first, then evm others, then rest.
        deduped.sort((a, b) => {
          const rank = (e) => {
            if (e.chain === "evm" && e.network === "eth") return 0;
            if (e.chain === "evm") return 1;
            return 2;
          };
          return rank(a) - rank(b);
        });
        return deduped;
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

export async function searchTokenBatch(input = [], options = {}) {
  const provider = createEvmTokenSearchProvider(options);
  return await provider.searchTokenBatch(input);
}

export async function resolveTokenNetworks(input = {}, options = {}) {
  const provider = createEvmTokenSearchProvider(options);
  return await provider.resolveTokenNetworks(input);
}

export async function tokenRiskCheck(input = {}, options = {}) {
  const hasCustomTradeChecker = typeof options?.tradeSummaryChecker === "function";
  const autoTradeSummary = options?.autoTradeSummary === true;

  if (!autoTradeSummary || hasCustomTradeChecker) {
    return await tokenRiskCheckCore(input, options);
  }

  const tradeSummaryResolver = typeof options?.tradeSummaryResolver === "function"
    ? options.tradeSummaryResolver
    : getTokenTradeSummary;

  const mergedOptions = {
    ...options,
    tradeSummaryChecker: async (riskInput, tradeOptions = {}) => {
      return await tradeSummaryResolver({
        tokenAddress: riskInput?.tokenAddress,
        network: riskInput?.network,
        limit: tradeOptions?.limit ?? options?.tradePairLimit,
      }, tradeOptions);
    },
  };

  return await tokenRiskCheckCore(input, mergedOptions);
}

export default {
  createEvmTokenSearchProvider,
  searchToken,
  searchTokenBatch,
  resolveTokenNetworks,
  tokenRiskCheck,
};