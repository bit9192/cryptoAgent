export async function runTrxAddressPipeline(input = {}) {
  const engine = input?.engine;
  const query = String(input?.query ?? "").trim();
  const network = String(input?.network ?? input?.config?.defaultNetwork ?? "mainnet").trim().toLowerCase() || "mainnet";
  const limit = Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 10;
  const timeoutMs = Number.isFinite(Number(input?.timeoutMs)) ? Number(input.timeoutMs) : 10000;

  if (!engine || typeof engine.search !== "function" || !query) {
    return null;
  }

  const result = await engine.search({ domain: "address", query, network, limit, timeoutMs });
  return {
    ok: true,
    network,
    attempts: [{ network, count: Array.isArray(result?.candidates) ? result.candidates.length : 0 }],
    candidates: Array.isArray(result?.candidates) ? result.candidates : [],
  };
}

export default {
  runTrxAddressPipeline,
};
