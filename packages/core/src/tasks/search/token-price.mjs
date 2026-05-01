import { queryTokenPriceLiteBatchByQuery } from "../../apps/offchain/token-price/query-token-price.mjs";
import { getSearchEngineSingleton, normalizeString } from "./runtime.mjs";

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
  return await searchTokenPriceBatchTaskWithEngine(input, getSearchEngineSingleton());
}

export default {
  searchTokenPriceBatchTask,
  searchTokenPriceBatchTaskWithEngine,
};
