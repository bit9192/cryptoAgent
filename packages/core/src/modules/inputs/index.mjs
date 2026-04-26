const INPUTS_STORE = new Map();

const SENSITIVE_KEYS = new Set(["privateKey", "mnemonic", "password"]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeSessionId(sessionId = "default") {
  const id = String(sessionId ?? "default").trim();
  return id || "default";
}

function normalizeScope(scope) {
  const normalized = String(scope ?? "").trim();
  if (!normalized) {
    throw new Error("inputs scope 不能为空");
  }
  return normalized;
}

function normalizeTtlMs(ttlMs) {
  if (ttlMs == null) return null;
  const value = Number(ttlMs);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("inputs ttlMs 必须是正数");
  }
  return Math.floor(value);
}

function getOrCreateSession(sessionId = "default") {
  const id = normalizeSessionId(sessionId);
  if (!INPUTS_STORE.has(id)) {
    INPUTS_STORE.set(id, {
      sessionId: id,
      scopes: new Map(),
      updatedAt: nowIso(),
    });
  }
  return INPUTS_STORE.get(id);
}

function isExpired(entry) {
  if (!entry?.expiresAtMs) return false;
  return Date.now() >= entry.expiresAtMs;
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const out = {};
  for (const [key, current] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    out[key] = sanitizeValue(current);
  }
  return out;
}

function cleanExpiredScope(session, scope) {
  const entry = session.scopes.get(scope);
  if (!entry) return null;
  if (!isExpired(entry)) return entry;
  session.scopes.delete(scope);
  session.updatedAt = nowIso();
  return null;
}

function snapshotEntry(scope, entry) {
  if (!entry) return null;
  return {
    scope,
    data: sanitizeValue(entry.data),
    updatedAt: entry.updatedAt,
    expiresAt: entry.expiresAtMs ? new Date(entry.expiresAtMs).toISOString() : null,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergePatch(target, patch) {
  const base = isPlainObject(target) ? { ...target } : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete base[key];
      continue;
    }

    if (isPlainObject(value)) {
      const prev = isPlainObject(base[key]) ? base[key] : {};
      base[key] = mergePatch(prev, value);
      continue;
    }

    base[key] = value;
  }

  return base;
}

function pickFields(data, allowFields) {
  if (!Array.isArray(allowFields) || allowFields.length === 0) {
    return data;
  }

  const allow = new Set(
    allowFields
      .map((field) => String(field ?? "").trim())
      .filter(Boolean),
  );

  const out = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!allow.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function clearInputs(sessionId = "default", input = {}) {
  const session = getOrCreateSession(sessionId);
  const scopeRaw = String(input?.scope ?? "").trim();

  if (!scopeRaw) {
    const removed = session.scopes.size;
    session.scopes.clear();
    session.updatedAt = nowIso();
    return { ok: true, removed, scope: null };
  }

  const scope = normalizeScope(scopeRaw);
  const existed = session.scopes.delete(scope);
  session.updatedAt = nowIso();
  return { ok: true, removed: existed ? 1 : 0, scope };
}

export function setInputs(sessionId = "default", input = {}) {
  const session = getOrCreateSession(sessionId);
  const scope = normalizeScope(input?.scope);
  const ttlMs = normalizeTtlMs(input?.ttlMs);
  const data = input?.data ?? {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("inputs data 必须是对象");
  }

  const entry = {
    data: sanitizeValue(data),
    updatedAt: nowIso(),
    expiresAtMs: ttlMs ? Date.now() + ttlMs : null,
  };

  session.scopes.set(scope, entry);
  session.updatedAt = nowIso();
  return {
    ok: true,
    action: "inputs.set",
    item: snapshotEntry(scope, entry),
  };
}

export function patchInputs(sessionId = "default", input = {}) {
  const session = getOrCreateSession(sessionId);
  const scope = normalizeScope(input?.scope);
  const ttlMs = normalizeTtlMs(input?.ttlMs);
  const patch = input?.data ?? {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("inputs data 必须是对象");
  }

  const prev = cleanExpiredScope(session, scope);
  if (!prev) {
    throw new Error(`inputs scope 不存在: ${scope}`);
  }

  const merged = mergePatch(prev.data, patch);
  const next = {
    data: sanitizeValue(merged),
    updatedAt: nowIso(),
    expiresAtMs: ttlMs ? Date.now() + ttlMs : prev.expiresAtMs,
  };

  session.scopes.set(scope, next);
  session.updatedAt = nowIso();
  return {
    ok: true,
    action: "inputs.patch",
    item: snapshotEntry(scope, next),
  };
}

export function showInputs(sessionId = "default", input = {}) {
  const session = getOrCreateSession(sessionId);
  const scopeRaw = String(input?.scope ?? "").trim();
  if (!scopeRaw) {
    const items = [];
    for (const [scope, _entry] of session.scopes.entries()) {
      const current = cleanExpiredScope(session, scope);
      if (!current) continue;
      items.push(snapshotEntry(scope, current));
    }
    items.sort((a, b) => a.scope.localeCompare(b.scope));
    return {
      ok: true,
      action: "inputs.show",
      sessionId: session.sessionId,
      count: items.length,
      items,
      updatedAt: session.updatedAt,
    };
  }

  const scope = normalizeScope(scopeRaw);
  const entry = cleanExpiredScope(session, scope);
  return {
    ok: true,
    action: "inputs.show",
    sessionId: session.sessionId,
    count: entry ? 1 : 0,
    items: entry ? [snapshotEntry(scope, entry)] : [],
    updatedAt: session.updatedAt,
  };
}

export function resolveInputs(sessionId = "default", input = {}) {
  const session = getOrCreateSession(sessionId);
  const scope = normalizeScope(input?.scope);

  const args = isPlainObject(input?.args) ? sanitizeValue(input.args) : {};
  const defaults = isPlainObject(input?.defaults) ? sanitizeValue(input.defaults) : {};

  const entry = cleanExpiredScope(session, scope);
  const scopeData = entry ? sanitizeValue(entry.data) : {};

  const resolved = {
    ...defaults,
    ...scopeData,
    ...args,
  };

  const projected = pickFields(resolved, input?.allowFields);
  return {
    ok: true,
    action: "inputs.resolve",
    scope,
    resolvedArgs: projected,
    snapshot: {
      hasDefaults: Object.keys(defaults).length > 0,
      hasInputs: Object.keys(scopeData).length > 0,
      hasArgs: Object.keys(args).length > 0,
      fields: Object.keys(projected).sort(),
    },
  };
}

export default {
  setInputs,
  patchInputs,
  showInputs,
  resolveInputs,
  clearInputs,
};