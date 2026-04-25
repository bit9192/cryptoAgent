function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value ?? "").trim());
}

const TEMP_HIGH_RISK_ADDRESSES = new Set([
  // Temporary policy: treat known upgradeable token as high risk until owner-renounce checks are wired in.
  "0x99e01f02d66455bb106d91d469c9eaf6ab4904f6",
]);

export async function checkTokenRiskStatic(input = {}) {
  const tokenAddress = String(input.tokenAddress ?? "").trim();
  if (!isEvmAddress(tokenAddress)) {
    return {
      level: "unknown",
      score: null,
      flags: ["invalid-address"],
    };
  }

  if (TEMP_HIGH_RISK_ADDRESSES.has(tokenAddress.toLowerCase())) {
    return {
      level: "high",
      score: 85,
      flags: ["temporary-upgradeable-contract"],
    };
  }

  return {
    level: "low",
    score: 20,
    flags: [],
  };
}

export default {
  checkTokenRiskStatic,
};