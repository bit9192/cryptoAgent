function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value ?? "").trim());
}

export async function checkTokenRiskStatic(input = {}) {
  const tokenAddress = String(input.tokenAddress ?? "").trim();
  if (!isEvmAddress(tokenAddress)) {
    return {
      level: "unknown",
      score: null,
      flags: ["invalid-address"],
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