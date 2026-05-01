const SUPPORTED_DOMAINS = new Set(["token", "trade", "contract", "address"]);

export function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fieldName} 必须是非空字符串`);
  }
}

export function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeDomain(domain) {
  const value = normalizeLower(domain || "token") || "token";
  if (!SUPPORTED_DOMAINS.has(value)) {
    throw new TypeError(`不支持的 search domain: ${String(domain ?? "")}`);
  }
  return value;
}

export function normalizeNetworkHint(value) {
  return normalizeLower(value);
}

export function stableStringify(value) {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

export function buildSearchRequestKey(input = {}) {
  const {
    cacheNamespace,
    domain,
    query,
    queryKind,
    chain,
    network,
    limit,
    cursor,
    providerIds,
  } = input;
  const payload = {
    domain,
    query: normalizeLower(query),
    queryKind,
    chain: normalizeLower(chain || "*"),
    network: normalizeLower(network || "*"),
    limit,
    cursor: normalizeLower(cursor || ""),
    providerIds: Array.isArray(providerIds) ? [...providerIds].sort() : [],
  };
  return `${cacheNamespace}:${stableStringify(payload)}`;
}

export function detectQueryKind(input = {}) {
  if (input.kind && input.kind !== "auto") return input.kind;
  const query = String(input.query ?? "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(query)) return "address";
  if (/^[a-zA-Z0-9._-]{2,64}$/.test(query)) return "symbol";
  return "name";
}

export default {
  assertNonEmptyString,
  normalizeLower,
  normalizeDomain,
  normalizeNetworkHint,
  stableStringify,
  buildSearchRequestKey,
  detectQueryKind,
};
