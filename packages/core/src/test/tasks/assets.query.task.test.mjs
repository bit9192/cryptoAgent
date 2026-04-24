import test from "node:test";
import assert from "node:assert/strict";

import task from "../../tasks/assets/index.mjs";

function createCtx(input, assetsAdapters = null) {
  return {
    input: () => input,
    assetsAdapters,
  };
}

test("assets:query assets.status returns capabilities", async () => {
  const res = await task.run(createCtx({ action: "assets.status" }));
  assert.equal(res.ok, true);
  assert.equal(res.action, "assets.status");
  assert.deepEqual(res.capabilities.chains, ["evm", "btc", "trx"]);
});

test("assets:query assets.query orchestrates evm adapters and aggregate", async () => {
  const res = await task.run(createCtx({
    action: "assets.query",
    chain: "evm",
    addresses: ["0xabc"],
    tokens: ["0xtoken-a", "0xtoken-b"],
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

test("assets:query assets.query keeps warning when one item fails", async () => {
  const res = await task.run(createCtx({
    action: "assets.query",
    chain: "evm",
    addresses: ["0xabc"],
    tokens: ["0xtoken-a"],
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
