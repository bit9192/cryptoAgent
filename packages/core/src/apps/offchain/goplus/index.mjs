import "../../../load-env.mjs";

import { GoPlus, ErrorCode } from "@goplus/sdk-node";
import fs from "node:fs";
import path from "node:path";
import { evmNetworks } from "../../evm/configs/networks.js";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const GOPLUS_CACHE_FILE = path.resolve(process.cwd(), "cache", "goplus-token-security.json");
const GOPLUS_TOKENS_PER_MINUTE = 10;
const GOPLUS_MAX_ADDRESSES_PER_REQUEST = 10;

let _goplusInitialized = false;
let _goplusAccessTokenInitialized = false;
let _goplusTokenWindowStartAt = 0;
let _goplusTokensUsedInWindow = 0;

const CHAIN_ID_BY_NETWORK = Object.freeze({
  eth: 1,
  ethereum: 1,
  bsc: 56,
  base: 8453,
  polygon: 137,
  arbitrum: 42161,
  arb: 42161,
  optimism: 10,
  opt: 10,
  avalanche: 43114,
  avax: 43114,
  fantom: 250,
  cronos: 25,
});

function normalizeNetworkLike(networkInput) {
  const raw = String(networkInput ?? "").trim().toLowerCase();
  if (!raw) {
    throw new Error("network 不能为空");
  }
  return raw;
}

function resolveGoPlusChainId(networkInput) {
  const raw = normalizeNetworkLike(networkInput);
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  if (CHAIN_ID_BY_NETWORK[raw]) {
    return CHAIN_ID_BY_NETWORK[raw];
  }

  const fromConfig = Number(evmNetworks?.[raw]?.chainId ?? 0);
  if (Number.isFinite(fromConfig) && fromConfig > 0) {
    return fromConfig;
  }

  throw new Error(`未识别的 network: ${networkInput}`);
}

function normalizeAddressList(addressesInput) {
  const list = Array.isArray(addressesInput) ? addressesInput : [addressesInput];
  const out = [];

  for (const item of list) {
    const address = String(item ?? "").trim();
    if (!address) continue;
    if (!EVM_ADDRESS_RE.test(address)) {
      throw new Error(`非法 EVM 地址: ${item}`);
    }
    out.push(address.toLowerCase());
  }

  if (out.length === 0) {
    throw new Error("contractAddresses 不能为空");
  }

  return [...new Set(out)];
}

function chunkArray(items, chunkSize) {
  const size = Math.max(1, Number(chunkSize ?? GOPLUS_MAX_ADDRESSES_PER_REQUEST));
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function resolveBatchSize(options = {}) {
  const maxTokensPerMinute = Math.max(1, Number(options.maxTokensPerMinute ?? GOPLUS_TOKENS_PER_MINUTE));
  const upperBound = Math.min(GOPLUS_MAX_ADDRESSES_PER_REQUEST, maxTokensPerMinute);
  const explicit = Number(options.batchSize ?? options.maxAddressesPerRequest ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(upperBound, Math.max(1, Math.floor(explicit)));
  }
  return upperBound;
}

async function waitMs(ms) {
  const timeout = Math.max(0, Number(ms ?? 0));
  if (timeout <= 0) return;
  await new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

async function waitForGoPlusTokenRateLimit(tokenCount, options = {}) {
  const tokensNeeded = Math.max(1, Number(tokenCount ?? 1));
  const maxTokensPerMinute = Math.max(1, Number(options.maxTokensPerMinute ?? GOPLUS_TOKENS_PER_MINUTE));
  const now = Date.now();

  if (_goplusTokenWindowStartAt === 0 || now - _goplusTokenWindowStartAt >= 60_000) {
    _goplusTokenWindowStartAt = now;
    _goplusTokensUsedInWindow = 0;
  }

  if (_goplusTokensUsedInWindow + tokensNeeded > maxTokensPerMinute) {
    const waitMsLeft = Math.max(0, 60_000 - (now - _goplusTokenWindowStartAt));
    if (waitMsLeft > 0) {
      await waitMs(waitMsLeft);
    }
    _goplusTokenWindowStartAt = Date.now();
    _goplusTokensUsedInWindow = 0;
  }

  _goplusTokensUsedInWindow += tokensNeeded;
}

async function initializeGoPlusSDK(options = {}) {
  if (_goplusInitialized) return;

  const apiKey = String(options.apiKey ?? process.env.GOPLUSLABS_API_KEY ?? "").trim();
  const apiSecret = String(options.apiSecret ?? process.env.GOPLUSLABS_API_SECRET ?? "").trim();

  if (!apiKey || !apiSecret) {
    throw new Error("GOPLUSLABS_API_KEY 或 GOPLUSLABS_API_SECRET 未设置");
  }

  GoPlus.config(apiKey, apiSecret);
  _goplusInitialized = true;
}

async function ensureGoPlusAccessToken(options = {}) {
  if (_goplusAccessTokenInitialized) return;

  await initializeGoPlusSDK(options);

  try {
    const res = await GoPlus.getAccessToken();
    if (res.code !== ErrorCode.SUCCESS) {
      throw new Error(`获取 GoPlus 访问令牌失败: ${res.message}`);
    }
    _goplusAccessTokenInitialized = true;
  } catch (error) {
    throw new Error(`GoPlus 令牌初始化失败: ${error.message}`);
  }
}

function toBoolFlag(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function normalizeSecurityItem(address, payload = {}) {
  const found = Boolean(payload && typeof payload === "object" && Object.keys(payload).length > 0);
  if (!found) {
    return {
      address,
      found: false,
      raw: null,
      isHoneypot: null,
      isBlacklisted: null,
      cannotSellAll: null,
      hiddenOwner: null,
      isOpenSource: null,
      isProxy: null,
      isMintable: null,
      buyTax: null,
      sellTax: null,
      riskLevel: "unknown",
    };
  }

  const isHoneypot = toBoolFlag(payload?.is_honeypot);
  const isBlacklisted = toBoolFlag(payload?.is_blacklisted);
  const cannotSellAll = toBoolFlag(payload?.cannot_sell_all);
  const hiddenOwner = toBoolFlag(payload?.hidden_owner);
  const isOpenSource = toBoolFlag(payload?.is_open_source);
  const isProxy = toBoolFlag(payload?.is_proxy);
  // Temporary policy: treat upgradeable/proxy contracts as high risk.
  // Future policy can downgrade when ownership has been renounced and controls are constrained.
  const isHighRisk = !isOpenSource || isHoneypot || isBlacklisted || cannotSellAll || isProxy;

  return {
    address,
    found: true,
    raw: payload,
    isHoneypot,
    isBlacklisted,
    cannotSellAll,
    hiddenOwner,
    isOpenSource,
    isProxy,
    isMintable: toBoolFlag(payload?.is_mintable),
    buyTax: Number(payload?.buy_tax ?? payload?.buy_tax_rate ?? 0) || 0,
    sellTax: Number(payload?.sell_tax ?? payload?.sell_tax_rate ?? 0) || 0,
    riskLevel: isHighRisk ? "high" : (hiddenOwner ? "medium" : "low"),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function loadSecurityCache() {
  try {
    if (!fs.existsSync(GOPLUS_CACHE_FILE)) {
      return { version: 1, records: {} };
    }
    const text = fs.readFileSync(GOPLUS_CACHE_FILE, "utf8");
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, records: {} };
    }
    return {
      version: 1,
      records: parsed.records && typeof parsed.records === "object" ? parsed.records : {},
    };
  } catch {
    return { version: 1, records: {} };
  }
}

function saveSecurityCache(cache) {
  const dir = path.dirname(GOPLUS_CACHE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(GOPLUS_CACHE_FILE, JSON.stringify(cache, null, 2));
}

function getCachedPayload(cache, chainId, address) {
  const chainBucket = cache?.records?.[String(chainId)];
  if (!chainBucket || typeof chainBucket !== "object") return { exists: false, payload: null };
  const entry = chainBucket[address];
  if (!entry || typeof entry !== "object") return { exists: false, payload: null };
  return { exists: true, payload: entry.payload ?? null };
}

function setCachedPayload(cache, chainId, address, payload) {
  const chainKey = String(chainId);
  if (!cache.records[chainKey] || typeof cache.records[chainKey] !== "object") {
    cache.records[chainKey] = {};
  }

  cache.records[chainKey][address] = {
    payload: payload ?? null,
    updatedAt: nowIso(),
  };
}

async function queryGoPlusTokenSecurityApi(chainId, addresses, options = {}) {
  await ensureGoPlusAccessToken(options);

  const batchSize = resolveBatchSize(options);
  const batches = chunkArray(addresses, batchSize);
  const mergedResult = {};
  const diagnostics = { queryMode: "batch-sdk", batchResults: [] };

  for (const batch of batches) {
    await waitForGoPlusTokenRateLimit(batch.length, options);
    try {
      const res = await GoPlus.tokenSecurity(String(chainId), batch, batchSize);

      if (res.code !== ErrorCode.SUCCESS) {
        const message = String(res.message ?? "unknown error");
        diagnostics.batchResults.push({
          batchSize: batch.length,
          responseCount: 0,
          status: "error",
          code: res.code,
          message,
        });
        continue;
      }

      const resultObj = res.result ?? {};
      const responseCount = Object.keys(resultObj).length;
      diagnostics.batchResults.push({
        batchSize: batch.length,
        responseCount,
        status: "ok",
      });
      Object.assign(mergedResult, resultObj);
    } catch (error) {
      diagnostics.batchResults.push({
        batchSize: batch.length,
        responseCount: 0,
        status: "error",
        message: error.message,
      });
    }
  }

  return {
    mergedResult: Object.fromEntries(
      Object.entries(mergedResult).map(([address, payload]) => [String(address).toLowerCase(), payload]),
    ),
    diagnostics,
  };
}

export async function goplusTokenSecurity(networkInput, contractAddressesInput, options = {}) {
  const chainId = resolveGoPlusChainId(networkInput);
  const addresses = normalizeAddressList(contractAddressesInput);
  const forceApi = Boolean(options.remote ?? options.fetchFromApi ?? options.refreshFromApi ?? options.fromApi ?? false);
  const cache = loadSecurityCache();

  const cachedMap = {};
  for (const address of addresses) {
    const cached = getCachedPayload(cache, chainId, address);
    if (cached.exists) {
      cachedMap[address] = cached.payload;
    }
  }

  const missingAddresses = forceApi
    ? [...addresses]
    : addresses.filter((address) => !(address in cachedMap));

  let fetchedMap = {};
  let queryDiagnostics = {};
  if (missingAddresses.length > 0) {
    const queryResult = await queryGoPlusTokenSecurityApi(chainId, missingAddresses, options);
    fetchedMap = queryResult.mergedResult;
    queryDiagnostics = queryResult.diagnostics;
    for (const address of missingAddresses) {
      setCachedPayload(cache, chainId, address, fetchedMap[address] ?? null);
    }
    saveSecurityCache(cache);
  }

  const resultByLowerAddress = {
    ...cachedMap,
    ...fetchedMap,
  };

  const items = addresses.map((address) => {
    const item = normalizeSecurityItem(address, resultByLowerAddress[address] ?? null);
    return {
      ...item,
      cacheHit: !forceApi && address in cachedMap,
    };
  });

  const diagnostics = {
    requestedAddresses: missingAddresses.length,
    respondedAddresses: Object.keys(fetchedMap).length,
    missingResponseCount: missingAddresses.length - Object.keys(fetchedMap).length,
    responseRate: missingAddresses.length > 0 ? Math.round((Object.keys(fetchedMap).length / missingAddresses.length) * 100) : 100,
    queryMode: queryDiagnostics.queryMode ?? "batch-sdk",
    batchResults: queryDiagnostics.batchResults ?? [],
  };

  return {
    ok: true,
    source: "goplus-sdk",
    network: String(networkInput ?? "").trim().toLowerCase(),
    chainId,
    addresses,
    items,
    result: resultByLowerAddress,
    meta: {
      cacheFile: GOPLUS_CACHE_FILE,
      forceApi,
      cacheHitCount: items.filter((x) => x.cacheHit).length,
      fetchedCount: missingAddresses.length,
      rateLimitPerMinute: Math.max(1, Number(options.maxTokensPerMinute ?? GOPLUS_TOKENS_PER_MINUTE)),
      batchSize: resolveBatchSize(options),
      batchCount: chunkArray(missingAddresses, resolveBatchSize(options)).length,
      diagnostics,
    },
    error: null,
  };
}

export async function goplusTokenSecurityOne(networkInput, contractAddressInput, options = {}) {
  const data = await goplusTokenSecurity(networkInput, [contractAddressInput], options);
  return {
    ...data,
    item: data.items[0] ?? null,
  };
}

export function filterHighRiskTokens(items = []) {
  return items.filter((item) => item.riskLevel === "high");
}

export function filterUnknownTokens(items = []) {
  return items.filter((item) => item.riskLevel === "unknown");
}

export function filterSafeTokens(items = []) {
  return items.filter((item) => item.riskLevel === "low");
}

export default {
  goplusTokenSecurity,
  goplusTokenSecurityOne,
  filterHighRiskTokens,
  filterUnknownTokens,
  filterSafeTokens,
};