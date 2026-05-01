function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isBalanceProvider(provider) {
  if (!provider || typeof provider !== "object") return false;
  const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
  return capabilities.includes("balance") && typeof provider.batchBalance === "function";
}

function findProviderForChain(providers, chain) {
  const normalizedChain = normalizeLower(chain);
  return providers.find((p) => normalizeLower(p?.chain) === normalizedChain) ?? null;
}

export async function batchBalanceWithProviders(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const providers = (Array.isArray(options.providers) ? options.providers : [])
    .filter(isBalanceProvider);

  // 按 chain 分组，保留原始 index
  const chainGroups = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const chain = normalizeLower(row?.chain);
    if (!chain) {
      throw new TypeError(`rows[${i}].chain 不能为空`);
    }
    if (!chainGroups.has(chain)) {
      chainGroups.set(chain, []);
    }
    chainGroups.get(chain).push({ row, index: i });
  }

  const output = new Array(rows.length).fill(null);

  await Promise.all(
    [...chainGroups.entries()].map(async ([chain, entries]) => {
      const provider = findProviderForChain(providers, chain);

      if (!provider) {
        // 没有匹配 provider，标记为不支持
        for (const { row, index } of entries) {
          output[index] = {
            ok: false,
            chain: row.chain,
            network: row.network ?? null,
            address: row.address ?? null,
            token: row.token ?? null,
            ownerAddress: null,
            tokenAddress: null,
            rawBalance: null,
            error: `chain "${chain}" has no registered balance provider`,
          };
        }
        return;
      }

      try {
        const chainRows = entries.map(({ row }) => row);
        const results = await provider.batchBalance(chainRows);

        entries.forEach(({ index }, i) => {
          output[index] = results[i] ?? {
            ok: false,
            chain,
            network: entries[i].row.network ?? null,
            address: entries[i].row.address ?? null,
            token: entries[i].row.token ?? null,
            ownerAddress: null,
            tokenAddress: null,
            rawBalance: null,
            error: "provider returned no result",
          };
        });
      } catch (error) {
        const msg = String(error?.message ?? error ?? "unknown error");
        for (const { row, index } of entries) {
          output[index] = {
            ok: false,
            chain: row.chain,
            network: row.network ?? null,
            address: row.address ?? null,
            token: row.token ?? null,
            ownerAddress: null,
            tokenAddress: null,
            rawBalance: null,
            error: msg,
          };
        }
      }
    }),
  );

  return output;
}
