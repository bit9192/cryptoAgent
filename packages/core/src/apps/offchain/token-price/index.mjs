import { detectAddressKind } from "../address-validators.mjs";
import { resolveEvmToken } from "../../evm/configs/tokens.js";
import { resolveBtcToken } from "../../btc/config/tokens.js";
import { resolveTrxToken } from "../../trx/config/tokens.js";
import {
  getCachedTokenMetadataMap,
  putCachedTokenMetadata,
  findCachedTokenMetadata,
} from "../../../modules/assets-engine/token-metadata-cache.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeItems(input) {
  const list = Array.isArray(input) ? input : [input];
  return list.map((item) => {
    if (typeof item === "string") {
      const query = normalizeString(item);
      if (!query) {
        throw new Error("query 不能为空");
      }
      return { query, network: null, kind: "auto" };
    }
    if (!item || typeof item !== "object") {
      throw new Error("query item 必须是字符串或对象");
    }
    const query = normalizeString(item.query ?? item.address ?? item.symbol ?? item.name ?? item.key);
    if (!query) {
      throw new Error("query 不能为空");
    }
    const network = normalizeString(item.network) || null;
    const kind = normalizeLower(item.kind || "auto") || "auto";
    return { query, network, kind };
  });
}

function inferQueryKind(item) {
  if (item.kind && item.kind !== "auto") return item.kind;
  return detectAddressKind(item.query) ? "address" : "symbol";
}

function normalizeResolvedRow(row = {}, fallback = {}) {
  return {
    chain: row.chain ?? fallback.chain ?? null,
    network: row.network ?? fallback.network ?? null,
    tokenAddress: normalizeString(row.tokenAddress ?? row.address),
    symbol: normalizeString(row.symbol).toUpperCase() || null,
    name: normalizeString(row.name) || null,
    decimals: Number.isFinite(Number(row.decimals)) ? Number(row.decimals) : null,
  };
}

function resolveConfigCandidates(item) {
  const query = item.query;
  const network = item.network;
  const kind = inferQueryKind(item);
  const candidates = [];

  const pushRow = (row) => {
    if (!row?.tokenAddress) return;
    const key = `${row.chain}:${row.network ?? "default"}:${normalizeLower(row.tokenAddress)}`;
    if (!candidates.some((existing) => `${existing.chain}:${existing.network ?? "default"}:${normalizeLower(existing.tokenAddress)}` === key)) {
      candidates.push(row);
    }
  };

  const maybeResolve = (chain, resolver, resolverInput) => {
    try {
      const resolved = resolver(resolverInput);
      pushRow(normalizeResolvedRow(resolved, { chain, network }));
    } catch {
      // ignore
    }
  };

  if (kind === "address") {
    const detected = detectAddressKind(query);
    if (detected === "evm") maybeResolve("evm", resolveEvmToken, { network, address: query });
    if (detected === "btc") maybeResolve("btc", resolveBtcToken, { network, address: query });
    if (detected === "trx") maybeResolve("trx", resolveTrxToken, { network, address: query });
    return candidates;
  }

  maybeResolve("evm", resolveEvmToken, { network, key: query });
  maybeResolve("btc", resolveBtcToken, { network, key: query });
  maybeResolve("trx", resolveTrxToken, { network, key: query });
  return candidates;
}

function buildCacheApi(options = {}) {
  const custom = options.cache ?? {};
  return {
    async getMap(input) {
      return typeof custom.getMap === "function"
        ? await custom.getMap(input)
        : await getCachedTokenMetadataMap(input);
    },
    async put(input) {
      return typeof custom.put === "function"
        ? await custom.put(input)
        : await putCachedTokenMetadata(input);
    },
    async find(input) {
      return typeof custom.find === "function"
        ? await custom.find(input)
        : await findCachedTokenMetadata(input);
    },
  };
}

async function resolveFromCache(item, cacheApi) {
  const kind = inferQueryKind(item);
  const chain = kind === "address" ? detectAddressKind(item.query) : null;

  if (kind === "address" && chain) {
    const map = await cacheApi.getMap({
      chain,
      network: item.network ?? "default",
      tokens: [item.query],
    });
    const found = map.get(normalizeLower(item.query));
    return found ? { ...normalizeResolvedRow(found, { chain, network: item.network }), source: "cache" } : null;
  }

  const found = await cacheApi.find({
    chain,
    network: item.network,
    query: item.query,
    kind,
  });
  return found ? { ...normalizeResolvedRow(found, found), source: "cache" } : null;
}

async function resolveFromRemote(item, options, cacheApi) {
  if (typeof options.remoteResolver !== "function") return null;
  const resolved = await options.remoteResolver(item);
  if (!resolved || typeof resolved !== "object") return null;
  const normalized = normalizeResolvedRow(resolved, {
    chain: resolved.chain ?? detectAddressKind(resolved.tokenAddress ?? item.query),
    network: resolved.network ?? item.network,
  });
  if (!normalized.tokenAddress) return null;
  await cacheApi.put({
    chain: normalized.chain,
    network: normalized.network ?? "default",
    items: [normalized],
  });
  return { ...normalized, source: "remote" };
}

export async function queryTokenMetaBatch(input = [], options = {}) {
  const items = normalizeItems(input);
  const cacheApi = buildCacheApi(options);
  const results = [];

  for (const item of items) {
    const queryKind = inferQueryKind(item);
    const configCandidates = resolveConfigCandidates(item);
    if (configCandidates.length > 0) {
      const chosen = configCandidates[0];
      results.push({
        ok: true,
        query: item.query,
        queryKind,
        ...chosen,
        source: "config",
      });
      continue;
    }

    const cached = await resolveFromCache(item, cacheApi);
    if (cached) {
      results.push({
        ok: true,
        query: item.query,
        queryKind,
        ...cached,
      });
      continue;
    }

    const remote = await resolveFromRemote(item, options, cacheApi);
    if (remote) {
      results.push({
        ok: true,
        query: item.query,
        queryKind,
        ...remote,
      });
      continue;
    }

    results.push({
      ok: false,
      query: item.query,
      queryKind,
      chain: null,
      network: item.network,
      tokenAddress: null,
      symbol: null,
      name: null,
      decimals: null,
      source: "unresolved",
      error: `未解析 token: ${item.query}`,
    });
  }

  return {
    ok: true,
    items: results,
  };
}

export async function queryTokenMeta(input, options = {}) {
  const result = await queryTokenMetaBatch([input], options);
  return result.items[0] ?? null;
}

export default {
  queryTokenMeta,
  queryTokenMetaBatch,
};