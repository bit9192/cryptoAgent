import test from "node:test";
import assert from "node:assert/strict";

import { batchBalanceWithProviders } from "../../../apps/search/batch-balance.mjs";
import { createSearchEngine } from "../../../apps/search/engine.mjs";

function createMockBalanceProvider({ id, chain, networks = [], results = [] }) {
  return {
    id,
    chain,
    networks,
    capabilities: ["balance"],
    async batchBalance(rows) {
      return rows.map((row, i) => ({
        ok: true,
        chain: row.chain,
        network: row.network ?? null,
        address: row.address ?? null,
        token: row.token ?? null,
        ownerAddress: row.address ?? null,
        tokenAddress: row.token ?? null,
        rawBalance: results[i]?.rawBalance ?? "1000000",
        error: null,
      }));
    },
  };
}

// ── happy: evm rows 分发到 evm provider ───────────────────────────────────
test("engine.balance.batch: evm rows 分发到 evm provider", async () => {
  const rows = [
    { chain: "evm", network: "eth", address: "0xabc", token: "0xusdt" },
    { chain: "evm", network: "bsc", address: "0xdef", token: "0xbnb" },
  ];
  const results = await batchBalanceWithProviders(rows, {
    providers: [
      createMockBalanceProvider({ id: "evm-mock", chain: "evm", networks: ["eth", "bsc"] }),
    ],
  });

  assert.strictEqual(results.length, 2);
  assert.ok(results.every((r) => r.ok === true), "所有结果应为 ok");
  assert.ok(results.every((r) => r.chain === "evm"), "chain 应为 evm");
});

// ── happy: 多链混合 rows，按 chain 分发 ───────────────────────────────────
test("engine.balance.batch: evm+trx+btc 混合 rows 按 chain 分发", async () => {
  const rows = [
    { chain: "evm", network: "eth", address: "0xaaa", token: "0xt1" },
    { chain: "trx", network: "mainnet", address: "Txxx", token: "TUsdt" },
    { chain: "btc", network: "mainnet", address: "1abc", token: "ordi" },
  ];
  const results = await batchBalanceWithProviders(rows, {
    providers: [
      createMockBalanceProvider({ id: "evm-mock", chain: "evm", networks: ["eth"] }),
      createMockBalanceProvider({ id: "trx-mock", chain: "trx", networks: ["mainnet"] }),
      createMockBalanceProvider({ id: "btc-mock", chain: "btc", networks: ["mainnet"] }),
    ],
  });

  assert.strictEqual(results.length, 3);
  assert.strictEqual(results[0].chain, "evm");
  assert.strictEqual(results[1].chain, "trx");
  assert.strictEqual(results[2].chain, "btc");
  assert.ok(results.every((r) => r.ok === true));
});

// ── happy: 结果顺序与输入 index 一致 ─────────────────────────────────────
test("engine.balance.batch: 结果顺序与输入 index 对应", async () => {
  // evm 和 trx 交替排列，确认还原顺序正确
  const rows = [
    { chain: "trx", network: "mainnet", address: "T1", token: "TR" },
    { chain: "evm", network: "eth", address: "0x1", token: "0xe1" },
    { chain: "trx", network: "mainnet", address: "T2", token: "TU" },
    { chain: "evm", network: "eth", address: "0x2", token: "0xe2" },
  ];

  const results = await batchBalanceWithProviders(rows, {
    providers: [
      createMockBalanceProvider({ id: "evm-mock", chain: "evm", networks: ["eth"] }),
      createMockBalanceProvider({ id: "trx-mock", chain: "trx", networks: ["mainnet"] }),
    ],
  });

  assert.strictEqual(results.length, 4);
  assert.strictEqual(results[0].chain, "trx");
  assert.strictEqual(results[1].chain, "evm");
  assert.strictEqual(results[2].chain, "trx");
  assert.strictEqual(results[3].chain, "evm");
});

// ── edge: 无匹配 provider，返回 ok=false 错误行 ───────────────────────────
test("engine.balance.batch: 无匹配 provider 返回 ok=false", async () => {
  const rows = [
    { chain: "sol", network: "mainnet", address: "Sabc", token: "USDC" },
  ];
  const results = await batchBalanceWithProviders(rows, {
    providers: [
      createMockBalanceProvider({ id: "evm-mock", chain: "evm", networks: ["eth"] }),
    ],
  });

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].ok, false);
  assert.ok(results[0].error.includes("sol"), `错误消息应含 chain 名: ${results[0].error}`);
});

// ── edge: rows 为空数组，返回空数组 ───────────────────────────────────────
test("engine.balance.batch: rows 为空数组返回空数组", async () => {
  const results = await batchBalanceWithProviders([], { providers: [] });
  assert.deepStrictEqual(results, []);
});

// ── invalid: rows[i].chain 缺失抛出 TypeError ─────────────────────────────
test("engine.balance.batch: row 缺少 chain 抛出 TypeError", async () => {
  await assert.rejects(
    () => batchBalanceWithProviders(
      [{ network: "eth", address: "0xabc", token: "0xt" }],
      { providers: [] },
    ),
    (err) => {
      assert.ok(err instanceof TypeError, `应为 TypeError，实际: ${err?.constructor?.name}`);
      return true;
    },
  );
});

// ── edge: provider.batchBalance 抛出异常，结果为 ok=false ─────────────────
test("engine.balance.batch: provider 抛出异常，结果标记 ok=false", async () => {
  const rows = [{ chain: "evm", network: "eth", address: "0xaaa", token: "0xt" }];
  const results = await batchBalanceWithProviders(rows, {
    providers: [{
      id: "broken-evm",
      chain: "evm",
      networks: ["eth"],
      capabilities: ["balance"],
      async batchBalance() {
        throw new Error("network timeout");
      },
    }],
  });

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].ok, false);
  assert.ok(results[0].error.includes("network timeout"));
});

// ── happy: engine.balance.batch 通过 engine 调用 ─────────────────────────
test("engine.balance.batch: 通过 createSearchEngine 调用", async () => {
  const engine = createSearchEngine({
    providers: [
      createMockBalanceProvider({ id: "evm-mock", chain: "evm", networks: ["eth"] }),
    ],
  });

  const rows = [{ chain: "evm", network: "eth", address: "0xabc", token: "0xt" }];
  const results = await engine.balance.batch(rows);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].ok, true);
});
