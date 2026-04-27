function normalizeChainsFromRequest(chains) {
  if (!Array.isArray(chains) || chains.length === 0) {
    return [];
  }

  const normalized = [];
  for (const item of chains) {
    if (typeof item === "string") {
      const chain = String(item).trim().toLowerCase();
      if (chain) {
        normalized.push({ chain, addressTypes: null });
      }
      continue;
    }

    if (item && typeof item === "object") {
      const chain = String(item.chain ?? "").trim().toLowerCase();
      if (!chain) continue;
      const addressTypes = Array.isArray(item.addressTypes)
        ? item.addressTypes.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
        : null;
      normalized.push({ chain, addressTypes });
    }
  }

  return normalized;
}

function queryKeysWithDataEngine(rows = [], request = {}) {
  const selectors = request?.selectors ?? request?.keyFilters ?? {};

  const keyIdFilter = String(selectors?.keyId ?? "").trim();
  const keyName = String(selectors?.name ?? selectors?.keyName ?? "").trim();
  const keyNameNeedle = keyName.toLowerCase();
  const nameExact = Boolean(selectors?.nameExact);
  const sourceNameFilter = String(selectors?.sourceName ?? "").trim();
  const sourceNameNeedle = sourceNameFilter.toLowerCase();
  const keyTypeFilter = String(selectors?.keyType ?? "").trim();
  const sourceTypeFilter = String(selectors?.source ?? "").trim().toLowerCase();

  return rows
    .map((row) => ({
      keyId: String(row?.keyId ?? "").trim(),
      name: String(row?.name ?? "").trim(),
      sourceName: row?.sourceName ?? null,
      keyType: String(row?.keyType ?? "").trim() || null,
      sourceType: String(row?.sourceType ?? "").trim() || null,
      path: row?.path ?? null,
      addresses: row?.addresses && typeof row.addresses === "object" ? row.addresses : {},
    }))
    .filter((item) => {
      if (!item.keyId) return false;
      if (keyIdFilter && item.keyId !== keyIdFilter) return false;
      if (keyTypeFilter && String(item.keyType ?? "") !== keyTypeFilter) return false;
      if (sourceTypeFilter && String(item.sourceType ?? "").toLowerCase() !== sourceTypeFilter) return false;

      if (keyName || sourceNameFilter) {
        const nameLower = String(item.name ?? "").toLowerCase();
        const snLower = String(item.sourceName ?? "").toLowerCase();

        let nameMatch = true;
        let sourceNameMatch = true;

        if (keyName) {
          if (nameExact) {
            nameMatch = nameLower === keyNameNeedle;
          } else {
            nameMatch = nameLower.includes(keyNameNeedle);
          }
        }

        if (sourceNameFilter) {
          sourceNameMatch = snLower.includes(sourceNameNeedle);
        }

        if (keyName && sourceNameFilter) {
          if (!nameMatch && !sourceNameMatch) return false;
        } else if (keyName) {
          if (!nameMatch) return false;
        } else if (sourceNameFilter) {
          if (!sourceNameMatch) return false;
        }
      }

      return true;
    });
}

async function resolveAddressesForKey(key, requestedChains = [], deps = {}) {
  const existing = key?.addresses && typeof key.addresses === "object" ? key.addresses : {};
  const result = {};

  for (const { chain, addressTypes } of requestedChains) {
    const hasTypedMode = Array.isArray(addressTypes) && addressTypes.length > 0;

    if (!hasTypedMode) {
      const cur = existing[chain];
      const items = Array.isArray(cur) ? cur : cur ? [cur] : [];
      const filtered = items.map((a) => String(a ?? "").trim()).filter(Boolean);

      if (filtered.length > 0) {
        result[chain] = filtered.length === 1 ? filtered[0] : filtered;
        continue;
      }

      if (typeof deps.getSigner === "function") {
        try {
          const signer = await deps.getSigner({ chain, keyId: key.keyId });
          if (signer && typeof signer.getAddress === "function") {
            const addr = await signer.getAddress({});
            const text = String(addr ?? "").trim();
            result[chain] = text || [];
            continue;
          }
        } catch {
          // keep empty fallback
        }
      }

      result[chain] = [];
      continue;
    }

    if (typeof deps.getSigner === "function") {
      try {
        const signer = await deps.getSigner({ chain, keyId: key.keyId });
        if (signer && typeof signer.getAddress === "function") {
          const generated = [];
          for (const addressType of addressTypes) {
            try {
              const addr = await signer.getAddress({ addressType });
              const text = String(addr ?? "").trim();
              if (text && !generated.some((item) => item.address === text && item.type === addressType)) {
                generated.push({ address: text, type: addressType });
              }
            } catch {
              // skip single addressType error
            }
          }
          result[chain] = generated;
          continue;
        }
      } catch {
        // keep empty fallback
      }
    }

    result[chain] = [];
  }

  return result;
}

export function createPickWalletOps(deps = {}) {
  async function pickWallet(request = {}, tree = {}) {
    const scope = String(request?.scope ?? "single").trim().toLowerCase() || "single";
    const outputs = request.outputs ?? request.outps ?? {};
    const requestedChains = normalizeChainsFromRequest(outputs?.chains);
    const treeRows = Array.isArray(tree?.tree) ? tree.tree : [];
    const selectedKeys = queryKeysWithDataEngine(treeRows, request);

    const keysToProcess = scope === "all" ? selectedKeys : selectedKeys.slice(0, 1);

    const results = await Promise.all(
      keysToProcess.map(async (key) => {
        const addresses = await resolveAddressesForKey(key, requestedChains, deps);
        return {
          keyId: key.keyId,
          name: key.name,
          keyType: key.keyType,
          sourceType: key.sourceType,
          path: key.path ?? null,
          addresses,
        };
      }),
    );

    return results;
  }

  return {
    pickWallet,
  };
}

export default createPickWalletOps;
