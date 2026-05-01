import {
  assertNonEmptyString,
  normalizeLower,
  normalizeDomain,
  normalizeNetworkHint,
} from "./utils.mjs";

export function normalizeProviderNetworks(provider) {
  if (Array.isArray(provider.networks) && provider.networks.length > 0) {
    return provider.networks
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
  }
  const fallback = String(provider.network ?? "").trim();
  return fallback ? [fallback] : [];
}

export function normalizeProviderCapabilities(provider) {
  const raw = Array.isArray(provider.capabilities) && provider.capabilities.length > 0
    ? provider.capabilities
    : ["token"];
  return raw
    .map((x) => normalizeDomain(x))
    .filter((x, index, arr) => arr.indexOf(x) === index);
}

export function resolveChainHint(value, providers = []) {
  const raw = normalizeLower(value);
  if (!raw) return "";

  const chains = new Set(
    (Array.isArray(providers) ? providers : [])
      .map((provider) => normalizeLower(provider?.chain))
      .filter(Boolean),
  );
  if (chains.has(raw)) return raw;

  const matchedChains = new Set();
  for (const provider of (Array.isArray(providers) ? providers : [])) {
    const chain = normalizeLower(provider?.chain);
    if (!chain) continue;
    const networks = normalizeProviderNetworks(provider).map((net) => normalizeLower(net));
    if (networks.includes(raw)) matchedChains.add(chain);
  }
  if (matchedChains.size === 1) {
    return [...matchedChains][0];
  }

  return raw;
}

export function assertValidProvider(provider, index) {
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

export function normalizeProviderDefinition(rawProvider) {
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

export function pickProviderMethod(provider, domain) {
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

export function isProviderMatch(provider, filter = {}, providers = []) {
  const filterChain = resolveChainHint(filter.chain, providers);

  if (filterChain && normalizeLower(provider.chain) !== filterChain) {
    return false;
  }
  if (filter.domain && !provider.capabilities.includes(normalizeDomain(filter.domain))) {
    return false;
  }
  if (filter.network) {
    const wanted = normalizeNetworkHint(filter.network);
    let hit = provider.networks.some((net) => normalizeLower(net) === wanted);
    if (!hit && wanted) hit = normalizeLower(provider.chain) === wanted;
    if (!hit) return false;
  }
  return true;
}

export function toCandidateNetwork(row, provider, input) {
  if (row?.network) return String(row.network).trim();
  if (input?.network) {
    const wanted = normalizeLower(input.network);
    const hit = provider.networks.find((net) => normalizeLower(net) === wanted);
    if (hit) return hit;
  }
  return provider.networks[0] ?? "default";
}

export default {
  normalizeProviderNetworks,
  normalizeProviderCapabilities,
  resolveChainHint,
  assertValidProvider,
  normalizeProviderDefinition,
  pickProviderMethod,
  isProviderMatch,
  toCandidateNetwork,
};
