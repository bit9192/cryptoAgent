import { resolveEvmToken } from "../../apps/evm/configs/tokens.js";
import { resolveBtcToken } from "../../apps/btc/config/tokens.js";

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fieldName} 必须是非空字符串`);
  }
}

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function detectQueryKind(input = {}) {
  if (input.kind && input.kind !== "auto") return input.kind;
  const query = String(input.query ?? "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(query)) return "address";
  if (/^[a-zA-Z0-9._-]{2,64}$/.test(query)) return "symbol";
  return "name";
}

function normalizeCandidate(raw, defaults = {}) {
  if (!raw || typeof raw !== "object") return null;
  const chain = String(raw.chain ?? defaults.chain ?? "").trim();
  const network = String(raw.network ?? defaults.network ?? "").trim();
  const tokenAddress = String(raw.tokenAddress ?? raw.address ?? "").trim();
  if (!chain || !network || !tokenAddress) return null;

  const confidenceNum = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceNum)
    ? Math.max(0, Math.min(1, confidenceNum))
    : 0.5;

  return {
    chain,
    network,
    tokenAddress,
    symbol: raw.symbol == null ? null : String(raw.symbol),
    name: raw.name == null ? null : String(raw.name),
    decimals: raw.decimals == null ? null : Number(raw.decimals),
    source: String(raw.source ?? defaults.source ?? "provider"),
    providerId: String(raw.providerId ?? defaults.providerId ?? "unknown"),
    confidence,
  };
}

function dedupeAndSortCandidates(candidates, query) {
  const dedupMap = new Map();
  const queryLower = normalizeLower(query);

  for (const row of candidates) {
    const key = `${normalizeLower(row.chain)}:${normalizeLower(row.network)}:${normalizeLower(row.tokenAddress)}`;
    const old = dedupMap.get(key);
    if (!old || row.confidence > old.confidence) {
      dedupMap.set(key, row);
    }
  }

  const list = [...dedupMap.values()];
  list.sort((a, b) => {
    const aExact = normalizeLower(a.symbol) === queryLower ? 1 : 0;
    const bExact = normalizeLower(b.symbol) === queryLower ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return normalizeLower(a.tokenAddress).localeCompare(normalizeLower(b.tokenAddress));
  });

  return list;
}

function createDefaultProviders() {
  return [
    {
      id: "btc-config",
      chain: "btc",
      network: "mainnet",
      async search(input) {
        try {
          const token = resolveBtcToken({
            key: input.query,
            network: "mainnet",
          });
          return [{
            chain: "btc",
            network: "mainnet",
            tokenAddress: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            source: "config",
            confidence: 0.95,
          }];
        } catch {
          return [];
        }
      },
    },
    {
      id: "evm-config",
      chain: "evm",
      network: "eth",
      async search(input) {
        try {
          const token = resolveEvmToken({
            key: input.query,
            network: "eth",
          });
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            source: "config",
            confidence: 0.9,
          }];
        } catch {
          return [];
        }
      },
    },
  ];
}

function assertValidProvider(provider, index) {
  if (!provider || typeof provider !== "object") {
    throw new TypeError(`providers[${index}] 必须是对象`);
  }
  assertNonEmptyString(String(provider.id ?? ""), `providers[${index}].id`);
  assertNonEmptyString(String(provider.chain ?? ""), `providers[${index}].chain`);
  assertNonEmptyString(String(provider.network ?? ""), `providers[${index}].network`);
  if (typeof provider.search !== "function") {
    throw new TypeError(`providers[${index}].search 必须是函数`);
  }
}

export function createTokenSearchEngine(options = {}) {
  const providers = Array.isArray(options.providers) && options.providers.length > 0
    ? options.providers
    : createDefaultProviders();

  providers.forEach((provider, index) => assertValidProvider(provider, index));

  async function search(input = {}) {
    assertNonEmptyString(String(input.query ?? ""), "query");
    const queryKind = detectQueryKind(input);
    const limitValue = Number(input.limit ?? 20);
    const limit = Number.isInteger(limitValue) && limitValue > 0 ? limitValue : 20;

    const sourceStats = {
      total: providers.length,
      success: 0,
      failed: 0,
      hit: 0,
      empty: 0,
    };

    const allCandidates = [];

    await Promise.all(providers.map(async (provider) => {
      try {
        const rows = await provider.search({
          query: String(input.query).trim(),
          kind: queryKind,
        });

        sourceStats.success += 1;

        const normalizedRows = (Array.isArray(rows) ? rows : [])
          .map((row) => normalizeCandidate(row, {
            chain: provider.chain,
            network: provider.network,
            source: "provider",
            providerId: provider.id,
          }))
          .filter(Boolean);

        if (normalizedRows.length === 0) {
          sourceStats.empty += 1;
          return;
        }

        sourceStats.hit += 1;
        allCandidates.push(...normalizedRows);
      } catch {
        sourceStats.failed += 1;
      }
    }));

    const candidates = dedupeAndSortCandidates(allCandidates, input.query).slice(0, limit);

    return {
      ok: true,
      query: String(input.query).trim(),
      queryKind,
      candidates,
      sourceStats,
    };
  }

  return {
    search,
  };
}

export default {
  createTokenSearchEngine,
};
