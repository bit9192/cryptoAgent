import { getEvmTokenBook } from "../configs/tokens.js";

const SYMBOL_ALIASES_BY_NETWORK = Object.freeze({
  bsc: Object.freeze({
    bnb: "wbnb",
  }),
});

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveEvmTokenCandidates(input = {}) {
  const query = String(input.query ?? "").trim();
  if (!query) return [];

  const queryLower = normalizeLower(query);
  const queryKind = String(input.queryKind ?? "symbol").trim();
  const network = String(input.network ?? "eth").trim() || "eth";
  const aliasMap = SYMBOL_ALIASES_BY_NETWORK[normalizeLower(network)] ?? null;
  const aliasLower = aliasMap ? normalizeLower(aliasMap[queryLower]) : "";
  const { tokens } = getEvmTokenBook({ network });
  const entries = Object.values(tokens);

  if (queryKind === "address") {
    return entries.filter((token) => normalizeLower(token.address) === queryLower);
  }

  if (queryKind === "name") {
    return entries.filter((token) => normalizeLower(token.name) === queryLower);
  }

  return entries.filter((token) => {
    const symbol = normalizeLower(token.symbol);
    const key = normalizeLower(token.key);
    return symbol === queryLower || key === queryLower || (aliasLower && (symbol === aliasLower || key === aliasLower));
  });
}

export default {
  resolveEvmTokenCandidates,
};