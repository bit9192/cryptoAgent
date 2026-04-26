import { createDefaultSearchEngine } from "../../modules/search-engine/index.mjs";
import { queryTokenPriceLiteBatchByQuery } from "../../apps/offchain/token-price/query-token-price.mjs";
import { runAddressPipeline } from "./pipelines/address/index.mjs";
import { buildAssetValuationInput } from "./pipelines/valuation/index.mjs";

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

function normalizeChainFromCandidate(candidate = {}) {
  return normalizeString(candidate?.chain).toLowerCase();
}

function roundValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e8) / 1e8;
}

export async function searchAddressAssetsTaskWithEngine(input = {}, engine, options = {}) {
  const query = normalizeString(input?.query ?? input?.address);
  const network = normalizeString(input?.network) || null;
  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000;
  const withPrice = input?.withPrice !== false;

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

  const rows = [];
  const priceInputs = [];
  const priceInputIndexes = new Map();
  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    const chain = normalizeChainFromCandidate(asset);
    const valuationInput = buildAssetValuationInput(chain, asset, base.network);
    const quantity = Number(valuationInput?.quantity ?? 0);
    const priceQuery = normalizeString(valuationInput?.priceQuery);
    const priceNetwork = normalizeString(valuationInput?.priceNetwork);

    rows.push({ quantity, priceQuery, priceNetwork, chain });
    if (!priceQuery || !priceNetwork) continue;

    const key = `${chain}:${priceNetwork}:${priceQuery.toLowerCase()}`;
    if (priceInputIndexes.has(key)) continue;
    priceInputIndexes.set(key, priceInputs.length);
    priceInputs.push({ query: priceQuery, network: priceNetwork, chain });
  }

  let batchItems = [];
  try {
    const priceBatchFn = typeof options?.priceBatchQuery === "function"
      ? options.priceBatchQuery
      : queryTokenPriceLiteBatchByQuery;
    const batch = await priceBatchFn(priceInputs);
    batchItems = Array.isArray(batch?.items) ? batch.items : [];
  } catch {
    batchItems = [];
  }

  let totalValueUsd = 0;
  const enriched = assets.map((asset, index) => {
    const row = rows[index] ?? {};
    const key = `${row.chain}:${row.priceNetwork}:${String(row.priceQuery ?? "").toLowerCase()}`;
    const batchIndex = priceInputIndexes.get(key);
    const priceRow = batchIndex != null ? batchItems[batchIndex] : null;
    const priceUsd = Number(priceRow?.priceUsd ?? 0);
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
    ok: true,
    query,
    network: base.network,
    assets: enriched,
    totalValueUsd: roundValue(totalValueUsd),
  };
}

export async function searchAddressAssetsTask(input = {}) {
  return await searchAddressAssetsTaskWithEngine(input, getEngine());
}

export default {
  searchTask,
  searchTaskWithEngine,
  searchAddressAssetsTask,
  searchAddressAssetsTaskWithEngine,
};
