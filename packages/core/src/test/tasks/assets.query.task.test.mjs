import test from "node:test";
import assert from "node:assert/strict";

import task from "../../tasks/assets/index.mjs";

function createCtx(input, assetsAdapters = null, interactFn = null) {
  return {
    input: () => input,
    assetsAdapters,
    interact: interactFn ?? undefined,
  };
}

// ─── assets.status ────────────────────────────────────────────

test("assets:query assets.status returns capabilities", async () => {
  const res = await task.run(createCtx({ action: "assets.status" }));
  assert.equal(res.ok, true);
  assert.equal(res.action, "assets.status");
  assert.deepEqual(res.capabilities.chains, ["evm", "btc", "trx"]);
  assert.ok(Array.isArray(res.capabilities.inputFormats));
});

// ─── assets.query — triplet object items ──────────────────────

test("assets:query assets.query orchestrates evm adapters via triplet object items", async () => {
  const res = await task.run(createCtx({
    action: "assets.query",
    items: [
      { address: "0xabc", token: "0xtoken-a", network: "eth" },
      { address: "0xabc", token: "0xtoken-b", network: "eth" },
    ],
    prices: [
      { chain: "evm", tokenAddress: "0xtoken-a", priceUsd: 2 },
      { chain: "evm", tokenAddress: "0xtoken-b", priceUsd: 5 },
    ],
    risks: [
      { chain: "evm", tokenAddress: "0xtoken-a", riskLevel: "low", score: 1 },
      { chain: "evm", tokenAddress: "0xtoken-b", riskLevel: "medium", score: 50 },
    ],
  }, {
    evm: {
      async queryMetadataBatch(items) {
        return {
          ok: true,
          items: items.map((item) => ({
            chain: "evm",
            tokenAddress: item.token,
            name: item.token === "0xtoken-a" ? "TokenA" : "TokenB",
            symbol: item.token === "0xtoken-a" ? "TKA" : "TKB",
            decimals: 0,
            ok: true,
          })),
        };
      },
      async queryBalanceBatch() {
        return {
          ok: true,
          items: [
            { chain: "evm", ownerAddress: "0xabc", tokenAddress: "0xtoken-a", balance: 10n, ok: true },
            { chain: "evm", ownerAddress: "0xabc", tokenAddress: "0xtoken-b", balance: 3n, ok: true },
          ],
        };
      },
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.action, "assets.query");
  assert.equal(res.snapshot.ok, true);
  assert.equal(res.snapshot.items.length, 2);
  assert.equal(res.snapshot.items[0].tokenAddress, "0xtoken-a");
  assert.equal(res.snapshot.items[0].valueUsd, 20);
  assert.equal(res.snapshot.items[1].tokenAddress, "0xtoken-b");
  assert.equal(res.snapshot.items[1].valueUsd, 15);
});

// ─── assets.query — triplet string items ──────────────────────

test("assets:query assets.query accepts triplet string format", async () => {
  const res = await task.run(createCtx({
    action: "assets.query",
    items: ["0xabc:0xtoken-a:eth"],
  }, {
    evm: {
      async queryMetadataBatch(items) {
        return {
          ok: true,
          items: items.map((item) => ({
            chain: "evm", tokenAddress: item.token,
            name: "TokenA", symbol: "TKA", decimals: 0, ok: true,
          })),
        };
      },
      async queryBalanceBatch() {
        return {
          ok: true,
          items: [{ chain: "evm", ownerAddress: "0xabc", tokenAddress: "0xtoken-a", balance: 5n, ok: true }],
        };
      },
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.snapshot.items.length, 1);
  assert.equal(res.snapshot.items[0].tokenAddress, "0xtoken-a");
});

// ─── assets.query — warning isolation ────────────────────────

test("assets:query assets.query keeps warning when one item fails", async () => {
  const res = await task.run(createCtx({
    action: "assets.query",
    items: [{ address: "0xabc", token: "0xtoken-a", network: "eth" }],
  }, {
    evm: {
      async queryMetadataBatch() {
        return { ok: true, items: [] };
      },
      async queryBalanceBatch() {
        return {
          ok: true,
          items: [
            { chain: "evm", ownerAddress: "0xabc", tokenAddress: "0xtoken-a", ok: false, error: "rpc timeout" },
          ],
        };
      },
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.snapshot.ok, true);
  assert.equal(res.snapshot.items.length, 0);
  assert.equal(res.warnings.length, 1);
  assert.match(String(res.warnings[0].error), /timeout/);
});

// ─── assets.query — multi-chain (evm + trx) ──────────────────

test("assets:query assets.query handles multi-chain items in one call", async () => {
  const res = await task.run(createCtx({
    action: "assets.query",
    items: [
      { address: "0xabc", token: "0xtoken-a", network: "eth" },
      { address: "TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy", token: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", network: "" },
    ],
  }, {
    evm: {
      async queryMetadataBatch(items) {
        return { ok: true, items: items.map((i) => ({ tokenAddress: i.token, symbol: "TKA", name: "TokenA", decimals: 0, ok: true })) };
      },
      async queryBalanceBatch() {
        return { ok: true, items: [{ ownerAddress: "0xabc", tokenAddress: "0xtoken-a", balance: 1n, ok: true }] };
      },
    },
    trx: {
      async queryMetadataBatch(items) {
        return { ok: true, items: items.map((i) => ({ tokenAddress: i.token, symbol: "USDT", name: "Tether", decimals: 6, ok: true })) };
      },
      async queryBalanceBatch() {
        return { ok: true, items: [{ ownerAddress: "TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy", tokenAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", balance: 1000000n, ok: true }] };
      },
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.snapshot.items.length, 2);
  const chains = res.snapshot.items.map((i) => i.chain).sort();
  assert.deepEqual(chains, ["evm", "trx"]);
});
