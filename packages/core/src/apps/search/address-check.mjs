function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toStringList(values = []) {
  const uniq = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    uniq.add(text);
  }
  return [...uniq];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeContextItem(item = {}, chain) {
  const networks = toStringList(item?.networks);
  const availableNetworks = toStringList(item?.availableNetworks);
  const mergedNetworks = toStringList([...networks, ...availableNetworks]);

  const providerIds = toStringList(item?.providerIds);
  const confidence = Math.max(0, Math.min(1, toNumber(item?.confidence, 0)));

  const normalized = {
    kind: "address-context",
    chain: String(item?.chain ?? chain ?? "").trim(),
    addressType: String(item?.addressType ?? "unknown").trim() || "unknown",
    normalizedAddress: String(item?.normalizedAddress ?? "").trim(),
    detectedNetwork: item?.detectedNetwork ?? null,
    networks: mergedNetworks,
    mainnetNetworks: toStringList(item?.mainnetNetworks),
    availableNetworks: mergedNetworks,
    providerIds,
    confidence,
  };

  if (!normalized.chain || !normalized.normalizedAddress) {
    return null;
  }

  return normalized;
}

function sortContextItems(items = []) {
  return [...items].sort((a, b) => {
    const c = toNumber(b?.confidence, 0) - toNumber(a?.confidence, 0);
    if (c !== 0) return c;
    const p = (Array.isArray(b?.providerIds) ? b.providerIds.length : 0)
      - (Array.isArray(a?.providerIds) ? a.providerIds.length : 0);
    if (p !== 0) return p;
    return normalizeLower(a?.chain).localeCompare(normalizeLower(b?.chain));
  });
}

function dedupeContextItems(items = []) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = [
      normalizeLower(item?.chain),
      normalizeLower(item?.normalizedAddress),
      normalizeLower(item?.addressType),
    ].join(":");
    if (!key.replace(/:/g, "")) continue;

    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      continue;
    }

    const pickNext = toNumber(item?.confidence, 0) > toNumber(prev?.confidence, 0);
    if (pickNext) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

function normalizeAddressProviders(providers = []) {
  return (Array.isArray(providers) ? providers : []).filter((provider) => {
    if (!provider || typeof provider !== "object") return false;
    const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
    return capabilities.includes("address");
  });
}

function isNetworkMatched(item = {}, requestedNetwork = "") {
  const wanted = normalizeLower(requestedNetwork);
  if (!wanted) return true;

  const detected = normalizeLower(item?.detectedNetwork);
  if (detected && detected === wanted) return true;

  const networks = Array.isArray(item?.networks) ? item.networks : [];
  return networks.some((network) => normalizeLower(network) === wanted);
}

function isChainMatched(chain, requestedChain = "") {
  const wanted = normalizeLower(requestedChain);
  if (!wanted) return true;
  return normalizeLower(chain) === wanted;
}

export function detectAddressContextItems(query, providers = [], checkers = {}, filter = {}) {
  const rawQuery = String(query ?? "").trim();
  const addressProviders = normalizeAddressProviders(providers);
  const items = [];

  for (const [chain, checker] of Object.entries(checkers || {})) {
    if (typeof checker !== "function") continue;
    if (!isChainMatched(chain, filter?.chain)) continue;

    try {
      const row = checker(rawQuery, addressProviders, { normalizeLower });
      if (!row) continue;

      const normalized = normalizeContextItem(row, chain);
      if (!normalized) continue;
      if (!isNetworkMatched(normalized, filter?.network)) continue;

      items.push(normalized);
    } catch {
      // Checker failure should not block other chains.
    }
  }

  const deduped = dedupeContextItems(items);
  return sortContextItems(deduped);
}

export async function resolveAddressCheck(input = {}, options = {}) {
  const query = String(input?.query ?? input?.address ?? "").trim();
  if (!query) {
    throw new TypeError("query 不能为空");
  }

  const providers = Array.isArray(options.providers) ? options.providers : [];
  const checkers = options.checkers && typeof options.checkers === "object"
    ? options.checkers
    : {};

  const items = detectAddressContextItems(query, providers, checkers, {
    chain: input?.chain,
    network: input?.network,
  });

  const checkerCount = Object.values(checkers).filter((x) => typeof x === "function").length;

  return {
    ok: true,
    query,
    items,
    candidates: items,
    sourceStats: {
      total: checkerCount,
      success: checkerCount,
      failed: 0,
      hit: items.length > 0 ? 1 : 0,
      empty: items.length > 0 ? 0 : 1,
    },
  };
}

export default {
  detectAddressContextItems,
  resolveAddressCheck,
};
