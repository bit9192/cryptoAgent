function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeChain(value) {
  return normalizeLower(value);
}

function normalizeNetwork(value) {
  return normalizeLower(value);
}

function normalizeLimit(value, fallback = 20) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

function isTokenProvider(provider) {
  if (!provider || typeof provider !== "object") return false;
  const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
  return capabilities.includes("token") && typeof provider.searchToken === "function";
}

function isProviderMatched(provider, filter = {}) {
  const chain = normalizeChain(filter?.chain);
  const network = normalizeNetwork(filter?.network);

  if (chain && normalizeChain(provider?.chain) !== chain) {
    return false;
  }

  if (!network) {
    return true;
  }

  const networks = Array.isArray(provider?.networks) ? provider.networks : [];
  return networks.some((item) => normalizeNetwork(item) === network);
}

function normalizeItem(row = {}, provider, input = {}) {
  const chain = String(row?.chain ?? provider?.chain ?? "").trim();
  const network = String(
    row?.network
      ?? input?.network
      ?? (Array.isArray(provider?.networks) ? provider.networks[0] : "")
      ?? "",
  ).trim();

  if (!chain || !network) return null;

  return {
    ...row,
    domain: "token",
    chain,
    network,
    source: String(row?.source ?? "provider").trim() || "provider",
    providerId: String(row?.providerId ?? provider?.id ?? "").trim() || null,
  };
}

export async function searchTokenWithProviders(input = {}, options = {}) {
  const query = String(input?.query ?? "").trim();
  if (!query) {
    throw new TypeError("query 不能为空");
  }

  const limit = normalizeLimit(input?.limit, 20);
  const providers = (Array.isArray(options.providers) ? options.providers : [])
    .filter(isTokenProvider)
    .filter((provider) => isProviderMatched(provider, {
      chain: input?.chain,
      network: input?.network,
    }));

  const sourceStats = {
    total: providers.length,
    success: 0,
    failed: 0,
    hit: 0,
    empty: 0,
    timeout: 0,
  };

  const mergedItems = [];

  for (const provider of providers) {
    try {
      const rows = await provider.searchToken({
        query,
        network: input?.network,
        limit,
        matchMode: input?.matchMode,
      }, {
        providerId: provider.id,
        providerChain: provider.chain,
        providerNetworks: provider.networks,
      });

      sourceStats.success += 1;

      const normalizedRows = (Array.isArray(rows) ? rows : [])
        .map((row) => normalizeItem(row, provider, input))
        .filter(Boolean);

      if (normalizedRows.length === 0) {
        sourceStats.empty += 1;
        continue;
      }

      sourceStats.hit += 1;
      mergedItems.push(...normalizedRows);
    } catch (error) {
      if (String(error?.name ?? "") === "AbortError") {
        sourceStats.timeout += 1;
      }
      sourceStats.failed += 1;
    }
  }

  const items = mergedItems.slice(0, limit);

  return {
    ok: true,
    domain: "token",
    query,
    items,
    candidates: items,
    sourceStats,
  };
}

export default {
  searchTokenWithProviders,
};
