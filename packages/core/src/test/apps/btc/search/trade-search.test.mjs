import test from "node:test";
import assert from "node:assert/strict";

import { createBtcTradeSearchProvider } from "../../../../apps/btc/search/trade-provider.mjs";

// ── Mock source 工厂 ──────────────────────────────────────────────────────────

function mockTradeItem(ticker, source) {
  const symbol = ticker.toUpperCase();
  return {
    domain: "trade",
    chain: "btc",
    network: "mainnet",
    id: `trade:btc:mainnet:${ticker.toLowerCase()}`,
    title: `${symbol} (BRC20 Market)`,
    symbol,
    source,
    confidence: source === "bestinslot" ? 0.88 : 0.75,
    extra: {
      protocol: "brc20",
      floorPrice: source === "bestinslot" ? 12345 : null,
      priceUsd: source === "coinpaprika" ? 8.5 : null,
    },
  };
}

function createMockSource(name, returnValue) {
  return { name, async fetch() { return returnValue; } };
}

function createThrowingSource(name, message) {
  return {
    name,
    async fetch() { throw new Error(message); },
  };
}

// ── Happy Path ────────────────────────────────────────────────────────────────

test("btc-trade-search: H3-1 BestInSlot 有结果 → 直接返回，不调 Coinpaprika", async () => {
  let coinpaprikaCalled = false;
  const provider = createBtcTradeSearchProvider({
    bestInSlotSource: createMockSource("bestinslot", mockTradeItem("ordi", "bestinslot")),
    coinpaprikaSource: {
      name: "coinpaprika-spy",
      async fetch() { coinpaprikaCalled = true; return null; },
    },
  });

  const result = await provider.searchTrade({ query: "ordi" });

  assert.ok(!coinpaprikaCalled, "BestInSlot 有结果时 Coinpaprika 不应被调用");
  assert.equal(result.length, 1);
  assert.equal(result[0].source, "bestinslot");
  assert.equal(result[0].symbol, "ORDI");
  assert.equal(result[0].domain, "trade");
  assert.equal(result[0].chain, "btc");
  assert.equal(result[0].extra?.protocol, "brc20");
  assert.equal(result[0].extra?.floorPrice, 12345);
});

test("btc-trade-search: H3-2 无 BestInSlot 结果 → 降级到 Coinpaprika", async () => {
  const provider = createBtcTradeSearchProvider({
    bestInSlotSource: createMockSource("bestinslot", null), // 无 key 或无结果
    coinpaprikaSource: createMockSource("coinpaprika", mockTradeItem("ordi", "coinpaprika")),
  });

  const result = await provider.searchTrade({ query: "ordi" });

  assert.equal(result.length, 1);
  assert.equal(result[0].source, "coinpaprika");
  assert.equal(result[0].extra?.priceUsd, 8.5);
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

test("btc-trade-search: E3-1 query 大小写不敏感 → ORDI 与 ordi 结果相同", async () => {
  const provider = createBtcTradeSearchProvider({
    bestInSlotSource: {
      name: "bestinslot-spy",
      async fetch(ticker) {
        // 验证传入的 ticker 已被规范化为小写
        assert.equal(ticker, "ordi");
        return mockTradeItem("ordi", "bestinslot");
      },
    },
    coinpaprikaSource: createMockSource("coinpaprika", null),
  });

  const result = await provider.searchTrade({ query: "ORDI" });
  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, "ORDI");
});

test("btc-trade-search: E3-2 尾部 token，两个 source 均无结果 → 返回 []", async () => {
  const provider = createBtcTradeSearchProvider({
    bestInSlotSource: createMockSource("bestinslot", null),
    coinpaprikaSource: createMockSource("coinpaprika", null),
  });

  const result = await provider.searchTrade({ query: "some_tail_token" });
  assert.deepEqual(result, []);
});

test("btc-trade-search: E3-3 network 默认为 mainnet", async () => {
  const provider = createBtcTradeSearchProvider({
    bestInSlotSource: {
      name: "bestinslot-spy",
      async fetch(ticker, network) {
        assert.equal(network, "mainnet");
        return mockTradeItem("ordi", "bestinslot");
      },
    },
    coinpaprikaSource: createMockSource("coinpaprika", null),
  });

  const result = await provider.searchTrade({ query: "ordi" }); // 不传 network
  assert.equal(result[0].network, "mainnet");
});

// ── Invalid Cases ─────────────────────────────────────────────────────────────

test("btc-trade-search: I3-1 空 query → 应抛 TypeError", async () => {
  const provider = createBtcTradeSearchProvider({
    bestInSlotSource: createMockSource("bestinslot", null),
    coinpaprikaSource: createMockSource("coinpaprika", null),
  });

  await assert.rejects(
    () => provider.searchTrade({ query: "" }),
    (err) => {
      assert.ok(err instanceof TypeError);
      return true;
    },
  );
});

// ── Security Cases ────────────────────────────────────────────────────────────

test("btc-trade-search: S3-1 source 抛含 apiKey 的错误 → 降级，不透传敏感信息", async () => {
  const provider = createBtcTradeSearchProvider({
    bestInSlotSource: createThrowingSource(
      "bestinslot",
      "Request failed: apiKey=bis_secret_key_12345",
    ),
    coinpaprikaSource: createThrowingSource(
      "coinpaprika",
      "Network timeout: token=another_secret",
    ),
  });

  // 两个 source 都抛错，aggregator 应降级返回 []，不抛出
  const result = await provider.searchTrade({ query: "ordi" });
  assert.deepEqual(result, []);
});
