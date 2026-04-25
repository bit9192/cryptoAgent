import test from "node:test";
import assert from "node:assert/strict";

import { createTrxTradeSearchProvider } from "../../../../../apps/trx/search/trade-provider.mjs";

const TOKEN = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function makePair({
  chainId = "tron",
  dexId = "justswap",
  pairAddress = "TPair1111111111111111111111111111111",
  baseSymbol = "USDT",
  quoteSymbol = "TRX",
  priceNative = "1.001",
  priceUsd = "1.0001",
  liquidityUsd = 2500000,
  volume24h = 890000,
} = {}) {
  return {
    chainId,
    dexId,
    pairAddress,
    baseToken: { address: TOKEN, symbol: baseSymbol },
    quoteToken: { symbol: quoteSymbol },
    priceNative,
    priceUsd,
    liquidity: { usd: liquidityUsd },
    volume: { h24: volume24h },
  };
}

test("trx-trade-search: H3-1 返回 tron pair 且字段完整", async () => {
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        return [makePair()];
      },
    },
  });

  const items = await provider.searchTrade({ query: TOKEN, network: "mainnet" });
  assert.equal(items.length, 1);
  assert.equal(items[0].domain, "trade");
  assert.equal(items[0].chain, "trx");
  assert.equal(items[0].network, "mainnet");
  assert.equal(items[0].source, "dexscreener");
  assert.equal(items[0].extra.dexId, "justswap");
  assert.equal(items[0].extra.liquidityUsd, 2500000);
  assert.equal(items[0].extra.priceUsd, "1.0001");
});

test("trx-trade-search: H3-2 按 liquidity 降序", async () => {
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        return [
          makePair({ pairAddress: "TPairA", liquidityUsd: 100 }),
          makePair({ pairAddress: "TPairB", liquidityUsd: 500 }),
          makePair({ pairAddress: "TPairC", liquidityUsd: 200 }),
        ];
      },
    },
  });

  const items = await provider.searchTrade({ query: TOKEN, network: "mainnet" });
  assert.equal(items.length, 3);
  assert.equal(items[0].extra.liquidityUsd, 500);
  assert.equal(items[1].extra.liquidityUsd, 200);
  assert.equal(items[2].extra.liquidityUsd, 100);
});

test("trx-trade-search: H3-3 混合链仅保留 tron", async () => {
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        return [
          makePair({ chainId: "tron", pairAddress: "TPairTron" }),
          makePair({ chainId: "ethereum", pairAddress: "0xPairEth" }),
          makePair({ chainId: "bsc", pairAddress: "0xPairBsc" }),
        ];
      },
    },
  });

  const items = await provider.searchTrade({ query: TOKEN, network: "mainnet" });
  assert.equal(items.length, 1);
  assert.equal(items[0].chain, "trx");
});

test("trx-trade-search: E3-1 limit 生效", async () => {
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        return [
          makePair({ pairAddress: "TPairA", liquidityUsd: 100 }),
          makePair({ pairAddress: "TPairB", liquidityUsd: 500 }),
          makePair({ pairAddress: "TPairC", liquidityUsd: 200 }),
        ];
      },
    },
  });

  const items = await provider.searchTrade({ query: TOKEN, network: "mainnet", limit: 1 });
  assert.equal(items.length, 1);
  assert.equal(items[0].extra.liquidityUsd, 500);
});

test("trx-trade-search: E3-2 nile 直接返回 [] 且不调 source", async () => {
  let called = false;
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        called = true;
        return [makePair()];
      },
    },
  });

  const items = await provider.searchTrade({ query: TOKEN, network: "nile" });
  assert.deepEqual(items, []);
  assert.equal(called, false);
});

test("trx-trade-search: E3-3 无 pair 返回 []", async () => {
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        return [];
      },
    },
  });

  const items = await provider.searchTrade({ query: TOKEN, network: "mainnet" });
  assert.deepEqual(items, []);
});

test("trx-trade-search: I3-1 空 query 抛 TypeError", async () => {
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        return [];
      },
    },
  });

  await assert.rejects(
    () => provider.searchTrade({ query: "", network: "mainnet" }),
    (err) => err instanceof TypeError,
  );
});

test("trx-trade-search: I3-2 network 默认 mainnet", async () => {
  let called = false;
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        called = true;
        return [];
      },
    },
  });

  await provider.searchTrade({ query: TOKEN });
  assert.equal(called, true);
});

test("trx-trade-search: I3-3 非法 query 返回 []", async () => {
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        return [makePair()];
      },
    },
  });

  const items = await provider.searchTrade({ query: "0xInvalidEVMAddress", network: "mainnet" });
  assert.deepEqual(items, []);
});

test("trx-trade-search: S3-1 source 抛敏感错误时降级 []", async () => {
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        throw new Error("Request failed: apiKey=DS_SECRET_XYZ");
      },
    },
  });

  const items = await provider.searchTrade({ query: TOKEN, network: "mainnet" });
  assert.deepEqual(items, []);
  assert.ok(!JSON.stringify(items).includes("DS_SECRET_XYZ"));
});

test("trx-trade-search: S3-2 超长 query 不崩溃", async () => {
  const provider = createTrxTradeSearchProvider({
    dexSource: {
      async resolvePairs() {
        return [];
      },
    },
  });

  const longQuery = "x".repeat(512);
  const items = await provider.searchTrade({ query: longQuery, network: "mainnet" });
  assert.deepEqual(items, []);
});
