function asArray(value) {
  return Array.isArray(value) ? value : null;
}

function safeText(value) {
  return String(value ?? "").trim();
}

function normalizeSourceType(value) {
  const source = safeText(value).toLowerCase();
  if (!source) return "derive";
  if (source === "file" || source === "orig") return "orig";
  return "derive";
}

function pushChainAddress(addresses, chain, address) {
  const c = safeText(chain).toLowerCase();
  const a = safeText(address);
  if (!c || !a) return;

  if (c === "btc") {
    const list = Array.isArray(addresses.btc) ? addresses.btc : [];
    if (!list.includes(a)) list.push(a);
    addresses.btc = list;
    return;
  }

  const current = addresses[c];
  if (current == null) {
    addresses[c] = a;
    return;
  }
  if (Array.isArray(current)) {
    if (!current.includes(a)) current.push(a);
    return;
  }
  if (current !== a) {
    addresses[c] = [current, a];
  }
}

function countRowAddresses(addresses = {}) {
  let total = 0;
  for (const value of Object.values(addresses)) {
    if (Array.isArray(value)) {
      total += value.length;
      continue;
    }
    if (safeText(value)) total += 1;
  }
  return total;
}

function sortRows(a, b) {
  const byKey = String(a.keyId ?? "").localeCompare(String(b.keyId ?? ""));
  if (byKey !== 0) return byKey;

  const rank = (sourceType) => (String(sourceType ?? "") === "orig" ? 0 : 1);
  const bySource = rank(a.sourceType) - rank(b.sourceType);
  if (bySource !== 0) return bySource;

  const byName = String(a.name ?? "").localeCompare(String(b.name ?? ""));
  if (byName !== 0) return byName;

  return String(a.path ?? "").localeCompare(String(b.path ?? ""));
}

export function buildWalletTree(input = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("wallet tree 输入不能为空");
  }

  const keys = asArray(input.keys);
  const addresses = asArray(input.addresses);
  if (!keys) {
    throw new Error("wallet tree 输入缺少 keys 数组");
  }
  if (!addresses) {
    throw new Error("wallet tree 输入缺少 addresses 数组");
  }

  const warnings = [];
  const keyMetaById = new Map();
  const origRowsByKeyId = new Map();
  const deriveRows = new Map();

  for (const key of keys) {
    const keyId = safeText(key?.keyId);
    if (!keyId) {
      warnings.push("跳过无 keyId 的 key 条目");
      continue;
    }

    const keyName = safeText(key?.keyName) || keyId;
    const keyType = safeText(key?.keyType ?? key?.type) || null;
    keyMetaById.set(keyId, {
      keyName,
      keyType,
    });

    if (!origRowsByKeyId.has(keyId)) {
      origRowsByKeyId.set(keyId, {
        keyId,
        name: keyName,
        keyType,
        sourceType: "orig",
        path: null,
        addresses: {},
      });
    }
  }

  for (const item of addresses) {
    const keyId = safeText(item?.keyId);
    const chain = safeText(item?.chain).toLowerCase();
    const address = safeText(item?.address);
    if (!keyId || !chain || !address) {
      warnings.push("跳过无效地址条目：缺少 keyId/chain/address");
      continue;
    }

    if (!origRowsByKeyId.has(keyId)) {
      const keyMeta = keyMetaById.get(keyId) ?? null;
      origRowsByKeyId.set(keyId, {
        keyId,
        name: String(keyMeta?.keyName ?? keyId),
        keyType: keyMeta?.keyType ?? null,
        sourceType: "orig",
        path: null,
        addresses: {},
      });
    }

    const path = safeText(item?.path) || null;
    const keyMeta = keyMetaById.get(keyId) ?? null;
    const rowName = safeText(item?.name) || String(keyMeta?.keyName ?? keyId);
    const sourceType = normalizeSourceType(item?.sourceType);
    const deriveKey = `${keyId}::${rowName}::${path ?? ""}::${sourceType}`;
    if (!deriveRows.has(deriveKey)) {
      deriveRows.set(deriveKey, {
        keyId,
        name: rowName,
        keyType: sourceType === "derive" ? "private" : (keyMeta?.keyType ?? null),
        sourceType,
        path,
        addresses: {},
      });
    }

    const row = deriveRows.get(deriveKey);
    pushChainAddress(row.addresses, chain, address);
  }

  const tree = [...Array.from(origRowsByKeyId.values()), ...Array.from(deriveRows.values())]
    .sort(sortRows)
    .map((row) => ({
      keyId: row.keyId,
      name: row.name,
      sourceName: row.sourceType === "derive" ? (origRowsByKeyId.get(row.keyId)?.name ?? null) : null,
      keyType: row.keyType,
      sourceType: row.sourceType,
      path: row.path,
      addresses: row.addresses,
    }));

  const allChains = new Set();
  let totalAddresses = 0;
  for (const row of tree) {
    for (const chain of Object.keys(row.addresses ?? {})) {
      allChains.add(chain);
    }
    totalAddresses += countRowAddresses(row.addresses);
  }

  const counts = {
    accounts: origRowsByKeyId.size,
    chains: allChains.size,
    addresses: totalAddresses,
  };

  return {
    ok: true,
    tree,
    counts,
    warnings,
  };
}

export default buildWalletTree;