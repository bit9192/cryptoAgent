function normalizeChainsFromRequest(chains) {
  if (typeof chains === "string" && String(chains).trim().toLowerCase() === "all") {
    return [{ chain: "all", addressTypes: "all", existingOnly: false }];
  }

  if (typeof chains === "string" && String(chains).trim().toLowerCase() === "default") {
    return [{ chain: "default", addressTypes: null, existingOnly: true }];
  }

  if (!Array.isArray(chains) || chains.length === 0) {
    return [];
  }

  const normalized = [];
  for (const item of chains) {
    if (typeof item === "string") {
      const chain = String(item).trim().toLowerCase();
      if (chain) {
        normalized.push({
          chain,
          addressTypes: chain === "all" ? "all" : null,
          existingOnly: chain === "default",
        });
      }
      continue;
    }

    if (item && typeof item === "object") {
      const chain = String(item.chain ?? "").trim().toLowerCase();
      if (!chain) continue;
      const rawAddressTypes = item.addressTypes;
      const normalizedTyped = Array.isArray(rawAddressTypes)
        ? rawAddressTypes.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
        : null;
      const typedOnly = Array.isArray(normalizedTyped)
        ? normalizedTyped.filter((v) => v !== "default")
        : null;
      const addressTypes = typeof rawAddressTypes === "string" && String(rawAddressTypes).trim().toLowerCase() === "all"
        ? "all"
        : Array.isArray(rawAddressTypes)
          ? normalizedTyped
          : null;
      const existingOnly = Boolean(item.existingOnly);
      normalized.push({
        chain,
        addressTypes,
        existingOnly,
      });
    }
  }

  return normalized;
}

function normalizeAddressTypeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v).trim().toLowerCase())
    .filter((v) => v && v !== "default");
}

async function resolveRequestedChains(rawChains = [], deps = {}) {
  const normalized = normalizeChainsFromRequest(rawChains);
  const merged = new Map();

  function mergeChain(chain, addressTypes, options = {}) {
    const key = String(chain).trim().toLowerCase();
    if (!key || key === "all") return;

    const current = merged.get(key) ?? { hasNull: false, set: new Set(), existingOnly: false };
    if (addressTypes == null) {
      current.hasNull = true;
    } else {
      for (const t of normalizeAddressTypeList(addressTypes)) {
        current.set.add(t);
      }
    }
    if (options.existingOnly) {
      current.existingOnly = true;
    }
    merged.set(key, current);
  }

  for (const item of normalized) {
    if (item.chain === "all") {
      if (typeof deps.getAddressTypes === "function") {
        const all = await deps.getAddressTypes();
        const items = Array.isArray(all?.items) ? all.items : [];
        for (const entry of items) {
          mergeChain(entry?.chain, entry?.addressTypes ?? null, { existingOnly: false });
        }
      }
      continue;
    }

    if (item.chain === "default") {
      if (typeof deps.getAddressTypes === "function") {
        const all = await deps.getAddressTypes();
        const items = Array.isArray(all?.items) ? all.items : [];
        for (const entry of items) {
          mergeChain(entry?.chain, null, { existingOnly: true });
        }
      }
      continue;
    }

    if (item.addressTypes === "all") {
      if (typeof deps.getAddressTypes === "function") {
        const single = await deps.getAddressTypes({ chain: item.chain });
        mergeChain(item.chain, single?.addressTypes ?? null, { existingOnly: false });
      } else {
        mergeChain(item.chain, null, { existingOnly: false });
      }
      continue;
    }

    mergeChain(item.chain, item.addressTypes, { existingOnly: item.existingOnly });
  }

  return [...merged.entries()].map(([chain, state]) => ({
    chain,
    addressTypes: state.hasNull ? null : [...state.set],
    existingOnly: state.existingOnly,
  }));
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
        // 规则 匹配
        // chains 如果是 all 则所有链都 生成
        // chains defult 则 只显示 tree 上已有的地址，其他不用
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
  const rowPath = key?.path == null ? null : String(key.path);

  for (const { chain, addressTypes, existingOnly } of requestedChains) {
    const typedAddressTypes = normalizeAddressTypeList(addressTypes);
    const hasTypedMode = typedAddressTypes.length > 0;

    if (!hasTypedMode) {
      const cur = existing[chain];
      const items = Array.isArray(cur) ? cur : cur ? [cur] : [];
      const filtered = items.map((a) => String(a ?? "").trim()).filter(Boolean);

      if (filtered.length > 0) {
        result[chain] = filtered.length === 1 ? filtered[0] : filtered;
        continue;
      }

      if (existingOnly) {
        result[chain] = [];
        continue;
      }

      if (typeof deps.getSigner === "function") {
        try {
          const signer = await deps.getSigner({ chain, keyId: key.keyId });
          if (signer && typeof signer.getAddress === "function") {
            const getAddressOptions = rowPath ? { path: rowPath } : {};
            const addr = await signer.getAddress(getAddressOptions);
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
          for (const addressType of typedAddressTypes) {
            try {
              const getAddressOptions = rowPath
                ? { addressType, path: rowPath }
                : { addressType };
              const addr = await signer.getAddress(getAddressOptions);
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

  const compacted = {};
  for (const [chain, value] of Object.entries(result)) {
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    compacted[chain] = value;
  }

  return compacted;
}

export function createPickWalletOps(deps = {}) {
  async function pickWallet(request = {}, tree = {}) {
    const scope = String(request?.scope ?? "single").trim().toLowerCase() || "single";
    const outputs = request.outputs ?? request.outps ?? {};
    const requestedChains = await resolveRequestedChains(outputs?.chains, deps);
    const treeRows = Array.isArray(tree?.tree) ? tree.tree : [];
    const selectedKeys = queryKeysWithDataEngine(treeRows, request);

    const keysToProcess = scope === "all" ? selectedKeys : selectedKeys.slice(0, 1);

    const results = await Promise.all(
      keysToProcess.map(async (key) => {
        const addresses = await resolveAddressesForKey(key, requestedChains, deps);
        return {
          keyId: key.keyId,
          name: key.name,
          sourceName: key.sourceName ?? null,
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
