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

function buildCandidateNetworks(input = {}, contextItem = {}, config = {}) {
  const requestedNetwork = String(input?.network ?? "").trim().toLowerCase();
  const availableNetworks = uniq(
    (Array.isArray(contextItem?.availableNetworks) ? contextItem.availableNetworks : [])
      .map((x) => String(x ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const defaultNetwork = String(config?.defaultNetwork ?? "eth").trim().toLowerCase() || "eth";
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

export async function runEvmAddressPipeline(input = {}) {
  const engine = input?.engine;
  const query = String(input?.query ?? "").trim();
  const limit = Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 10;
  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000;
  const contextItem = input?.contextItem ?? null;
  const config = input?.config ?? {};

  if (!engine || typeof engine.search !== "function" || !query) {
    return null;
  }

  const networks = buildCandidateNetworks(input, contextItem, config);
  const attempts = [];

  for (const network of networks) {
    const result = await engine.search({
      domain: "address",
      query,
      network,
      limit,
      timeoutMs,
    });

    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    attempts.push({ network, count: candidates.length });
    if (candidates.length > 0) {
      return {
        ok: true,
        network,
        attempts,
        candidates,
      };
    }
  }

  return {
    ok: true,
    network: networks[0] ?? null,
    attempts,
    candidates: [],
  };
}

export default {
  runEvmAddressPipeline,
};
