import test from "node:test";
import assert from "node:assert/strict";

import { resolveTokenRisk } from "../../../apps/search/token-risk.mjs";
import { createSearchEngine } from "../../../apps/search/engine.mjs";

// ── happy: EVM USDT on ETH mainnet ─────────────────────────────────────────
test("engine.token.risk: EVM happy - USDT eth returns riskLevel", async () => {
  const result = await resolveTokenRisk({
    chain: "evm",
    network: "eth",
    tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.chain, "evm");
  assert.strictEqual(result.network, "eth");
  assert.strictEqual(result.tokenAddress, "0xdac17f958d2ee523a2206206994597c13d831ec7");
  assert.strictEqual(result.notSupported, false);
  assert.ok(["low", "medium", "high", "unknown"].includes(result.riskLevel), `unexpected riskLevel: ${result.riskLevel}`);
  assert.ok(Array.isArray(result.riskFlags), "riskFlags should be array");
  assert.ok(Array.isArray(result.sources), "sources should be array");
});

// ── happy: EVM USDT on BSC mainnet ─────────────────────────────────────────
test("engine.token.risk: EVM happy - USDT bsc returns riskLevel", async () => {
  const result = await resolveTokenRisk({
    chain: "evm",
    network: "bsc",
    tokenAddress: "0x55d398326f99059ff775485246999027b3197955",
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.notSupported, false);
  assert.ok(["low", "medium", "high", "unknown"].includes(result.riskLevel));
});

// ── edge: BTC chain → notSupported ─────────────────────────────────────────
test("engine.token.risk: BTC → notSupported", async () => {
  const result = await resolveTokenRisk({
    chain: "btc",
    network: "mainnet",
    tokenAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.notSupported, true);
  assert.strictEqual(result.riskLevel, "unknown");
  assert.ok(result.riskFlags.includes("chain-not-supported"));
});

// ── edge: TRX chain → notSupported ─────────────────────────────────────────
test("engine.token.risk: TRX → notSupported", async () => {
  const result = await resolveTokenRisk({
    chain: "trx",
    network: "mainnet",
    tokenAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.notSupported, true);
  assert.ok(result.riskFlags.includes("chain-not-supported"));
});

// ── invalid: missing tokenAddress ──────────────────────────────────────────
test("engine.token.risk: invalid - missing tokenAddress throws", async () => {
  await assert.rejects(
    () => resolveTokenRisk({ chain: "evm", network: "eth", tokenAddress: "" }),
    (err) => {
      assert.ok(err instanceof TypeError);
      return true;
    },
  );
});

// ── invalid: missing chain throws ──────────────────────────────────────────
test("engine.token.risk: invalid - missing chain throws", async () => {
  await assert.rejects(
    () => resolveTokenRisk({ tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7" }),
    (err) => {
      assert.ok(err instanceof TypeError);
      return true;
    },
  );
});

// ── invalid: bad EVM address format throws ─────────────────────────────────
test("engine.token.risk: invalid - bad evm address throws", async () => {
  await assert.rejects(
    () => resolveTokenRisk({ chain: "evm", network: "eth", tokenAddress: "not-an-address" }),
    /TypeError|tokenAddress/,
  );
});

// ── engine integration: accessible via engine.token.risk ───────────────────
test("engine.token.risk: accessible from engine instance", async () => {
  const engine = createSearchEngine();
  assert.strictEqual(typeof engine.token.risk, "function", "engine.token.risk should be a function");
});
