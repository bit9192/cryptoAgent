function normalizeBtcNetwork(value, fallback = "mainnet") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["btc", "bitcoin", "main", "mainnet"].includes(raw)) return "mainnet";
  if (["test", "testnet"].includes(raw)) return "testnet";
  if (["sig", "signet"].includes(raw)) return "signet";
  if (["reg", "regtest"].includes(raw)) return "regtest";
  return raw;
}

export async function runBtcAddressPipeline(input = {}) {
  const engine = input?.engine;
  const query = String(input?.query ?? "").trim();
  const network = normalizeBtcNetwork(
    input?.network,
    normalizeBtcNetwork(input?.config?.defaultNetwork, "mainnet"),
  );
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
  runBtcAddressPipeline,
};
