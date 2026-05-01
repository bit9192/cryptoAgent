import { createRequestEngine } from "../request-engine/index.mjs";

import {
  createDefaultSearchProviders,
  registerSearchProviders,
  ADDRESS_CONTEXT_CHECKERS
} from "./composition-root.mjs";

import {
  assertNonEmptyString,
  buildSearchRequestKey,
  detectQueryKind,
  normalizeDomain,
  normalizeLower,
} from "./utils.mjs";

import {
  normalizeProviderNetworks,
  normalizeProviderCapabilities,
  assertValidProvider,
  normalizeProviderDefinition,
  pickProviderMethod,
  resolveChainHint,
  isProviderMatch,
  toCandidateNetwork,
} from "./provider.mjs";

import {
  normalizeCandidate,
  dedupeAndSortCandidates,
} from "./candidate.mjs";

function detectAddressContextItems(query, providers = [], filter = {}) {
  const items = [];
  const rawQuery = String(query ?? "").trim();
  const requestedChain = resolveChainHint(filter.chain, providers);

  const addressProviders = providers.filter((provider) => provider.capabilities.includes("address"));

  for (const [chain, checker] of Object.entries(ADDRESS_CONTEXT_CHECKERS)) {
    if (requestedChain && requestedChain !== chain) continue;
    try {
      const item = checker(rawQuery, addressProviders, { normalizeLower });
      if (item) {
        items.push(item);
      }
    } catch {
      // ignore
    }
  }

  return items;
}


export function createSearchEngine(options = {}) {
  const providerMap = new Map();
  const rankConfig = {
    chainPriority: options.chainPriority && typeof options.chainPriority === "object"
      ? options.chainPriority
      : {},
    networkPriority: options.networkPriority && typeof options.networkPriority === "object"
      ? options.networkPriority
      : {},
  };
  const cacheNamespace = String(options.cacheNamespace ?? "search-engine").trim() || "search-engine";
  const requestEngine = options.requestEngine ?? createRequestEngine({
    defaultTtlMs: Number.isFinite(Number(options.defaultCacheTtlMs))
      ? Number(options.defaultCacheTtlMs)
      : 30_000,
  });
  const cacheEnabled = options.cacheEnabled !== false;

  function getSearchStats() {
    return typeof requestEngine.getStats === "function"
      ? requestEngine.getStats()
      : null;
  }

  function invalidateSearchCache(input = {}) {
    if (typeof requestEngine.invalidate !== "function") return null;
    return requestEngine.invalidate(input);
  }

  function registerProvider(provider) {
    assertValidProvider(provider, 0);
    const normalized = normalizeProviderDefinition(provider);
    if (providerMap.has(normalized.id)) {
      throw new TypeError(`provider 已存在: ${normalized.id}`);
    }
    providerMap.set(normalized.id, normalized);
    return normalized.id;
  }

  function unregisterProvider(providerId) {
    const id = String(providerId ?? "").trim();
    if (!id) return false;
    return providerMap.delete(id);
  }

  function hasProvider(providerId) {
    const id = String(providerId ?? "").trim();
    if (!id) return false;
    return providerMap.has(id);
  }

  function clearProviders() {
    providerMap.clear();
  }

  function listProviders(filter = {}) {
    const providers = [...providerMap.values()];
    return providers.filter((provider) => isProviderMatch(provider, filter, providers));
  }

  async function resolveAddressContext(input = {}) {
    assertNonEmptyString(String(input.query ?? input.address ?? ""), "query");

    const query = String(input.query ?? input.address ?? "").trim();
    const items = detectAddressContextItems(query, [...providerMap.values()], {
      chain: input.chain,
      network: input.network,
    });

    return {
      ok: true,
      query,
      items,
      candidates: items,
    };
  }

  async function search(input = {}) {
    assertNonEmptyString(String(input.query ?? ""), "query");
    const domain = normalizeDomain(input.domain ?? "token");
    const queryKind = detectQueryKind(input);
    const limitValue = Number(input.limit ?? 20);
    const limit = Number.isInteger(limitValue) && limitValue > 0 ? limitValue : 20;

    const providers = listProviders({
      chain: input.chain,
      network: input.network,
      domain,
    });

    const executeSearch = async () => {
      const sourceStats = {
        total: providers.length,
        success: 0,
        failed: 0,
        hit: 0,
        empty: 0,
        timeout: 0,
      };

      const allCandidates = [];

      await Promise.all(providers.map(async (provider) => {
        const method = pickProviderMethod(provider, domain);
        if (!method) {
          sourceStats.empty += 1;
          return;
        }

        try {
          const rows = await method({
            domain,
            query: String(input.query).trim(),
            kind: queryKind,
            chain: input.chain ?? null,
            network: input.network ?? null,
            limit,
            cursor: input.cursor ?? null,
            timeoutMs: input.timeoutMs ?? null,
            forceRemote: input.forceRemote === true,
            metadata: input.metadata ?? null,
          }, {
            providerId: provider.id,
            providerChain: provider.chain,
            providerNetworks: provider.networks,
          });

          sourceStats.success += 1;

          const normalizedRows = (Array.isArray(rows) ? rows : [])
            .map((row) => normalizeCandidate(row, {
              domain,
              chain: provider.chain,
              network: toCandidateNetwork(row, provider, input),
              source: "provider",
              providerId: provider.id,
            }))
            .filter(Boolean);

          if (normalizedRows.length === 0) {
            sourceStats.empty += 1;
            return;
          }

          sourceStats.hit += 1;
          allCandidates.push(...normalizedRows);
        } catch (error) {
          if (String(error?.name ?? "") === "AbortError") {
            sourceStats.timeout += 1;
          }
          sourceStats.failed += 1;
        }
      }));

      const items = dedupeAndSortCandidates(allCandidates, input.query, input, rankConfig).slice(0, limit);

      return {
        ok: true,
        domain,
        query: String(input.query).trim(),
        queryKind,
        items,
        candidates: items,
        sourceStats,
      };
    };

    if (!cacheEnabled || input.forceRemote === true || providers.length === 0) {
      return await executeSearch();
    }

    const requestKey = buildSearchRequestKey({
      cacheNamespace,
      domain,
      query: input.query,
      queryKind,
      chain: input.chain,
      network: input.network,
      limit,
      cursor: input.cursor,
      providerIds: providers.map((provider) => provider.id),
    });

    return await requestEngine.fetchShared({
      requestKey,
      fetcher: executeSearch,
      ttlMs: Number.isFinite(Number(input.cacheTtlMs)) ? Number(input.cacheTtlMs) : undefined,
    });
  }

  const explicitProviders = Array.isArray(options.providers) ? options.providers : [];
  registerSearchProviders({ registerProvider }, explicitProviders);

  return {
    registerProvider,
    unregisterProvider,
    hasProvider,
    listProviders,
    clearProviders,
    getSearchStats,
    invalidateSearchCache,
    resolveAddressContext,
    search,
  };
}

export function createDefaultSearchEngine(options = {}) {
  const { providers, ...rest } = options;
  const engine = createSearchEngine({
    ...rest,
    providers: [],
  });

  registerSearchProviders(engine, createDefaultSearchProviders());
  if (Array.isArray(providers) && providers.length > 0) {
    registerSearchProviders(engine, providers);
  }

  return engine;
}

export function createTokenSearchEngine(options = {}) {
  const hasCustomProviders = Array.isArray(options.providers) && options.providers.length > 0;
  const providers = hasCustomProviders
    ? options.providers.map((provider) => ({
      ...provider,
      networks: normalizeProviderNetworks(provider),
      capabilities: normalizeProviderCapabilities(provider),
    }))
    : undefined;

  const shouldUseDefaultProviders = options.withDefaultProviders === true
    || (!hasCustomProviders && options.withDefaultProviders !== false);

  const engine = shouldUseDefaultProviders
    ? createDefaultSearchEngine({
      providers,
      chainPriority: options.chainPriority,
      networkPriority: options.networkPriority,
    })
    : createSearchEngine({
      providers,
      chainPriority: options.chainPriority,
      networkPriority: options.networkPriority,
    });

  async function search(input = {}) {
    return await engine.search({
      ...input,
      domain: "token",
    });
  }

  return {
    registerProvider: engine.registerProvider,
    unregisterProvider: engine.unregisterProvider,
    hasProvider: engine.hasProvider,
    listProviders: engine.listProviders,
    clearProviders: engine.clearProviders,
    getSearchStats: engine.getSearchStats,
    invalidateSearchCache: engine.invalidateSearchCache,
    search,
  };
}

export default {
  createSearchEngine,
  createDefaultSearchEngine,
  createTokenSearchEngine,
};
