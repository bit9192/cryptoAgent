import { resolveEvmTokenProfile } from "../configs/token-profiles.js";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeEvmTokenSearchItems(tokens = [], input = {}) {
  const network = String(input.network ?? "eth").trim() || "eth";
  const limit = Number.isInteger(Number(input.limit)) && Number(input.limit) > 0
    ? Number(input.limit)
    : 20;

  return (Array.isArray(tokens) ? tokens : [])
    .map((token) => {
      const address = String(token?.address ?? "").trim();
      if (!address) return null;
      const symbol = String(token?.symbol ?? "").trim();
      const name = String(token?.name ?? "").trim();
      return {
        domain: "token",
        chain: "evm",
        network,
        id: `token:evm:${normalizeLower(network)}:${normalizeLower(address)}`,
        title: symbol || name || address,
        address,
        tokenAddress: address,
        symbol: symbol || null,
        name: name || null,
        decimals: token?.decimals == null ? null : Number(token.decimals),
        source: "config",
        confidence: 0.9,
        extra: {
          key: token?.key ?? null,
          project: resolveEvmTokenProfile({
            network,
            key: token?.key,
            symbol,
            address,
            tokenAddress: address,
          }),
        },
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

export default {
  normalizeEvmTokenSearchItems,
};