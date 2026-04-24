import test from "node:test";
import assert from "node:assert/strict";

import task from "../../tasks/assets/index.mjs";

function createCtx(input, assetsAdapters = null, interactFn = null, tokenMetaOptions = null) {
  return {
    input: () => input,
    assetsAdapters,
    interact: interactFn ?? undefined,
    tokenMetaOptions,
  };
}

// ─── assets.status ────────────────────────────────────────────

test("assets:query assets.status returns capabilities", async () => {
  const res = await task.run(createCtx({ action: "assets.status" }));
  assert.equal(res.ok, true);
  assert.equal(res.action, "assets.status");
  assert.deepEqual(res.capabilities.chains, ["evm", "btc", "trx"]);
  assert.ok(res.capabilities.actions.includes("assets.token-meta"));
  assert.ok(Array.isArray(res.capabilities.inputFormats));
});

test("assets:query assets.token-meta resolves metadata with debug stats", async () => {
  const res = await task.run(createCtx({
    action: "assets.token-meta",
    items: [
      { query: "ordi", network: "mainnet", kind: "symbol" },
      { query: "ORDI", network: "mainnet", kind: "symbol" },
    ],
    debugStats: true,
  }));

  assert.equal(res.ok, true);
  assert.equal(res.action, "assets.token-meta");
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].source, "config");
  assert.equal(res.stats.totalInput, 2);
  assert.equal(res.stats.uniqueInput, 1);
  assert.equal(res.stats.dedupeHits, 1);
});

test("assets:query assets.token-meta passes forceRemote option", async () => {
  let forceRemoteSeen = false;
  const res = await task.run(createCtx({
    action: "assets.token-meta",
    query: "0xb45e6dd851df10961d1aad912baf220168fcaa25",
    network: "bsc",
    forceRemote: true,
  }, null, null, {
    cache: {
      async getMap() {
        return new Map();
      },
      async find() {
        return null;
      },
      async put() {
        return 1;
      },
    },
    async remoteResolver(item, options) {
      forceRemoteSeen = options.forceRemote === true;
      return {
        chain: "evm",
        network: item.network,
        tokenAddress: item.query,
        symbol: "TOK",
        name: "Token",
        decimals: 18,
      };
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.action, "assets.token-meta");
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].source, "remote");
  assert.equal(res.items[0].decimals, 18);
  assert.equal(forceRemoteSeen, true);
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

test("assets:query assets.query does not build cartesian pairs inside one chain", async () => {
  const balanceCalls = [];
  const metadataCalls = [];

  const res = await task.run(createCtx({
    action: "assets.query",
    items: [
      { address: "TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe", token: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", network: "mainnet" },
      { address: "TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT", token: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", network: "mainnet" },
    ],
  }, {
    trx: {
      async queryMetadataBatch(items) {
        metadataCalls.push(items.map((item) => item.token));
        return {
          ok: true,
          items: items.map((item) => ({
            tokenAddress: item.token,
            symbol: item.token === "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" ? "USDT" : "WIN",
            name: item.token === "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" ? "Tether USD" : "WINk",
            decimals: 6,
            ok: true,
          })),
        };
      },
      async queryBalanceBatch(pairs) {
        balanceCalls.push(pairs);
        return {
          ok: true,
          items: pairs.map((pair) => ({
            ownerAddress: pair.address,
            tokenAddress: pair.token,
            balance: 1n,
            ok: true,
          })),
        };
      },
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.snapshot.items.length, 2);
  assert.equal(balanceCalls.length, 1);
  assert.deepEqual(balanceCalls[0], [
    { address: "TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe", token: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" },
    { address: "TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT", token: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7" },
  ]);
  assert.ok(metadataCalls.length <= 1);
});

test("assets:query assets.query passes callerAddress to trx metadata batch", async () => {
  const metadataCalls = [];

  const res = await task.run(createCtx({
    action: "assets.query",
    items: [
      {
        address: "TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe",
        token: "custom-token-1",
        network: "mainnet",
      },
    ],
  }, {
    trx: {
      async queryMetadataBatch(items) {
        metadataCalls.push(items);
        return {
          ok: true,
          items: items.map((item) => ({
            tokenAddress: item.token,
            symbol: "USDT",
            name: "Tether USD",
            decimals: 6,
            ok: true,
          })),
        };
      },
      async queryBalanceBatch() {
        return {
          ok: true,
          items: [
            {
              ownerAddress: "TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe",
              tokenAddress: "custom-token-1",
              balance: 1000000n,
              ok: true,
            },
          ],
        };
      },
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.snapshot.items.length, 1);
  assert.equal(res.snapshot.items[0].decimals, 6);
  assert.equal(metadataCalls.length, 1);
  assert.equal(metadataCalls[0][0].callerAddress, "TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe");
});

test("assets:query assets.query supports btc native and brc20 in one call", async () => {
  const res = await task.run(createCtx({
    action: "assets.query",
    items: [
      { address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", token: "BTC", network: "mainnet" },
      { address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6", token: "ORDI", network: "mainnet" },
    ],
  }, {
    btc: {
      async queryNativeBalance(input) {
        return {
          rows: [
            { address: input.addresses[0], total: 68.12345678 },
          ],
        };
      },
      async queryBalanceBatch() {
        return {
          ok: true,
          items: [
            {
              address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6",
              tokenAddress: "ORDI",
              symbol: "ORDI",
              tokenName: "Ordinals",
              decimals: 18,
              balance: "12.5",
              ok: true,
            },
          ],
        };
      },
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.snapshot.items.length, 2);
  assert.equal(res.snapshot.items[0].tokenAddress, "native");
  assert.equal(res.snapshot.items[0].symbol, "BTC");
  assert.equal(res.snapshot.items[1].tokenAddress, "ORDI");
});

test("assets:query assets.query reads metadata from config before RPC", async () => {
  let metadataCalled = 0;

  const res = await task.run(createCtx({
    action: "assets.query",
    items: [
      {
        address: "0xabc",
        token: "0x55d398326f99059fF775485246999027B3197955",
        network: "bsc",
      },
    ],
  }, {
    evm: {
      async queryMetadataBatch() {
        metadataCalled += 1;
        return {
          ok: true,
          items: [],
        };
      },
      async queryBalanceBatch() {
        return {
          ok: true,
          items: [
            {
              chain: "evm",
              ownerAddress: "0xabc",
              tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
              balance: 1n,
              ok: true,
            },
          ],
        };
      },
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(metadataCalled, 0);
  assert.equal(res.snapshot.items.length, 1);
  assert.equal(res.snapshot.items[0].symbol, "USDT");
  assert.equal(res.snapshot.items[0].decimals, 18);
});

test("assets:query assets.query reads BTC metadata from config before adapter fields", async () => {
  const res = await task.run(createCtx({
    action: "assets.query",
    items: [
      {
        address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6",
        token: "ordi",
        network: "mainnet",
      },
    ],
  }, {
    btc: {
      async queryBalanceBatch() {
        return {
          ok: true,
          items: [
            {
              address: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6",
              tokenAddress: "ordi",
              symbol: null,
              tokenName: null,
              decimals: null,
              balance: "1",
              ok: true,
            },
          ],
        };
      },
    },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.snapshot.items.length, 1);
  assert.equal(res.snapshot.items[0].symbol, "ORDI");
  assert.equal(res.snapshot.items[0].name, "Ordinals");
  assert.equal(res.snapshot.items[0].decimals, 18);
});
