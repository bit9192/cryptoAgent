import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_DIR = path.resolve(__dirname, "../../..");

const DEFAULT_CACHE_FILE = path.resolve(CORE_DIR, "storage/assets/token-price-cache.json");
const CACHE_FILE = String(process.env.ASSETS_TOKEN_PRICE_CACHE_FILE ?? DEFAULT_CACHE_FILE).trim() || DEFAULT_CACHE_FILE;
const DEFAULT_MAX_AGE_MS = Number(process.env.ASSETS_TOKEN_PRICE_CACHE_TTL_MS ?? 5 * 60 * 1000);

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
    _cache = {
      version: 1,
      updatedAt: String(parsed?.updatedAt ?? "").trim() || new Date().toISOString(),
      records: parsed?.records && typeof parsed.records === "object" ? parsed.records : {},
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

function toPriceRow(tokenAddress, entry) {
  return {
    tokenAddress,
    priceUsd: Number.isFinite(Number(entry?.priceUsd)) ? Number(entry.priceUsd) : null,
  };
}

export async function getCachedTokenPriceMap(input = {}) {
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
    result.set(tokenKey, toPriceRow(tokenKey, entry));
  }

  return result;
}

export async function putCachedTokenPrice(input = {}) {
  const chain = String(input.chain ?? "").trim().toLowerCase();
  const network = String(input.network ?? "default").trim().toLowerCase() || "default";
  const items = Array.isArray(input.items) ? input.items : [];

  if (!chain || items.length === 0) return 0;

  const cache = await loadCache();
  const bucket = ensureBucket(cache, chain, network);
  let changed = 0;

  for (const item of items) {
    const tokenAddress = normalizeToken(item?.tokenAddress);
    const priceUsd = Number(item?.priceUsd);
    if (!tokenAddress || !Number.isFinite(priceUsd)) continue;
    bucket[tokenAddress] = {
      priceUsd,
      updatedAt: nowMs(),
    };
    changed += 1;
  }

  if (changed > 0) {
    await saveCache(cache);
  }

  return changed;
}

export default {
  getCachedTokenPriceMap,
  putCachedTokenPrice,
};
