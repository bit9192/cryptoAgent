export async function checkTokenRiskMarket() {
  return {
    level: "unknown",
    score: null,
    flags: ["market-risk-unavailable"],
  };
}

export default {
  checkTokenRiskMarket,
};