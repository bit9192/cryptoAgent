function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value ?? "").trim());
}

export function detectTokenQueryKind(query, kind = "auto") {
  const normalizedKind = normalizeLower(kind || "auto") || "auto";
  if (!["auto", "symbol", "name", "address"].includes(normalizedKind)) {
    throw new TypeError(`不支持的 token query kind: ${String(kind ?? "")}`);
  }

  if (normalizedKind !== "auto") {
    return normalizedKind;
  }

  const raw = String(query ?? "").trim();
  if (isEvmAddress(raw)) return "address";
  if (/^[a-zA-Z0-9._-]{2,64}$/.test(raw)) return "symbol";
  return "name";
}

export function parseTokenSearchInput(input = {}) {
  const query = String(input.query ?? "").trim();
  if (!query) {
    throw new TypeError("query 必须是非空字符串");
  }

  const queryKind = detectTokenQueryKind(query, input.kind);
  const network = String(input.network ?? "eth").trim() || "eth";
  const rawLimit = Number(input.limit ?? 20);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 20;

  return {
    query,
    queryLower: normalizeLower(query),
    queryKind,
    network,
    limit,
    metadata: input.metadata ?? null,
  };
}

export default {
  detectTokenQueryKind,
  parseTokenSearchInput,
};