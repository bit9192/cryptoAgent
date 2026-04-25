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
  assert.equal(res.sources.length, 3);
  assert.equal(typeof res.sources[0].updatedAt, "string");
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
  assert.equal(res.sources.length, 3);
  assert.deepEqual(res.sources.map((x) => x.status), ["error", "error", "skipped"]);
  assert.equal(res.sources[2].reason, "checker-not-configured");
});

test("evm token-risk-check: market checker can consume goplus adapter", async () => {
  const res = await tokenRiskCheck({
    chain: "evm",
    network: "eth",
    tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  }, {
    staticChecker: async () => ({ level: "low", score: 20, flags: [] }),
    marketOptions: {
      goplusSecurityOne: async () => ({
        item: {
          found: true,
          riskLevel: "high",
          isHoneypot: true,
          isBlacklisted: false,
          cannotSellAll: false,
          hiddenOwner: false,
          isOpenSource: true,
          isProxy: false,
          isMintable: false,
        },
      }),
    },
  });

  assert.equal(res.riskLevel, "high");
  assert.equal(Array.isArray(res.riskFlags), true);
  assert.equal(res.riskFlags.includes("honeypot"), true);
});

test("evm token-risk-check: goplus source failure is downgraded", async () => {
  const res = await tokenRiskCheck({
    chain: "evm",
    network: "eth",
    tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  }, {
    staticChecker: async () => ({ level: "unknown", score: null, flags: [] }),
    marketOptions: {
      goplusSecurityOne: async () => {
        throw new Error("GOPLUS_API_KEY_PLACEHOLDER");
      },
    },
  });

  assert.equal(res.riskLevel, "unknown");
  assert.equal(res.riskFlags.includes("market-risk-unavailable"), true);
});

test("evm token-risk-check: contract checker result is fused", async () => {
  const res = await tokenRiskCheck({
    chain: "evm",
    network: "eth",
    tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  }, {
    staticChecker: async () => ({ level: "low", score: 20, flags: [] }),
    marketChecker: async () => ({ level: "low", score: 20, flags: [] }),
    contractChecker: async () => ({ level: "high", score: 90, flags: ["proxy-admin-risk"] }),
  });

  assert.equal(res.riskLevel, "high");
  assert.equal(res.riskFlags.includes("proxy-admin-risk"), true);
  const contractSource = res.sources.find((x) => x.name === "contract");
  assert.equal(contractSource?.status, "ok");
  assert.equal(contractSource?.level, "high");
});

test("evm token-risk-check: supports input.contractRisk when checker is absent", async () => {
  const res = await tokenRiskCheck({
    chain: "evm",
    network: "eth",
    tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    contractRisk: {
      level: "medium",
      score: 60,
      flags: ["contract-risk-from-input"],
    },
  }, {
    staticChecker: async () => ({ level: "low", score: 20, flags: [] }),
    marketChecker: async () => ({ level: "low", score: 20, flags: [] }),
  });

  assert.equal(res.riskLevel, "medium");
  assert.equal(res.riskFlags.includes("contract-risk-from-input"), true);
  const contractSource = res.sources.find((x) => x.name === "contract");
  assert.equal(contractSource?.reason, "input-contract-risk");
});