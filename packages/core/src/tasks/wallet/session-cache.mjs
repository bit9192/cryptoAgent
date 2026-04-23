function nowIso() {
  return new Date().toISOString();
}

function normalizeAddress(chain, address) {
  const c = String(chain ?? "").trim().toLowerCase();
  const a = String(address ?? "").trim();
  if (!a) return "";
  if (c === "evm") return a.toLowerCase();
  return a;
}

function addressKeyOf(item) {
  const chain = String(item.chain ?? "").trim().toLowerCase();
  const address = normalizeAddress(chain, item.address);
  return `${chain}:${address}`;
}

function createEmptySession(sessionId) {
  return {
    sessionId,
    keys: new Map(),
    addresses: new Map(),
    indexes: {
      byName: new Map(),
      byAddress: new Map(),
      byKey: new Map(),
    },
    stats: {
      keyUpserts: 0,
      addressUpserts: 0,
      addressRemovals: 0,
    },
    updatedAt: nowIso(),
  };
}

const SESSION_STORE = new Map();

export function getSession(sessionId = "default") {
  const id = String(sessionId || "default").trim() || "default";
  if (!SESSION_STORE.has(id)) {
    SESSION_STORE.set(id, createEmptySession(id));
  }
  return SESSION_STORE.get(id);
}

export function clearSession(sessionId = "default") {
  const id = String(sessionId || "default").trim() || "default";
  SESSION_STORE.set(id, createEmptySession(id));
  return getSession(id);
}

function pushIndexList(map, key, value) {
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.includes(value)) list.push(value);
  map.set(key, list);
}

function removeIndexValue(map, key, value) {
  if (!map.has(key)) return;
  const next = (map.get(key) ?? []).filter((x) => x !== value);
  if (next.length === 0) {
    map.delete(key);
    return;
  }
  map.set(key, next);
}

export function upsertKey(session, keyMeta) {
  const keyId = String(keyMeta?.keyId ?? "").trim();
  if (!keyId) throw new Error("keyId 不能为空");

  const prev = session.keys.get(keyId) ?? null;
  const next = {
    keyId,
    keyName: String(keyMeta?.keyName ?? "").trim() || keyId,
    source: String(keyMeta?.source ?? "").trim() || "file",
    sourceFile: String(keyMeta?.sourceFile ?? "").trim() || null,
    status: String(keyMeta?.status ?? "unlocked").trim() || "unlocked",
    updatedAt: nowIso(),
  };

  session.keys.set(keyId, next);
  session.updatedAt = nowIso();
  session.stats.keyUpserts += 1;
  return { prev, next };
}

export function upsertAddress(session, addressMeta) {
  const keyId = String(addressMeta?.keyId ?? "").trim();
  const chain = String(addressMeta?.chain ?? "").trim().toLowerCase();
  const address = String(addressMeta?.address ?? "").trim();
  if (!keyId || !chain || !address) {
    throw new Error("addressMeta 缺少 keyId/chain/address");
  }

  const path = String(addressMeta?.path ?? "").trim() || null;
  const name = String(addressMeta?.name ?? "").trim() || null;
  const addressType = String(addressMeta?.addressType ?? "").trim() || null;
  const normalized = normalizeAddress(chain, address);
  const addressId = `${keyId}:${chain}:${normalized}:${path ?? "-"}:${name ?? "-"}`;

  const prev = session.addresses.get(addressId) ?? null;
  const next = {
    addressId,
    keyId,
    chain,
    address,
    addressNormalized: normalized,
    path,
    name,
    addressType,
    sourceType: String(addressMeta?.sourceType ?? "configured").trim() || "configured",
    updatedAt: nowIso(),
  };

  session.addresses.set(addressId, next);
  session.indexes.byAddress.set(addressKeyOf(next), addressId);
  if (name) pushIndexList(session.indexes.byName, name.toLowerCase(), addressId);
  pushIndexList(session.indexes.byKey, keyId, addressId);

  session.updatedAt = nowIso();
  session.stats.addressUpserts += 1;
  return { prev, next };
}

export function removeAddress(session, selector = {}) {
  const toDelete = [];
  const keyId = String(selector.keyId ?? "").trim();
  const name = String(selector.name ?? "").trim().toLowerCase();
  const address = String(selector.address ?? "").trim();
  const chain = String(selector.chain ?? "").trim().toLowerCase();

  for (const item of session.addresses.values()) {
    const byKey = !keyId || item.keyId === keyId;
    const byName = !name || String(item.name ?? "").toLowerCase() === name;
    const byAddress = !address || item.addressNormalized === normalizeAddress(chain || item.chain, address);
    const byChain = !chain || item.chain === chain;
    if (byKey && byName && byAddress && byChain) {
      toDelete.push(item);
    }
  }

  for (const item of toDelete) {
    session.addresses.delete(item.addressId);
    session.indexes.byAddress.delete(addressKeyOf(item));
    if (item.name) removeIndexValue(session.indexes.byName, item.name.toLowerCase(), item.addressId);
    removeIndexValue(session.indexes.byKey, item.keyId, item.addressId);
    session.stats.addressRemovals += 1;
  }

  session.updatedAt = nowIso();
  return { removed: toDelete.length };
}

export function snapshotSession(session) {
  return {
    sessionId: session.sessionId,
    keys: Array.from(session.keys.values()),
    addresses: Array.from(session.addresses.values()),
    stats: { ...session.stats },
    counts: {
      keys: session.keys.size,
      addresses: session.addresses.size,
    },
    updatedAt: session.updatedAt,
  };
}
