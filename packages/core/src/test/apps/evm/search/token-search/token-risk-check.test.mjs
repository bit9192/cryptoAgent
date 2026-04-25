import test from "node:test";
import assert from "node:assert/strict";

import { tokenRiskCheck } from "../../../../../apps/evm/search/token-provider.mjs";

test("evm token-risk-check: returns normalized risk summary", async () => {
  const res = await tokenRiskCheck({
    chain: "evm",
    network: "eth",
    tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  });

  assert.equal(typeof res, "object");
  assert.equal(["low", "medium", "high", "unknown"].includes(res.riskLevel), true);
  assert.equal(Array.isArray(res.riskFlags), true);
  assert.equal(Array.isArray(res.sources), true);
});

test("evm token-risk-check: throws when tokenAddress is missing or invalid", async () => {
  await assert.rejects(
    async () => await tokenRiskCheck({ chain: "evm", network: "eth" }),
    /tokenAddress/,
  );

  await assert.rejects(
    async () => await tokenRiskCheck({ chain: "evm", network: "eth", tokenAddress: "0x123" }),
    /tokenAddress/,
  );
});

test("evm token-risk-check: source errors are downgraded and non-leaky", async () => {
  const res = await tokenRiskCheck({
    chain: "evm",
    network: "eth",
    tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  }, {
    staticChecker: async () => {
      throw new Error("API_KEY_PLACEHOLDER");
    },
    marketChecker: async () => {
      throw new Error("PRIVATE_KEY_PLACEHOLDER");
    },
  });

  assert.equal(res.riskLevel, "unknown");
  assert.equal(Array.isArray(res.sources), true);
  assert.equal(res.sources.length, 2);
  assert.deepEqual(res.sources.map((x) => x.status), ["error", "error"]);
});