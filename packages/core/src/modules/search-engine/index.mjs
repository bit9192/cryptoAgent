import { getAddress } from "ethers";

import { parseBtcAddress } from "../../apps/btc/address.mjs";
import { btcNetworks } from "../../apps/btc/config/networks.js";
import { evmNetworks } from "../../apps/evm/configs/networks.js";
import { toTrxBase58Address } from "../../apps/trx/address-codec.mjs";
import { trxNetworks } from "../../apps/trx/config/networks.js";
import { createRequestEngine } from "../request-engine/index.mjs";
import {
  createDefaultSearchProviders,
  registerSearchProviders,
} from "./composition-root.mjs";

const SUPPORTED_DOMAINS = new Set(["token", "trade", "contract", "address"]);

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fieldName} 必须是非空字符串`);
  }
}

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getConfiguredNetworksByChain(chain) {
  if (chain === "btc") return Object.keys(btcNetworks);
  if (chain === "evm") return Object.keys(evmNetworks);
  if (chain === "trx") return Object.keys(trxNetworks);
  return [];
}

function resolveBtcAddressType(parsed = {}) {
  if (parsed.format === "base58") {
    return parsed.kind;
  }
  if (parsed.witnessVersion === 0) return "p2wpkh";
  if (parsed.witnessVersion === 1) return "p2tr";
  return `segwit_v${parsed.witnessVersion}`;
}

function normalizeRequestedChain(value) {
  const raw = normalizeLower(value);
  if (!raw) return "";
  if (["btc", "bitcoin"].includes(raw)) return "btc";
  if (["trx", "tron"].includes(raw)) return "trx";
  if (["evm", "eth", "ethereum", "bsc", "fork", "base", "polygon", "arb", "arbitrum", "op", "optimism"].includes(raw)) return "evm";
  return raw;
}

function looksLikeTrxAddress(value) {
  const raw = String(value ?? "").trim();
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw) || /^41[0-9a-fA-F]{40}$/.test(raw);
}

function resolveAvailableNetworks(providerList = [], chain) {
  const configured = new Set(getConfiguredNetworksByChain(chain));
  const available = new Set();

  for (const provider of providerList) {
    if (normalizeLower(provider.chain) !== chain) continue;
    for (const network of provider.networks || []) {
      const normalized = String(network ?? "").trim();
      if (configured.has(normalized)) {
        available.add(normalized);
      }
    }
  }

  return [...available];
}

function detectAddressContextItems(query, providers = [], filter = {}) {
  const items = [];
  const rawQuery = String(query ?? "").trim();
  const requestedChain = normalizeRequestedChain(filter.chain);

  const addressProviders = providers.filter((provider) => provider.capabilities.includes("address"));

  if (!requestedChain || requestedChain === "btc") {
    try {
      const parsed = parseBtcAddress(rawQuery);
      const providerIds = addressProviders
        .filter((provider) => normalizeLower(provider.chain) === "btc")
        .map((provider) => provider.id);
      if (providerIds.length > 0) {
        items.push({
          kind: "address-context",
          chain: "btc",
          addressType: resolveBtcAddressType(parsed),
          normalizedAddress: parsed.address,
          detectedNetwork: parsed.network,
          availableNetworks: resolveAvailableNetworks(addressProviders, "btc"),
          providerIds,
          confidence: 1,
        });
      }
    } catch {
      // ignore
    }
  }

  if (!requestedChain || requestedChain === "trx") {
    try {
      if (!looksLikeTrxAddress(rawQuery)) {
        throw new Error("not-trx-address");
      }
      const normalizedAddress = toTrxBase58Address(rawQuery);
      const providerIds = addressProviders
        .filter((provider) => normalizeLower(provider.chain) === "trx")
        .map((provider) => provider.id);
      if (providerIds.length > 0) {
        items.push({
          kind: "address-context",
          chain: "trx",
          addressType: "base58",
          normalizedAddress,
          detectedNetwork: null,
          availableNetworks: resolveAvailableNetworks(addressProviders, "trx"),
          providerIds,
          confidence: 1,
        });
      }
    } catch {
      // ignore
    }
  }

  if (!requestedChain || requestedChain === "evm") {
    try {
      const normalizedAddress = getAddress(rawQuery);
      const providerIds = addressProviders
        .filter((provider) => normalizeLower(provider.chain) === "evm")
        .map((provider) => provider.id);
      if (providerIds.length > 0) {
        items.push({
          kind: "address-context",
          chain: "evm",
          addressType: "hex",
          normalizedAddress,
          detectedNetwork: null,
          availableNetworks: resolveAvailableNetworks(addressProviders, "evm"),
          providerIds,
          confidence: 1,
        });
      }
    } catch {
      // ignore
    }
  }

  return items;
}

function normalizeDomain(domain) {
  const value = normalizeLower(domain || "token") || "token";
  if (!SUPPORTED_DOMAINS.has(value)) {
    throw new TypeError(`不支持的 search domain: ${String(domain ?? "")}`);
  }
  return value;
}

function normalizeNetworkHint(value) {
  const raw = normalizeLower(value);
  if (!raw) return "";
  if (["eth", "ethereum", "mainnet", "evm"].includes(raw)) return raw;
  if (["trx", "tron"].includes(raw)) return "trx";
  if (["btc", "bitcoin"].includes(raw)) return "btc";
  return raw;
}

function stableStringify(value) {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

function buildSearchRequestKey(input = {}) {
  const {
    cacheNamespace,
    domain,
    query,
    queryKind,
    chain,
    network,
    limit,
    cursor,
    providerIds,
  } = input;
  const payload = {
    domain,
    query: normalizeLower(query),
    queryKind,
    chain: normalizeLower(chain || "*"),
    network: normalizeLower(network || "*"),
    limit,
    cursor: normalizeLower(cursor || ""),
    providerIds: Array.isArray(providerIds) ? [...providerIds].sort() : [],
  };
  return `${cacheNamespace}:${stableStringify(payload)}`;
}

function detectQueryKind(input = {}) {
  if (input.kind && input.kind !== "auto") return input.kind;
  const query = String(input.query ?? "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(query)) return "address";
  if (/^[a-zA-Z0-9._-]{2,64}$/.test(query)) return "symbol";
  return "name";
}

function normalizeProviderNetworks(provider) {
  if (Array.isArray(provider.networks) && provider.networks.length > 0) {
    return provider.networks
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
  }
  const fallback = String(provider.network ?? "").trim();
  return fallback ? [fallback] : [];
}

function normalizeProviderCapabilities(provider) {
  const raw = Array.isArray(provider.capabilities) && provider.capabilities.length > 0
    ? provider.capabilities
    : ["token"];
  return raw
    .map((x) => normalizeDomain(x))
    .filter((x, index, arr) => arr.indexOf(x) === index);
}

function normalizeCandidate(raw, defaults = {}) {
  if (!raw || typeof raw !== "object") return null;
  const chain = String(raw.chain ?? defaults.chain ?? "").trim();
  const network = String(raw.network ?? defaults.network ?? "").trim();
  const address = String(raw.address ?? raw.tokenAddress ?? "").trim();
  const tokenAddress = String(raw.tokenAddress ?? address).trim();
  if (!chain || !network || !address) return null;
  const domain = normalizeDomain(raw.domain ?? defaults.domain ?? "token");

  const confidenceNum = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceNum)
    ? Math.max(0, Math.min(1, confidenceNum))
    : 0.5;

  const normalizedId = String(raw.id ?? `${normalizeLower(domain)}:${normalizeLower(chain)}:${normalizeLower(network)}:${normalizeLower(address)}`);
  const title = raw.title != null
    ? String(raw.title)
    : String(raw.name ?? raw.symbol ?? raw.tokenAddress ?? raw.address ?? "");

  let extra = {};
  if (raw.extra && typeof raw.extra === "object" && !Array.isArray(raw.extra)) {
    extra = { ...raw.extra };
  }
  if (raw.txHash != null) extra.txHash = raw.txHash;
  if (raw.routeSummary != null) extra.routeSummary = raw.routeSummary;
  if (raw.riskLevel != null) extra.riskLevel = raw.riskLevel;
  if (raw.tags != null) extra.tags = raw.tags;
  if (raw.score != null) extra.score = raw.score;

  return {
    domain,
    id: normalizedId,
    title,
    chain,
    network,
    address,
    tokenAddress,
    symbol: raw.symbol == null ? null : String(raw.symbol),
    name: raw.name == null ? null : String(raw.name),
    decimals: raw.decimals == null ? null : Number(raw.decimals),
    source: String(raw.source ?? defaults.source ?? "provider"),
    providerId: String(raw.providerId ?? defaults.providerId ?? "unknown"),
    confidence,
    extra,
  };
}

function resolveCandidateRank(candidate, input = {}, rankConfig = {}) {
  let rank = 0;
  const chain = normalizeLower(candidate.chain);
  const network = normalizeLower(candidate.network);
  const inputChain = normalizeLower(input.chain);
  const inputNetwork = normalizeNetworkHint(input.network);

  if (inputChain && inputChain === chain) rank += 200;
  if (inputNetwork) {
    if (inputNetwork === network) rank += 160;
    if (inputNetwork === "trx" && chain === "trx") rank += 150;
    if (inputNetwork === "btc" && chain === "btc") rank += 150;
    if (inputNetwork === "evm" && chain === "evm") rank += 150;
  }

  if (network === "mainnet") rank += 6;

  const chainPriority = rankConfig.chainPriority && typeof rankConfig.chainPriority === "object"
    ? rankConfig.chainPriority
    : {};
  const networkPriority = rankConfig.networkPriority && typeof rankConfig.networkPriority === "object"
    ? rankConfig.networkPriority
    : {};

  const chainWeight = Number(chainPriority[chain]);
  const networkWeight = Number(networkPriority[network]);

  if (Number.isFinite(chainWeight)) rank += chainWeight;
  if (Number.isFinite(networkWeight)) rank += networkWeight;

  return rank;
}

function dedupeAndSortCandidates(candidates, query, input = {}, rankConfig = {}) {
  const dedupMap = new Map();
  const queryLower = normalizeLower(query);

  for (const row of candidates) {
    const key = String(row.id ?? `${normalizeLower(row.chain)}:${normalizeLower(row.network)}:${normalizeLower(row.address ?? row.tokenAddress)}`);
    const old = dedupMap.get(key);
    if (!old || row.confidence > old.confidence) {
      dedupMap.set(key, row);
    }
  }

  const list = [...dedupMap.values()];
  list.sort((a, b) => {
    const aExact = normalizeLower(a.symbol) === queryLower ? 1 : 0;
    const bExact = normalizeLower(b.symbol) === queryLower ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const aRank = resolveCandidateRank(a, input, rankConfig);
    const bRank = resolveCandidateRank(b, input, rankConfig);
    if (aRank !== bRank) return bRank - aRank;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return normalizeLower(a.tokenAddress).localeCompare(normalizeLower(b.tokenAddress));
  });

  return list;
}

function assertValidProvider(provider, index) {
  if (!provider || typeof provider !== "object") {
    throw new TypeError(`providers[${index}] 必须是对象`);
  }
  assertNonEmptyString(String(provider.id ?? ""), `providers[${index}].id`);
  assertNonEmptyString(String(provider.chain ?? ""), `providers[${index}].chain`);
  const networks = normalizeProviderNetworks(provider);
  if (networks.length === 0) {
    throw new TypeError(`providers[${index}].networks 必须包含至少一个网络`);
  }

  const capabilities = normalizeProviderCapabilities(provider);
  if (capabilities.length === 0) {
    throw new TypeError(`providers[${index}].capabilities 不能为空`);
  }

  const hasGenericSearch = typeof provider.search === "function";
  const hasDomainSearch = capabilities.some((domain) => {
    const fnName = `search${domain[0].toUpperCase()}${domain.slice(1)}`;
    return typeof provider[fnName] === "function";
  });

  if (!hasGenericSearch && !hasDomainSearch) {
    throw new TypeError(`providers[${index}] 必须实现 search 或对应 domain 的 searchXxx`);
  }
}

function normalizeProviderDefinition(rawProvider) {
  const networks = normalizeProviderNetworks(rawProvider);
  const capabilities = normalizeProviderCapabilities(rawProvider);

  return {
    ...rawProvider,
    id: String(rawProvider.id).trim(),
    chain: String(rawProvider.chain).trim(),
    networks,
    capabilities,
  };
}

function pickProviderMethod(provider, domain) {
  if (typeof provider.search === "function") {
    return provider.search.bind(provider);
  }
  if (domain === "token" && typeof provider.searchToken === "function") {
    return provider.searchToken.bind(provider);
  }
  if (domain === "trade" && typeof provider.searchTrade === "function") {
    return provider.searchTrade.bind(provider);
  }
  if (domain === "contract" && typeof provider.searchContract === "function") {
    return provider.searchContract.bind(provider);
  }
  if (domain === "address" && typeof provider.searchAddress === "function") {
    return provider.searchAddress.bind(provider);
  }
  return null;
}

function isProviderMatch(provider, filter = {}) {
  if (filter.chain && normalizeLower(provider.chain) !== normalizeLower(filter.chain)) {
    return false;
  }
  if (filter.domain && !provider.capabilities.includes(normalizeDomain(filter.domain))) {
    return false;
  }
  if (filter.network) {
    const wanted = normalizeNetworkHint(filter.network);
    let hit = provider.networks.some((net) => normalizeLower(net) === wanted);
    if (!hit && wanted === "trx") {
      hit = normalizeLower(provider.chain) === "trx";
    }
    if (!hit && wanted === "btc") {
      hit = normalizeLower(provider.chain) === "btc";
    }
    if (!hit && wanted === "evm") {
      hit = normalizeLower(provider.chain) === "evm";
    }
    if (!hit) return false;
  }
  return true;
}

function toCandidateNetwork(row, provider, input) {
  if (row?.network) return String(row.network).trim();
  if (input?.network) {
    const wanted = normalizeLower(input.network);
    const hit = provider.networks.find((net) => normalizeLower(net) === wanted);
    if (hit) return hit;
  }
  return provider.networks[0] ?? "default";
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
    return providers.filter((provider) => isProviderMatch(provider, filter));
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
