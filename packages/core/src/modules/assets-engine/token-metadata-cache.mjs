import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_DIR = path.resolve(__dirname, "../../..");

const DEFAULT_CACHE_FILE = path.resolve(CORE_DIR, "storage/assets/token-metadata-cache.json");
const CACHE_FILE = String(process.env.ASSETS_TOKEN_META_CACHE_FILE ?? DEFAULT_CACHE_FILE).trim() || DEFAULT_CACHE_FILE;
const DEFAULT_MAX_AGE_MS = Number(process.env.ASSETS_TOKEN_META_CACHE_TTL_MS ?? 30 * 24 * 60 * 60 * 1000);

let _cache = null;

function nowMs() {
  return Date.now();
}

function normalizeToken(token) {
  return String(token ?? "").trim().toLowerCase();
}

function createEmptyCache() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: {},
  };
}

async function loadCache() {
  if (_cache) return _cache;

  try {
    const text = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      _cache = createEmptyCache();
      return _cache;
    }
    _cache = {
      version: 1,
      updatedAt: String(parsed.updatedAt ?? "").trim() || new Date().toISOString(),
      records: parsed.records && typeof parsed.records === "object" ? parsed.records : {},
    };
    return _cache;
  } catch {
    _cache = createEmptyCache();
    return _cache;
  }
}

async function saveCache(cache) {
  cache.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

function ensureBucket(cache, chain, network) {
  const chainKey = String(chain ?? "").trim().toLowerCase();
  const networkKey = String(network ?? "default").trim().toLowerCase() || "default";
  if (!cache.records[chainKey] || typeof cache.records[chainKey] !== "object") {
    cache.records[chainKey] = {};
  }
  if (!cache.records[chainKey][networkKey] || typeof cache.records[chainKey][networkKey] !== "object") {
    cache.records[chainKey][networkKey] = {};
  }
  return cache.records[chainKey][networkKey];
}

function isFresh(updatedAt, maxAgeMs) {
  const ageLimit = Number.isFinite(Number(maxAgeMs)) && Number(maxAgeMs) >= 0
    ? Number(maxAgeMs)
    : DEFAULT_MAX_AGE_MS;
  const ts = Number(updatedAt ?? 0);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return nowMs() - ts <= ageLimit;
}

function toMetadataRow(tokenAddress, entry) {
  return {
    tokenAddress,
    name: String(entry?.name ?? "").trim() || null,
    symbol: String(entry?.symbol ?? "").trim() || null,
    decimals: Number.isFinite(Number(entry?.decimals)) ? Number(entry.decimals) : null,
  };
}

export async function getCachedTokenMetadataMap(input = {}) {
  const chain = String(input.chain ?? "").trim().toLowerCase();
  const network = String(input.network ?? "default").trim().toLowerCase() || "default";
  const tokens = Array.isArray(input.tokens) ? input.tokens : [];
  const maxAgeMs = input.maxAgeMs;

  if (!chain || tokens.length === 0) {
    return new Map();
  }

  const cache = await loadCache();
  const bucket = cache.records?.[chain]?.[network];
  if (!bucket || typeof bucket !== "object") {
    return new Map();
  }

  const result = new Map();
  for (const token of tokens) {
    const tokenKey = normalizeToken(token);
    if (!tokenKey) continue;
    const entry = bucket[tokenKey];
    if (!entry || typeof entry !== "object") continue;
    if (!isFresh(entry.updatedAt, maxAgeMs)) continue;
    result.set(tokenKey, toMetadataRow(tokenKey, entry));
  }

  return result;
}

export async function putCachedTokenMetadata(input = {}) {
  const chain = String(input.chain ?? "").trim().toLowerCase();
  const network = String(input.network ?? "default").trim().toLowerCase() || "default";
  const items = Array.isArray(input.items) ? input.items : [];

  if (!chain || items.length === 0) return 0;

  const cache = await loadCache();
  const bucket = ensureBucket(cache, chain, network);
  let changed = 0;

  for (const item of items) {
    const tokenAddress = normalizeToken(item?.tokenAddress);
    if (!tokenAddress) continue;
    bucket[tokenAddress] = {
      name: String(item?.name ?? "").trim() || null,
      symbol: String(item?.symbol ?? "").trim() || null,
      decimals: Number.isFinite(Number(item?.decimals)) ? Number(item.decimals) : null,
      updatedAt: nowMs(),
    };
    changed += 1;
  }

  if (changed > 0) {
    await saveCache(cache);
  }

  return changed;
}

export async function findCachedTokenMetadata(input = {}) {
  const chain = String(input.chain ?? "").trim().toLowerCase();
  const network = String(input.network ?? "").trim().toLowerCase();
  const query = String(input.query ?? "").trim().toLowerCase();
  const kind = String(input.kind ?? "auto").trim().toLowerCase();

  if (!query) return null;

  const cache = await loadCache();
  const chainEntries = chain
    ? [[chain, cache.records?.[chain] ?? {}]]
    : Object.entries(cache.records ?? {});

  for (const [chainKey, networkBucket] of chainEntries) {
    if (!networkBucket || typeof networkBucket !== "object") continue;
    const networkEntries = network
      ? [[network, networkBucket[network] ?? {}]]
      : Object.entries(networkBucket);

    for (const [networkKey, tokenBucket] of networkEntries) {
      if (!tokenBucket || typeof tokenBucket !== "object") continue;

      for (const [tokenAddress, entry] of Object.entries(tokenBucket)) {
        if (!isFresh(entry?.updatedAt, input.maxAgeMs)) continue;
        const symbol = String(entry?.symbol ?? "").trim().toLowerCase();
        const name = String(entry?.name ?? "").trim().toLowerCase();

        const matched = kind === "address"
          ? tokenAddress === query
          : kind === "symbol"
            ? symbol === query
            : kind === "name"
              ? name === query
              : tokenAddress === query || symbol === query || name === query;

        if (!matched) continue;

        return {
          chain: chainKey,
          network: networkKey,
          tokenAddress,
          name: String(entry?.name ?? "").trim() || null,
          symbol: String(entry?.symbol ?? "").trim() || null,
          decimals: Number.isFinite(Number(entry?.decimals)) ? Number(entry.decimals) : null,
        };
      }
    }
  }

  return null;
}

export default {
  findCachedTokenMetadata,
  getCachedTokenMetadataMap,
  putCachedTokenMetadata,
};
