import { createDefaultSearchEngine } from "../../modules/search-engine/index.mjs";

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
export async function searchTask(input = {}) {
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
    const engine = getEngine();
    const result = await engine.search({ domain, query, network, limit, timeoutMs });
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    return {
      ok: true,
      domain,
      query,
      network,
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

export default { searchTask };
