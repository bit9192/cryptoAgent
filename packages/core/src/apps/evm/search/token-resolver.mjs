import { getEvmTokenBook } from "../configs/tokens.js";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveEvmTokenCandidates(input = {}) {
  const query = String(input.query ?? "").trim();
  if (!query) return [];

  const queryLower = normalizeLower(query);
  const queryKind = String(input.queryKind ?? "symbol").trim();
  const network = String(input.network ?? "eth").trim() || "eth";
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
    return symbol === queryLower || key === queryLower;
  });
}

export default {
  resolveEvmTokenCandidates,
};