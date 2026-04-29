import { createDefaultSearchEngine } from "../../modules/search-engine/index.mjs";
import { queryTokenPriceLiteBatchByQuery } from "../../apps/offchain/token-price/query-token-price.mjs";
import { queryEvmTokenBalanceBatch } from "../../apps/evm/assets/balance-batch.mjs";
import { queryTrxTokenBalanceBatch } from "../../apps/trx/assets/balance-batch.mjs";
import { brc20BalanceBatchGet } from "../../apps/btc/assets/brc20-balance-batch.mjs";
import { normalizeEvmNetworkName, listEvmNetworksByScope } from "../../apps/evm/configs/networks.js";
import { normalizeBtcNetworkName, listBtcNetworksByScope } from "../../apps/btc/config/networks.js";
import { normalizeTrxNetworkName, listTrxNetworksByScope } from "../../apps/trx/config/networks.js";
import { runAddressPipeline } from "./pipelines/address/index.mjs";
import { buildAssetValuationInput } from "./pipelines/valuation/index.mjs";
import { createPortfolioSummaryState, addAddressAssetsToSummary } from "./pipelines/portfolio/summary.mjs";
import { extractPortfolioRiskFlags } from "./pipelines/portfolio/risk.mjs";

const VALID_DOMAINS = ["token", "trade", "address"];

// 进程内单例，首次调用后缓存，避免重复装配 provider
let _engine = null;

function getEngine() {
  if (!_engine) {
    _engine = createDefaultSearchEngine();
  }
  return _engine;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function resolveContextItem(context) {
  const items = Array.isArray(context?.items) ? context.items : [];
  return items[0] ?? null;
}

async function searchAddressWithPipeline(engine, input) {
  const query = normalizeString(input?.query);
  const network = normalizeString(input?.network) || null;
  const limit = Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 10;
  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000;

  let contextItem = null;
  if (typeof engine?.resolveAddressContext === "function") {
    try {
      const context = await engine.resolveAddressContext({ query, network });
      contextItem = resolveContextItem(context);
    } catch {
      contextItem = null;
    }
  }

  const pipelineResult = await runAddressPipeline({
    engine,
    chain: contextItem?.chain,
    query,
    network,
    limit,
    timeoutMs,
    contextItem,
  });

  if (pipelineResult) {
    return {
      candidates: Array.isArray(pipelineResult?.candidates) ? pipelineResult.candidates : [],
      network: pipelineResult?.network ?? network,
    };
  }

  const fallback = await engine.search({ domain: "address", query, network, limit, timeoutMs });
  return {
    candidates: Array.isArray(fallback?.candidates) ? fallback.candidates : [],
    network,
  };
}

/**
 * 统一搜索任务入口
 *
 * @param {{
 *   domain: "token" | "trade" | "address",
 *   query: string,
 *   network?: string,
 *   limit?: number,
 *   timeoutMs?: number,
 * }} input
 * @returns {Promise<{ ok: boolean, domain: string, query: string, candidates: object[], error?: string }>}
 */
export async function searchTaskWithEngine(input = {}, engine) {
  const domain = normalizeString(input?.domain);
  const query = normalizeString(input?.query);
  const network = normalizeString(input?.network) || null;
  const limit = Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 10;
  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000;

  if (!VALID_DOMAINS.includes(domain)) {
    return {
      ok: false,
      domain,
      query,
      candidates: [],
      error: `domain 非法，支持: ${VALID_DOMAINS.join(", ")}`,
    };
  }

  if (!query) {
    return {
      ok: false,
      domain,
      query,
      candidates: [],
      error: "query 不能为空",
    };
  }

  try {
    const runtimeEngine = engine ?? getEngine();
    let candidates = [];
    let resolvedNetwork = network;

    if (domain === "address") {
      const addressResult = await searchAddressWithPipeline(runtimeEngine, {
        query,
        network,
        limit,
        timeoutMs,
      });
      candidates = addressResult.candidates;
      resolvedNetwork = addressResult.network;
    } else {
      const result = await runtimeEngine.search({ domain, query, network, limit, timeoutMs });
      candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    }

    return {
      ok: true,
      domain,
      query,
      network: resolvedNetwork,
      candidates,
    };
  } catch (error) {
    return {
      ok: false,
      domain,
      query,
      network,
      candidates: [],
      error: error?.message ?? String(error),
    };
  }
}

export async function searchTask(input = {}) {
  return await searchTaskWithEngine(input, getEngine());
}

export async function searchAddressCheckTaskWithEngine(input = {}, engine) {
  const query = normalizeString(input?.query ?? input?.address);
  const network = normalizeString(input?.network) || null;
  const chain = normalizeString(input?.chain) || null;

  if (!query) {
    return {
      ok: false,
      query,
      network,
      chain,
      items: [],
      candidates: [],
      error: "query 不能为空",
    };
  }

  try {
    const runtimeEngine = engine ?? getEngine();
    const result = await runtimeEngine.resolveAddressContext({
      query,
      network,
      chain,
    });

    const items = Array.isArray(result?.items) ? result.items : [];
    return {
      ok: true,
      query,
      network,
      chain,
      items,
      candidates: items,
    };
  } catch (error) {
    return {
      ok: false,
      query,
      network,
      chain,
      items: [],
      candidates: [],
      error: error?.message ?? String(error),
    };
  }
}

export async function searchAddressCheckTask(input = {}) {
  return await searchAddressCheckTaskWithEngine(input, getEngine());
}

function normalizeBatchChain(value) {
  const raw = normalizeString(value).toLowerCase();
  if (!raw) return "";
  if (raw === "bitcoin") return "btc";
  if (raw === "tron") return "trx";
  if (["eth", "ethereum", "bsc", "evm"].includes(raw)) return "evm";
  return raw;
}

const BATCH_CHAIN_NETWORK_RESOLVERS = Object.freeze({
  evm: Object.freeze({
    aliases: Object.freeze(["evm"]),
    normalizeNetworkName: normalizeEvmNetworkName,
    listNetworksByScope: listEvmNetworksByScope,
  }),
  btc: Object.freeze({
    aliases: Object.freeze(["btc", "bitcoin"]),
    normalizeNetworkName: normalizeBtcNetworkName,
    listNetworksByScope: listBtcNetworksByScope,
  }),
  trx: Object.freeze({
    aliases: Object.freeze(["trx", "tron"]),
    normalizeNetworkName: normalizeTrxNetworkName,
    listNetworksByScope: listTrxNetworksByScope,
  }),
});

function resolveFirstNetworkByScope(chainResolver, scope) {
  const networks = chainResolver.listNetworksByScope(scope);
  if (Array.isArray(networks) && networks.length > 0) {
    return networks[0];
  }
  throw new Error(`scope 未映射到可用网络: ${scope ?? ""}`);
}

function normalizeBatchNetwork(chain, value) {
  const chainResolver = BATCH_CHAIN_NETWORK_RESOLVERS[chain];
  if (!chainResolver) {
    return normalizeString(value).toLowerCase();
  }

  const raw = normalizeString(value).toLowerCase();
  if (!raw || chainResolver.aliases.includes(raw)) {
    return resolveFirstNetworkByScope(chainResolver, "default");
  }

  try {
    return chainResolver.normalizeNetworkName(raw);
  } catch {
    return resolveFirstNetworkByScope(chainResolver, raw);
  }
}

function normalizeBatchPairs(input = {}) {
  const pairs = Array.isArray(input?.pairs) ? input.pairs : [];
  return pairs.map((pair, index) => {
    const chain = normalizeBatchChain(pair?.chain);
    const network = normalizeBatchNetwork(chain, pair?.network);
    const address = normalizeString(pair?.address);
    const token = normalizeString(pair?.token ?? pair?.tokenAddress);

    if (!(chain in BATCH_CHAIN_NETWORK_RESOLVERS)) {
      throw new TypeError(`pairs[${index}].chain 非法`);
    }
    if (!address) {
      throw new TypeError(`pairs[${index}].address 不能为空`);
    }
    if (!token) {
      throw new TypeError(`pairs[${index}].token 不能为空`);
    }

    return {
      index,
      chain,
      network,
      address,
      token,
    };
  });
}

function normalizeBalanceValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

async function runEvmBatchBalance(rows, options = {}) {
  const reader = typeof options?.evmBatchReader === "function"
    ? options.evmBatchReader
    : queryEvmTokenBalanceBatch;
  const payload = rows.map((row) => ({
    address: row.address,
    token: row.token,
  }));
  const res = await reader(payload, { network: rows[0]?.network || "eth" });
  const items = Array.isArray(res?.items) ? res.items : [];
  return rows.map((row, i) => {
    const item = items[i] ?? null;
    return {
      ok: true,
      chain: "evm",
      network: row.network,
      address: row.address,
      token: row.token,
      ownerAddress: item?.ownerAddress ?? row.address,
      tokenAddress: item?.tokenAddress ?? row.token,
      rawBalance: normalizeBalanceValue(item?.balance),
      error: null,
    };
  });
}

async function runTrxBatchBalance(rows, options = {}) {
  const reader = typeof options?.trxBatchReader === "function"
    ? options.trxBatchReader
    : queryTrxTokenBalanceBatch;
  const payload = rows.map((row) => ({
    address: row.address,
    token: row.token,
  }));
  const res = await reader(payload, { network: rows[0]?.network || "mainnet" });
  const items = Array.isArray(res?.items) ? res.items : [];
  return rows.map((row, i) => {
    const item = items[i] ?? null;
    return {
      ok: item?.ok !== false,
      chain: "trx",
      network: row.network,
      address: row.address,
      token: row.token,
      ownerAddress: item?.ownerAddress ?? row.address,
      tokenAddress: item?.tokenAddress ?? row.token,
      rawBalance: normalizeBalanceValue(item?.balance),
      error: item?.ok === false ? (item?.error ?? "unknown") : null,
    };
  });
}

async function runBtcBatchBalance(rows, options = {}) {
  const reader = typeof options?.btcBatchReader === "function"
    ? options.btcBatchReader
    : brc20BalanceBatchGet;
  const payload = rows.map((row) => ({
    address: row.address,
    token: row.token,
  }));
  const res = await reader(payload, rows[0]?.network || "mainnet");
  const items = Array.isArray(res?.items) ? res.items : [];
  return rows.map((row, i) => {
    const item = items[i] ?? null;
    return {
      ok: item?.ok !== false,
      chain: "btc",
      network: row.network,
      address: row.address,
      token: row.token,
      ownerAddress: item?.address ?? row.address,
      tokenAddress: item?.tokenAddress ?? row.token,
      rawBalance: normalizeBalanceValue(item?.balance),
      error: item?.ok === false ? (item?.error ?? "unknown") : null,
    };
  });
}

export async function searchAddressTokenBalancesBatchTaskWithEngine(input = {}, _engine, options = {}) {
  const pairs = normalizeBatchPairs(input);
  if (pairs.length === 0) {
    return {
      ok: false,
      items: [],
      summary: { total: 0, success: 0, failed: 0 },
      error: "pairs 不能为空",
    };
  }

  const grouped = new Map();
  for (const pair of pairs) {
    const key = `${pair.chain}:${pair.network}`;
    const list = grouped.get(key) ?? [];
    list.push(pair);
    grouped.set(key, list);
  }

  const output = new Array(pairs.length);
  for (const [key, rows] of grouped.entries()) {
    const [chain] = key.split(":");
    let results = [];
    if (chain === "evm") {
      results = await runEvmBatchBalance(rows, options);
    } else if (chain === "trx") {
      results = await runTrxBatchBalance(rows, options);
    } else {
      results = await runBtcBatchBalance(rows, options);
    }

    for (let i = 0; i < rows.length; i += 1) {
      const index = rows[i].index;
      output[index] = results[i] ?? {
        ok: false,
        chain: rows[i].chain,
        network: rows[i].network,
        address: rows[i].address,
        token: rows[i].token,
        ownerAddress: rows[i].address,
        tokenAddress: rows[i].token,
        rawBalance: null,
        error: "missing batch row",
      };
    }
  }

  const success = output.filter((item) => item?.ok).length;
  const failed = output.length - success;

  return {
    ok: true,
    items: output,
    summary: {
      total: output.length,
      success,
      failed,
    },
  };
}

export async function searchAddressTokenBalancesBatchTask(input = {}) {
  return await searchAddressTokenBalancesBatchTaskWithEngine(input, getEngine());
}

function normalizeChainFromCandidate(candidate = {}) {
  return normalizeString(candidate?.chain).toLowerCase();
}

function roundValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e8) / 1e8;
}

function sumAssetValuationValue(assets = []) {
  if (!Array.isArray(assets) || assets.length === 0) return 0;
  return roundValue(assets.reduce((sum, asset) => {
    const valueUsd = Number(asset?.extra?.valuation?.valueUsd ?? 0);
    return sum + (Number.isFinite(valueUsd) ? valueUsd : 0);
  }, 0));
}

async function enrichAssetsWithValuation(assets = [], fallbackNetwork = null, options = {}) {
  const inputAssets = Array.isArray(assets) ? assets : [];
  if (inputAssets.length === 0) {
    return {
      assets: [],
      totalValueUsd: 0,
    };
  }

  const rows = [];
  const priceInputs = [];
  const priceInputIndexes = new Map();

  for (let i = 0; i < inputAssets.length; i += 1) {
    const asset = inputAssets[i];
    const chain = normalizeChainFromCandidate(asset);
    const assetNetwork = normalizeString(asset?.network ?? fallbackNetwork);
    const valuationInput = buildAssetValuationInput(chain, asset, assetNetwork);
    const quantity = Number(valuationInput?.quantity ?? 0);
    const priceQuery = normalizeString(valuationInput?.priceQuery);
    const priceNetwork = normalizeString(valuationInput?.priceNetwork);
    const allowPricing = valuationInput?.allowPricing !== false;

    rows.push({ quantity, priceQuery, priceNetwork, chain, allowPricing });
    if (!allowPricing) continue;
    if (!priceQuery || !priceNetwork) continue;

    const key = `${chain}:${priceNetwork}:${priceQuery.toLowerCase()}`;
    if (priceInputIndexes.has(key)) continue;
    priceInputIndexes.set(key, priceInputs.length);
    priceInputs.push({ query: priceQuery, network: priceNetwork, chain });
  }

  let batchItems = [];
  try {
    if (typeof options?.priceBatchQuery === "function") {
      const batch = await options.priceBatchQuery(priceInputs);
      batchItems = Array.isArray(batch?.items) ? batch.items : [];
    } else {
      const batch = await searchTokenPriceBatchTaskWithEngine({ items: priceInputs }, null);
      batchItems = Array.isArray(batch?.items) ? batch.items : [];
    }
  } catch {
    batchItems = [];
  }

  let totalValueUsd = 0;
  const enriched = inputAssets.map((asset, index) => {
    const row = rows[index] ?? {};
    const key = `${row.chain}:${row.priceNetwork}:${String(row.priceQuery ?? "").toLowerCase()}`;
    const batchIndex = priceInputIndexes.get(key);
    const priceRow = batchIndex != null ? batchItems[batchIndex] : null;
    const priceUsd = row.allowPricing === false ? 0 : Number(priceRow?.priceUsd ?? 0);
    const safePrice = Number.isFinite(priceUsd) ? priceUsd : 0;
    const quantity = Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : 0;
    const valueUsd = roundValue(quantity * safePrice);
    totalValueUsd += valueUsd;

    return {
      ...asset,
      extra: {
        ...(asset?.extra && typeof asset.extra === "object" ? asset.extra : {}),
        valuation: {
          quantity,
          priceUsd: safePrice,
          valueUsd,
          priceSource: priceRow?.source ?? null,
        },
      },
    };
  });

  return {
    assets: enriched,
    totalValueUsd: roundValue(totalValueUsd),
  };
}

export async function searchAddressAssetsTaskWithEngine(input = {}, engine, options = {}) {
  const query = normalizeString(input?.query ?? input?.address);
  const network = normalizeString(input?.network) || null;
  const limit = Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 200;
  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000;
  const withPrice = options?._withPrice === true;

  if (!query) {
    return {
      ok: false,
      query,
      network,
      assets: [],
      totalValueUsd: 0,
      error: "query 不能为空",
    };
  }

  const runtimeEngine = engine ?? getEngine();
  const base = await searchTaskWithEngine({
    domain: "address",
    query,
    network,
    limit,
    timeoutMs,
  }, runtimeEngine);

  if (!base.ok) {
    return {
      ok: false,
      query,
      network,
      assets: [],
      totalValueUsd: 0,
      error: base.error,
    };
  }

  const assets = Array.isArray(base.candidates) ? [...base.candidates] : [];
  if (!withPrice || assets.length === 0) {
    return {
      ok: true,
      query,
      network: base.network,
      assets,
      totalValueUsd: 0,
    };
  }
  const valuation = await enrichAssetsWithValuation(assets, base.network, options);

  return {
    ok: true,
    query,
    network: base.network,
    assets: valuation.assets,
    totalValueUsd: valuation.totalValueUsd,
  };
}

export async function searchAddressAssetsTask(input = {}) {
  return await searchAddressAssetsTaskWithEngine(input, getEngine());
}

function normalizeAddressAssetsBatchItems(input = {}) {
  const rows = Array.isArray(input?.items) ? input.items : [];
  return rows.map((item, index) => {
    const query = normalizeString(item?.query ?? item?.address);
    const network = normalizeString(item?.network) || null;
    const limit = Number.isFinite(Number(item?.limit))
      ? Number(item.limit)
      : (Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 200);
    const timeoutMs = Number.isFinite(Number(item?.timeoutMs))
      ? Number(item.timeoutMs)
      : (Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000);

    if (!query) {
      throw new TypeError(`items[${index}].query 不能为空`);
    }

    return {
      index,
      query,
      network,
      limit,
      timeoutMs,
    };
  });
}

export async function searchAddressAssetsBatchTaskWithEngine(input = {}, engine, options = {}) {
  let rows = [];
  try {
    rows = normalizeAddressAssetsBatchItems(input);
  } catch (error) {
    return {
      ok: false,
      items: [],
      summary: { total: 0, success: 0, failed: 0 },
      error: error?.message ?? String(error),
    };
  }

  if (rows.length === 0) {
    return {
      ok: false,
      items: [],
      summary: { total: 0, success: 0, failed: 0 },
      error: "items 不能为空",
    };
  }

  const runtimeEngine = engine ?? getEngine();
  const output = await Promise.all(rows.map(async (row) => {
    try {
      const result = await searchAddressAssetsTaskWithEngine(
        {
          query: row.query,
          ...(row.network ? { network: row.network } : {}),
          limit: row.limit,
          timeoutMs: row.timeoutMs,
        },
        runtimeEngine,
        options,
      );

      return {
        index: row.index,
        ...result,
      };
    } catch (error) {
      return {
        index: row.index,
        ok: false,
        query: row.query,
        network: row.network,
        assets: [],
        totalValueUsd: 0,
        error: error?.message ?? String(error),
      };
    }
  }));

  const items = output
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(({ index, ...rest }) => rest);

  const success = items.filter((item) => item?.ok).length;
  const failed = items.length - success;

  return {
    ok: failed === 0,
    items,
    summary: {
      total: items.length,
      success,
      failed,
    },
  };
}

export async function searchAddressAssetsBatchTask(input = {}, options = {}) {
  return await searchAddressAssetsBatchTaskWithEngine(input, getEngine(), options);
}

export async function searchAddressValuationTaskWithEngine(input = {}, engine, options = {}) {
  return await searchAddressAssetsTaskWithEngine(
    input,
    engine,
    {
      ...(options && typeof options === "object" ? options : {}),
      _withPrice: true,
    },
  );
}

export async function searchAddressValuationTask(input = {}) {
  return await searchAddressValuationTaskWithEngine(input, getEngine());
}

function normalizeAddressItems(input = []) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

export async function searchPortfolioTaskWithEngine(input = {}, engine, options = {}) {
  const addresses = normalizeAddressItems(input?.addresses);
  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000;
  const withPrice = options?._withPrice === true;

  if (addresses.length === 0) {
    return {
      ok: false,
      addresses: [],
      byChain: {},
      totalValueUsd: 0,
      riskFlags: [],
      error: "addresses 不能为空",
    };
  }

  const runtimeEngine = engine ?? getEngine();
  const state = createPortfolioSummaryState();
  const riskFlags = [];
  const rowResults = [];

  for (const address of addresses) {
    const row = await searchAddressAssetsTaskWithEngine(
      {
        query: address,
        timeoutMs,
        withPrice: false,
      },
      runtimeEngine,
      {
        ...(options && typeof options === "object" ? options : {}),
        _withPrice: false,
      },
    );

    rowResults.push({
      address,
      ok: Boolean(row?.ok),
      network: row?.network ?? null,
      assets: Array.isArray(row?.assets) ? row.assets : [],
      error: row?.error ?? null,
      totalValueUsd: 0,
    });
  }

  if (withPrice) {
    const spans = [];
    const mergedAssets = [];

    for (const row of rowResults) {
      const start = mergedAssets.length;
      mergedAssets.push(...row.assets);
      spans.push({ start, end: mergedAssets.length });
    }

    const priced = await enrichAssetsWithValuation(mergedAssets, null, options);
    for (let i = 0; i < rowResults.length; i += 1) {
      const span = spans[i];
      const nextAssets = priced.assets.slice(span.start, span.end);
      rowResults[i].assets = nextAssets;
      rowResults[i].totalValueUsd = sumAssetValuationValue(nextAssets);
    }
  }

  const addressResults = [];
  for (const row of rowResults) {
    const address = row.address;
    const assets = Array.isArray(row?.assets) ? row.assets : [];
    const chain = normalizeChainFromCandidate(assets[0]);
    addAddressAssetsToSummary(state, {
      chain,
      address,
      assets,
    });
    riskFlags.push(...extractPortfolioRiskFlags({ address, assets }));
    addressResults.push({
      address,
      ok: row.ok,
      network: row.network,
      assetsCount: assets.length,
      totalValueUsd: row.totalValueUsd,
      error: row.error,
    });
  }

  return {
    ok: true,
    addresses,
    byChain: state.byChain,
    totalValueUsd: roundValue(state.totalValueUsd),
    riskFlags,
    addressResults,
  };
}

export async function searchPortfolioTask(input = {}) {
  return await searchPortfolioTaskWithEngine(input, getEngine());
}

export async function searchPortfolioValuationTaskWithEngine(input = {}, engine, options = {}) {
  return await searchPortfolioTaskWithEngine(
    input,
    engine,
    {
      ...(options && typeof options === "object" ? options : {}),
      _withPrice: true,
    },
  );
}

export async function searchPortfolioValuationTask(input = {}) {
  return await searchPortfolioValuationTaskWithEngine(input, getEngine());
}

// ─── Token Price Batch ────────────────────────────────────────────────────────

/**
 * 精确 token 价格查询（批量）
 *
 * @param {{ items: Array<{ query: string, network: string, chain: string }> }} input
 *   - 对象格式：`{ query, network, chain }`
 * @returns {Promise<{ ok: boolean, items: object[], error?: string }>}
 */
export async function searchTokenPriceBatchTaskWithEngine(input = {}, _engine) {
  const rawItems = Array.isArray(input?.items) ? input.items : [];
  if (rawItems.length === 0) {
    return { ok: false, items: [], error: "items 不能为空" };
  }

  let normalized;
  try {
    normalized = rawItems.map((item, i) => {
      if (item && typeof item === "object") {
        const query = normalizeString(item.query ?? item.symbol ?? item.name ?? "");
        const network = normalizeString(item.network) || null;
        const chain = normalizeString(item.chain) || null;
        if (!query) throw new TypeError(`items[${i}].query 不能为空`);
        if (!network) throw new TypeError(`items[${i}].network 不能为空`);
        if (!chain) throw new TypeError(`items[${i}].chain 不能为空`);
        return { query, network, chain };
      }
      throw new TypeError(`items[${i}] 格式非法：必须是 { query, network, chain }`);
    });
  } catch (err) {
    return { ok: false, items: [], error: err?.message ?? String(err) };
  }

  try {
    const res = await queryTokenPriceLiteBatchByQuery(normalized);
    return {
      ok: true,
      items: Array.isArray(res?.items) ? res.items : [],
    };
  } catch (error) {
    return {
      ok: false,
      items: [],
      error: error?.message ?? String(error),
    };
  }
}

export async function searchTokenPriceBatchTask(input = {}) {
  return await searchTokenPriceBatchTaskWithEngine(input, getEngine());
}

// ─── Token Fuzzy Search ───────────────────────────────────────────────────────

const DEFAULT_FUZZY_NETWORKS = ["eth", "bsc", "mainnet"];

/**
 * 模糊跨链 token 发现
 *
 * @param {{
 *   query?: string,
 *   queries?: string[],
 *   networks?: string[],
 *   timeoutMs?: number,
 * }} input
 * @returns {Promise<{ ok: boolean, queries: string[], candidates: object[], byChain: Record<string, object[]>, error?: string }>}
 */
export async function searchTokenFuzzyTaskWithEngine(input = {}, engine) {
  const rawQueries = Array.isArray(input?.queries)
    ? input.queries.map((q) => normalizeString(q)).filter(Boolean)
    : (normalizeString(input?.query) ? [normalizeString(input.query)] : []);

  if (rawQueries.length === 0) {
    return { ok: false, queries: [], candidates: [], byChain: {}, error: "query/queries 不能为空" };
  }

  const networks = Array.isArray(input?.networks) && input.networks.length > 0
    ? input.networks.map((n) => normalizeString(n)).filter(Boolean)
    : DEFAULT_FUZZY_NETWORKS;

  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 12000;
  const runtimeEngine = engine ?? getEngine();

  const tasks = [];
  for (const query of rawQueries) {
    for (const network of networks) {
      tasks.push({ query, network });
    }
  }

  const results = await Promise.all(
    tasks.map(({ query, network }) =>
      searchTaskWithEngine({ domain: "token", query, network, timeoutMs }, runtimeEngine)
        .catch(() => ({ ok: false, candidates: [] })),
    ),
  );

  const allCandidates = [];
  const dedup = new Set();
  for (const res of results) {
    if (!res?.ok) continue;
    for (const candidate of Array.isArray(res.candidates) ? res.candidates : []) {
      const chain = normalizeString(candidate?.chain).toLowerCase();
      const addr = normalizeString(candidate?.tokenAddress ?? candidate?.address).toLowerCase();
      const key = `${chain}:${addr}`;
      if (!addr || dedup.has(key)) continue;
      dedup.add(key);
      allCandidates.push(candidate);
    }
  }

  const byChain = {};
  for (const candidate of allCandidates) {
    const chain = normalizeString(candidate?.chain).toLowerCase() || "unknown";
    if (!byChain[chain]) byChain[chain] = [];
    byChain[chain].push(candidate);
  }

  return {
    ok: true,
    queries: rawQueries,
    candidates: allCandidates,
    byChain,
  };
}

export async function searchTokenFuzzyTask(input = {}) {
  return await searchTokenFuzzyTaskWithEngine(input, getEngine());
}

export default {
  searchTask,
  searchTaskWithEngine,
  searchAddressCheckTask,
  searchAddressCheckTaskWithEngine,
  searchAddressTokenBalancesBatchTask,
  searchAddressTokenBalancesBatchTaskWithEngine,
  searchAddressAssetsTask,
  searchAddressAssetsTaskWithEngine,
  searchAddressAssetsBatchTask,
  searchAddressAssetsBatchTaskWithEngine,
  searchAddressValuationTask,
  searchAddressValuationTaskWithEngine,
  searchPortfolioTask,
  searchPortfolioTaskWithEngine,
  searchPortfolioValuationTask,
  searchPortfolioValuationTaskWithEngine,
};
