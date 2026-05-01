import test from "node:test";
import assert from "node:assert/strict";

import { searchTradeWithProviders } from "../../../apps/search/trade-search.mjs";
import { createSearchEngine } from "../../../apps/search/engine.mjs";

function createMockTradeProvider({ id, chain, networks, items = [] }) {
  return {
    id,
    chain,
    networks,
    capabilities: ["trade"],
    async searchTrade() {
      return items.map((item) => ({
        domain: "trade",
        chain,
        network: networks[0],
        ...item,
      }));
    },
  };
}

// ── happy: 按 chain 分发 ───────────────────────────────────────────────────
test("engine.trade.search: 按 chain 分发 trade provider", async () => {
  const result = await searchTradeWithProviders(
    { query: "USDT", chain: "evm", network: "eth" },
    {
      providers: [
        createMockTradeProvider({
          id: "evm-mock",
          chain: "evm",
          networks: ["eth"],
          items: [{ symbol: "USDT/ETH", pairAddress: "0xabc" }],
        }),
        createMockTradeProvider({
          id: "btc-mock",
          chain: "btc",
          networks: ["mainnet"],
          items: [{ symbol: "BTC/USDT" }],
        }),
      ],
    },
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.domain, "trade");
  assert.ok(result.items.every((item) => item.chain === "evm"), "只应返回 evm 结果");
  assert.strictEqual(result.sourceStats.total, 1);
  assert.strictEqual(result.sourceStats.hit, 1);
});

// ── happy: network 过滤 ────────────────────────────────────────────────────
test("engine.trade.search: network 过滤只选匹配 provider", async () => {
  const result = await searchTradeWithProviders(
    { query: "BNB", chain: "evm", network: "bsc" },
    {
      providers: [
        createMockTradeProvider({ id: "evm-eth", chain: "evm", networks: ["eth"], items: [{ symbol: "A" }] }),
        createMockTradeProvider({ id: "evm-bsc", chain: "evm", networks: ["bsc"], items: [{ symbol: "B" }] }),
      ],
    },
  );

  assert.strictEqual(result.sourceStats.total, 1);
  assert.strictEqual(result.items[0].symbol, "B");
});

// ── happy: 无 chain 过滤，所有 trade provider 均参与 ───────────────────────
test("engine.trade.search: 无 chain 过滤则所有 provider 均参与", async () => {
  const result = await searchTradeWithProviders(
    { query: "USDT" },
    {
      providers: [
        createMockTradeProvider({ id: "evm-mock", chain: "evm", networks: ["eth"], items: [{ symbol: "X" }] }),
        createMockTradeProvider({ id: "btc-mock", chain: "btc", networks: ["mainnet"], items: [{ symbol: "Y" }] }),
      ],
    },
  );

  assert.strictEqual(result.sourceStats.total, 2);
  assert.strictEqual(result.items.length, 2);
});

// ── invalid: 空 query 抛出 TypeError ─────────────────────────────────────
test("engine.trade.search: 空 query 抛出 TypeError", async () => {
  await assert.rejects(
    () => searchTradeWithProviders({ query: "" }, { providers: [] }),
    (err) => {
      assert.ok(err instanceof TypeError);
      return true;
    },
  );
});

// ── edge: 无匹配 provider，返回空 items ──────────────────────────────────
test("engine.trade.search: 无匹配 provider 返回空 items", async () => {
  const result = await searchTradeWithProviders(
    { query: "USDT", chain: "evm" },
    { providers: [] },
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.items.length, 0);
  assert.strictEqual(result.sourceStats.total, 0);
});

// ── edge: provider 抛错，不影响其他 provider ─────────────────────────────
test("engine.trade.search: provider 抛错时 failed 计数且不影响其他", async () => {
  const result = await searchTradeWithProviders(
    { query: "USDT" },
    {
      providers: [
        {
          id: "broken",
          chain: "evm",
          networks: ["eth"],
          capabilities: ["trade"],
          async searchTrade() { throw new Error("network error"); },
        },
        createMockTradeProvider({ id: "ok", chain: "btc", networks: ["mainnet"], items: [{ symbol: "BTC" }] }),
      ],
    },
  );

  assert.strictEqual(result.sourceStats.failed, 1);
  assert.strictEqual(result.sourceStats.success, 1);
  assert.strictEqual(result.items.length, 1);
});

// ── integration: engine.trade.search 可访问 ──────────────────────────────
test("engine.trade.search: engine 实例可调用", async () => {
  const engine = createSearchEngine();
  assert.strictEqual(typeof engine.trade.search, "function");
});
