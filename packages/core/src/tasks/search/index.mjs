import { createDefaultSearchEngine } from "../../modules/search-engine/index.mjs";
import { runAddressPipeline } from "./pipelines/address/index.mjs";

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

export default { searchTask, searchTaskWithEngine };
