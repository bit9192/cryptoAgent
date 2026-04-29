import { defaultBtcNetworkName, listBtcNetworksByScope, normalizeBtcNetworkName } from "../config/networks.js";
import { createBtcAddressSearchProvider } from "./address-provider.mjs";

function resolveDefaultBtcNetwork() {
  const byScope = listBtcNetworksByScope("default");
  if (Array.isArray(byScope) && byScope.length > 0) {
    return normalizeBtcNetworkName(byScope[0]);
  }
  return normalizeBtcNetworkName(defaultBtcNetworkName);
}

function resolveBtcPipelineNetwork(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return resolveDefaultBtcNetwork();
  return normalizeBtcNetworkName(raw);
}

function pickBtcAddressProviderFromEngine(engine) {
  if (!engine || typeof engine.listProviders !== "function") return null;
  const providers = engine.listProviders({ chain: "btc", domain: "address" });
  if (!Array.isArray(providers)) return null;
  const hit = providers.find((provider) => typeof provider?.searchAddress === "function");
  return hit ?? null;
}

export async function runBtcAddressPipeline(input = {}) {
  const engine = input?.engine;
  const explicitProvider = input?.provider && typeof input.provider.searchAddress === "function"
    ? input.provider
    : null;
  const providerFromEngine = explicitProvider ?? pickBtcAddressProviderFromEngine(engine);
  const query = String(input?.query ?? "").trim();
  const network = resolveBtcPipelineNetwork(input?.network);
  const limit = Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 10;
  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000;

  if (!query) {
    return null;
  }

  let rows = [];
  if (providerFromEngine && typeof providerFromEngine.searchAddress === "function") {
    rows = await providerFromEngine.searchAddress({ query, network, limit, timeoutMs });
  } else if (engine && typeof engine.search === "function") {
    // Backward-compatible path for tests that inject a minimal engine mock.
    const result = await engine.search({ domain: "address", query, network, limit, timeoutMs });
    rows = Array.isArray(result?.candidates) ? result.candidates : [];
  } else {
    const localProvider = createBtcAddressSearchProvider();
    rows = await localProvider.searchAddress({ query, network, limit, timeoutMs });
  }

  const candidates = (Array.isArray(rows) ? rows : []).slice(0, Math.max(1, limit));
  return {
    ok: true,
    network,
    attempts: [{ network, count: candidates.length }],
    candidates,
  };
}

export default {
  runBtcAddressPipeline,
};
