import { tokenRiskCheck as evmTokenRiskCheck } from "../evm/search/token-provider.mjs";

function normalizeChain(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeNetwork(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeAddress(value) {
  return String(value ?? "").trim();
}

function notSupportedResult(chain, network, tokenAddress) {
  return {
    ok: true,
    chain,
    network,
    tokenAddress,
    notSupported: true,
    riskLevel: "unknown",
    riskScore: null,
    riskFlags: ["chain-not-supported"],
    sources: [],
  };
}

export async function resolveTokenRisk(input = {}) {
  const chain = normalizeChain(input?.chain);
  const network = normalizeNetwork(input?.network);
  const tokenAddress = normalizeAddress(input?.tokenAddress);

  if (!chain) {
    throw new TypeError("chain is required");
  }
  if (!tokenAddress) {
    throw new TypeError("tokenAddress is required");
  }

  if (chain === "evm") {
    const result = await evmTokenRiskCheck({
      tokenAddress,
      network: network || "eth",
      ...(input?.contractRisk ? { contractRisk: input.contractRisk } : {}),
      ...(input?.tradeSummary ? { tradeSummary: input.tradeSummary } : {}),
    }, {
      autoTradeSummary: input?.autoTradeSummary === true,
    });

    return {
      ok: true,
      chain,
      network: network || "eth",
      tokenAddress,
      notSupported: false,
      riskLevel: result.riskLevel,
      riskScore: result.riskScore,
      riskFlags: result.riskFlags,
      sources: result.sources,
    };
  }

  // BTC, TRX and other chains: not supported yet
  return notSupportedResult(chain, network, tokenAddress);
}

export default { resolveTokenRisk };
