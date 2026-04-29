import { defaultEvmNetworkName, listEvmNetworksByScope, normalizeEvmNetworkName } from "../configs/networks.js";
import { createEvmAddressSearchProvider } from "./address-provider.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function uniq(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).filter(Boolean))];
}

function rankNetwork(network, priority = []) {
  const idx = priority.findIndex((item) => normalizeLower(item) === normalizeLower(network));
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

function sortByPriority(networks = [], priority = []) {
  return [...networks].sort((a, b) => {
    const ra = rankNetwork(a, priority);
    const rb = rankNetwork(b, priority);
    if (ra !== rb) return ra - rb;
    return normalizeLower(a).localeCompare(normalizeLower(b));
  });
}

function resolveDefaultEvmNetwork() {
  const byScope = listEvmNetworksByScope("default");
  if (Array.isArray(byScope) && byScope.length > 0) {
    return normalizeEvmNetworkName(byScope[0]);
  }
  return normalizeEvmNetworkName(defaultEvmNetworkName);
}

function buildCandidateNetworks(input = {}, contextItem = {}, config = {}) {
  const requestedNetwork = String(input?.network ?? "").trim().toLowerCase();
  const availableNetworks = uniq(
    (Array.isArray(contextItem?.availableNetworks) ? contextItem.availableNetworks : [])
      .map((x) => String(x ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const defaultNetwork = String(config?.defaultNetwork ?? "").trim().toLowerCase() || resolveDefaultEvmNetwork();
  const priority = Array.isArray(config?.networkPriority) ? config.networkPriority : [];

  if (requestedNetwork) {
    if (config?.fallbackWhenNetworkSpecified === true && availableNetworks.length > 0) {
      const withRequestedFirst = uniq([requestedNetwork, ...availableNetworks]);
      return sortByPriority(withRequestedFirst, priority);
    }
    return [requestedNetwork];
  }

  if (availableNetworks.length === 0) {
    return [defaultNetwork];
  }

  return sortByPriority(availableNetworks, priority);
}

function pickEvmAddressProviderFromEngine(engine) {
  if (!engine || typeof engine.listProviders !== "function") return null;
  const providers = engine.listProviders({ chain: "evm", domain: "address" });
  if (!Array.isArray(providers)) return null;
  const hit = providers.find((provider) => typeof provider?.searchAddress === "function");
  return hit ?? null;
}

export async function runEvmAddressPipeline(input = {}) {
  const engine = input?.engine;
  const explicitProvider = input?.provider && typeof input.provider.searchAddress === "function"
    ? input.provider
    : null;
  const providerFromEngine = explicitProvider ?? pickEvmAddressProviderFromEngine(engine);
  const provider = providerFromEngine ?? (engine && typeof engine.search === "function" ? null : createEvmAddressSearchProvider());

  const query = String(input?.query ?? "").trim();
  const requestedNetwork = String(input?.network ?? "").trim().toLowerCase();
  const limit = Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 10;
  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000;
  const contextItem = input?.contextItem ?? null;
  const config = input?.config ?? {};

  if (!query) {
    return null;
  }

  // Backward-compatible path for tests that inject a minimal engine mock (engine.search).
  if (!provider && engine && typeof engine.search === "function") {
    if (!requestedNetwork) {
      const result = await engine.search({ domain: "address", query, limit, timeoutMs });
      const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
      const inferredNetworkSet = new Set(candidates.map((item) => normalizeLower(item?.network)).filter(Boolean));
      return {
        ok: true,
        network: inferredNetworkSet.size === 1 ? [...inferredNetworkSet][0] : null,
        attempts: [{ network: "*", count: candidates.length }],
        candidates,
      };
    }

    const networks = buildCandidateNetworks(input, contextItem, config);
    const attempts = [];
    for (const network of networks) {
      const result = await engine.search({ domain: "address", query, network, limit, timeoutMs });
      const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
      attempts.push({ network, count: candidates.length });
      if (candidates.length > 0) {
        return { ok: true, network, attempts, candidates };
      }
    }
    return { ok: true, network: networks[0] ?? null, attempts, candidates: [] };
  }

  // Normal path: use EVM address provider directly.
  if (!requestedNetwork) {
    const rows = await provider.searchAddress({ query, limit, timeoutMs });
    const candidates = Array.isArray(rows) ? rows : [];
    const inferredNetworkSet = new Set(candidates.map((item) => normalizeLower(item?.network)).filter(Boolean));
    return {
      ok: true,
      network: inferredNetworkSet.size === 1 ? [...inferredNetworkSet][0] : null,
      attempts: [{ network: "*", count: candidates.length }],
      candidates,
    };
  }

  const networks = buildCandidateNetworks(input, contextItem, config);
  const attempts = [];
  for (const network of networks) {
    const rows = await provider.searchAddress({ query, network, limit, timeoutMs });
    const candidates = Array.isArray(rows) ? rows : [];
    attempts.push({ network, count: candidates.length });
    if (candidates.length > 0) {
      return { ok: true, network, attempts, candidates };
    }
  }
  return { ok: true, network: networks[0] ?? null, attempts, candidates: [] };
}

export default {
  runEvmAddressPipeline,
};
