function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function groupTokenAddressesByNetwork(rows = []) {
  const group = new Map();

  for (const row of rows) {
    const network = String(row?.network ?? "eth").trim() || "eth";
    const set = group.get(network) ?? new Set();
    for (const item of Array.isArray(row?.items) ? row.items : []) {
      const address = String(item?.tokenAddress ?? item?.address ?? "").trim();
      if (address) {
        set.add(address);
      }
    }
    group.set(network, set);
  }

  return group;
}

export async function enrichTokenSearchBatchWithOnchainMetadata(rows = [], options = {}) {
  const metadataBatchReader = options.metadataBatchReader;
  if (typeof metadataBatchReader !== "function") {
    return rows;
  }

  const grouped = groupTokenAddressesByNetwork(rows);
  const metaMapByNetwork = new Map();

  for (const [network, addressSet] of grouped.entries()) {
    const addresses = [...addressSet];
    if (addresses.length === 0) {
      continue;
    }

    try {
      const res = await metadataBatchReader(
        addresses.map((tokenAddress) => ({ token: tokenAddress })),
        {
          network,
          networkName: network,
          multicall: options.multicall,
          chainId: options.chainId,
          contractOverrides: options.contractOverrides,
        },
      );

      const map = new Map();
      const items = Array.isArray(res?.items) ? res.items : [];
      for (const item of items) {
        const address = normalizeLower(item?.tokenAddress);
        if (!address) continue;
        map.set(address, item);
      }
      metaMapByNetwork.set(network, map);
    } catch {
      metaMapByNetwork.set(network, new Map());
    }
  }

  return rows.map((row) => {
    const network = String(row?.network ?? "eth").trim() || "eth";
    const metaMap = metaMapByNetwork.get(network) ?? new Map();
    const items = (Array.isArray(row?.items) ? row.items : []).map((item) => {
      const address = normalizeLower(item?.tokenAddress ?? item?.address);
      const metadata = metaMap.get(address);
      if (!metadata) return item;

      return {
        ...item,
        name: metadata.name ?? item.name,
        symbol: metadata.symbol ?? item.symbol,
        decimals: metadata.decimals ?? item.decimals,
        extra: {
          ...(item.extra && typeof item.extra === "object" ? item.extra : {}),
          metadataSource: "multicall",
        },
      };
    });

    return {
      ...row,
      items,
    };
  });
}

export default {
  enrichTokenSearchBatchWithOnchainMetadata,
};