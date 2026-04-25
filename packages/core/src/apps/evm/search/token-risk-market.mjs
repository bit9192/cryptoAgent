function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value ?? "").trim());
}

function toRiskScore(level) {
  if (level === "high") return 85;
  if (level === "medium") return 55;
  if (level === "low") return 20;
  return null;
}

function normalizeRiskLevel(raw) {
  const level = String(raw ?? "").trim().toLowerCase();
  if (["high", "medium", "low"].includes(level)) return level;
  return "unknown";
}

function buildRiskFlags(item = {}) {
  const flags = [];
  if (item.isHoneypot === true) flags.push("honeypot");
  if (item.isBlacklisted === true) flags.push("blacklisted");
  if (item.cannotSellAll === true) flags.push("cannot-sell-all");
  if (item.hiddenOwner === true) flags.push("hidden-owner");
  if (item.isOpenSource === false) flags.push("not-open-source");
  if (item.isProxy === true) flags.push("proxy-contract");
  if (item.isMintable === true) flags.push("mintable");
  return flags;
}

async function resolveGoPlusFetcher(options = {}) {
  if (typeof options.goplusSecurityOne === "function") {
    return options.goplusSecurityOne;
  }

  try {
    const mod = await import("../../offchain/goplus/index.mjs");
    if (typeof mod?.goplusTokenSecurityOne === "function") {
      return mod.goplusTokenSecurityOne;
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkTokenRiskMarket(input = {}, options = {}) {
  const chain = String(input.chain ?? "evm").trim().toLowerCase() || "evm";
  const network = String(input.network ?? "eth").trim().toLowerCase() || "eth";
  const tokenAddress = String(input.tokenAddress ?? "").trim();

  if (chain !== "evm") {
    return {
      level: "unknown",
      score: null,
      flags: ["market-risk-unsupported-chain"],
    };
  }

  if (!isEvmAddress(tokenAddress)) {
    return {
      level: "unknown",
      score: null,
      flags: ["market-risk-invalid-address"],
    };
  }

  const goplusFetcher = await resolveGoPlusFetcher(options);
  if (!goplusFetcher) {
    return {
      level: "unknown",
      score: null,
      flags: ["market-risk-source-not-installed"],
    };
  }
  const forceRemote = Boolean(options.remote ?? options.fetchFromApi ?? options.refreshFromApi ?? options.fromApi ?? false);
  const goplusOptions = {
    ...(options.goplusOptions && typeof options.goplusOptions === "object" ? options.goplusOptions : {}),
    remote: forceRemote,
    fetchFromApi: forceRemote,
  };

  try {
    const data = await goplusFetcher(network, tokenAddress, goplusOptions);
    const item = data?.item ?? null;
    if (!item || item.found === false) {
      return {
        level: "unknown",
        score: null,
        flags: ["market-risk-no-data"],
      };
    }

    const level = normalizeRiskLevel(item.riskLevel);
    const flags = buildRiskFlags(item);

    return {
      level,
      score: toRiskScore(level),
      flags: flags.length > 0 ? flags : ["market-risk-low-signal"],
    };
  } catch {
    return {
      level: "unknown",
      score: null,
      flags: ["market-risk-unavailable"],
    };
  }
}

export default {
  checkTokenRiskMarket,
};