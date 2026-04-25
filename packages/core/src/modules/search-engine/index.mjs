import { resolveEvmToken } from "../../apps/evm/configs/tokens.js";
import { resolveBtcToken } from "../../apps/btc/config/tokens.js";

const SUPPORTED_DOMAINS = new Set(["token", "trade", "contract", "address"]);

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fieldName} 必须是非空字符串`);
  }
}

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDomain(domain) {
  const value = normalizeLower(domain || "token") || "token";
  if (!SUPPORTED_DOMAINS.has(value)) {
    throw new TypeError(`不支持的 search domain: ${String(domain ?? "")}`);
  }
  return value;
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
  const tokenAddress = String(raw.tokenAddress ?? raw.address ?? "").trim();
  if (!chain || !network || !tokenAddress) return null;

  const confidenceNum = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceNum)
    ? Math.max(0, Math.min(1, confidenceNum))
    : 0.5;

  return {
    chain,
    network,
    tokenAddress,
    symbol: raw.symbol == null ? null : String(raw.symbol),
    name: raw.name == null ? null : String(raw.name),
    decimals: raw.decimals == null ? null : Number(raw.decimals),
    source: String(raw.source ?? defaults.source ?? "provider"),
    providerId: String(raw.providerId ?? defaults.providerId ?? "unknown"),
    confidence,
  };
}

function dedupeAndSortCandidates(candidates, query) {
  const dedupMap = new Map();
  const queryLower = normalizeLower(query);

  for (const row of candidates) {
    const key = `${normalizeLower(row.chain)}:${normalizeLower(row.network)}:${normalizeLower(row.tokenAddress)}`;
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
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return normalizeLower(a.tokenAddress).localeCompare(normalizeLower(b.tokenAddress));
  });

  return list;
}

function createDefaultProviders() {
  return [
    {
      id: "btc-config",
      chain: "btc",
      networks: ["mainnet"],
      capabilities: ["token"],
      async searchToken(input) {
        try {
          const token = resolveBtcToken({
            key: input.query,
            network: "mainnet",
          });
          return [{
            chain: "btc",
            network: "mainnet",
            tokenAddress: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            source: "config",
            confidence: 0.95,
          }];
        } catch {
          return [];
        }
      },
    },
    {
      id: "evm-config",
      chain: "evm",
      networks: ["eth"],
      capabilities: ["token"],
      async searchToken(input) {
        try {
          const token = resolveEvmToken({
            key: input.query,
            network: "eth",
          });
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            source: "config",
            confidence: 0.9,
          }];
        } catch {
          return [];
        }
      },
    },
  ];
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
    const wanted = normalizeLower(filter.network);
    const hit = provider.networks.some((net) => normalizeLower(net) === wanted);
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

    const items = dedupeAndSortCandidates(allCandidates, input.query).slice(0, limit);

    return {
      ok: true,
      domain,
      query: String(input.query).trim(),
      queryKind,
      items,
      candidates: items,
      sourceStats,
    };
  }

  const defaultProviders = Array.isArray(options.providers) && options.providers.length > 0
    ? options.providers
    : (options.withDefaultProviders === false ? [] : createDefaultProviders());
  for (const provider of defaultProviders) {
    registerProvider(provider);
  }

  return {
    registerProvider,
    unregisterProvider,
    hasProvider,
    listProviders,
    clearProviders,
    search,
  };
}

export function createTokenSearchEngine(options = {}) {
  const providers = Array.isArray(options.providers) && options.providers.length > 0
    ? options.providers.map((provider) => ({
      ...provider,
      networks: normalizeProviderNetworks(provider),
      capabilities: normalizeProviderCapabilities(provider),
    }))
    : undefined;

  const engine = createSearchEngine({
    providers,
    withDefaultProviders: options.withDefaultProviders,
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
    search,
  };
}

export default {
  createSearchEngine,
  createTokenSearchEngine,
};
