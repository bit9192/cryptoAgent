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

function isAddressProvider(provider) {
  if (!provider || typeof provider !== "object") return false;
  const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
  return capabilities.includes("address") && typeof provider.searchAddress === "function";
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
    domain: "address",
    chain,
    network,
    source: String(row?.source ?? "provider").trim() || "provider",
    providerId: String(row?.providerId ?? provider?.id ?? "").trim() || null,
  };
}

export async function searchAddressWithProviders(input = {}, options = {}) {
  const query = String(input?.query ?? input?.address ?? "").trim();
  if (!query) {
    throw new TypeError("address 不能为空");
  }

  const limit = normalizeLimit(input?.limit, 20);
  const providers = (Array.isArray(options.providers) ? options.providers : [])
    .filter(isAddressProvider)
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

  const allItems = [];

  await Promise.all(
    providers.map(async (provider) => {
      try {
        const rows = await provider.searchAddress({
          query,
          address: query,
          chain: normalizeChain(provider.chain),
          network: input?.network,
          limit,
        });

        const items = (Array.isArray(rows) ? rows : [])
          .map((row) => normalizeItem(row, provider, input))
          .filter(Boolean);

        sourceStats.success += 1;
        if (items.length > 0) {
          sourceStats.hit += 1;
          allItems.push(...items);
        } else {
          sourceStats.empty += 1;
        }
      } catch {
        sourceStats.failed += 1;
      }
    }),
  );

  const items = allItems.slice(0, limit);

  return {
    ok: true,
    address: query,
    chain: normalizeChain(input?.chain) || null,
    network: normalizeNetwork(input?.network) || null,
    items,
    sourceStats,
  };
}

export default { searchAddressWithProviders };
