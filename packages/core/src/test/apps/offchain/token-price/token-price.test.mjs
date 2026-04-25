import test from "node:test";
import assert from "node:assert/strict";

import {
  queryTokenPrice,
  queryTokenPriceBatch,
} from "../../../../apps/offchain/token-price/index.mjs";
import { queryTokenPriceBatchByMeta } from "../../../../apps/offchain/token-price/query-token-price.mjs";
import { BinanceTickerSource } from "../../../../apps/offchain/sources/binance/index.mjs";
import { CoinGeckoSource } from "../../../../apps/offchain/sources/coingecko/index.mjs";
import { SwapV2Source } from "../../../../apps/offchain/sources/swapv2/index.mjs";

function createMemoryPriceCache() {
  const records = new Map();
  return {
    async getMap(input) {
      const out = new Map();
      const maxAgeMs = Number(input.maxAgeMs);
      for (const token of input.tokens ?? []) {
        const key = `${input.chain}:${input.network}:${String(token).trim().toLowerCase()}`;
        const entry = records.get(key);
        if (!entry) continue;
        const updatedAt = Number(entry.updatedAt ?? 0);
        if (Number.isFinite(maxAgeMs) && maxAgeMs >= 0 && Number.isFinite(updatedAt) && updatedAt > 0) {
          if (Date.now() - updatedAt > maxAgeMs) continue;
        }
        out.set(String(token).trim().toLowerCase(), { tokenAddress: token, priceUsd: entry.priceUsd });
      }
      return out;
    },
    async put(input) {
      let changed = 0;
      for (const item of input.items ?? []) {
        const key = `${input.chain}:${input.network}:${String(item.tokenAddress).trim().toLowerCase()}`;
        records.set(key, { priceUsd: Number(item.priceUsd), updatedAt: Date.now() });
        changed += 1;
      }
      return changed;
    },
  };
}

test("token price: symbol 查询远端命中", async () => {
  const res = await queryTokenPrice({
    query: "USDT",
    network: "bsc",
    kind: "symbol",
  }, {
    forceRemote: true,
    priceBatchResolver(tokens) {
      const out = {};
      for (const token of tokens) {
        out[token] = { usd: 1 };
      }
      return out;
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.priceUsd, 1);
  assert.equal(String(res.tokenAddress).toLowerCase(), "0x55d398326f99059ff775485246999027b3197955");
});

test("token price: 缓存命中并可跳过远端", async () => {
  const cache = createMemoryPriceCache();
  let remoteCalls = 0;

  await queryTokenPrice({
    query: "USDT",
    network: "bsc",
    kind: "symbol",
  }, {
    cache,
    forceRemote: true,
    priceBatchResolver(tokens) {
      remoteCalls += 1;
      const out = {};
      for (const token of tokens) {
        out[token] = { usd: 1.01 };
      }
      return out;
    },
  });

  const second = await queryTokenPrice({
    query: "USDT",
    network: "bsc",
    kind: "symbol",
  }, {
    cache,
    forceRemote: false,
    priceBatchResolver(tokens) {
      remoteCalls += 1;
      const out = {};
      for (const token of tokens) {
        out[token] = { usd: 1.02 };
      }
      return out;
    },
  });

  assert.equal(second.ok, true);
  assert.equal(second.source, "remote");
  assert.equal(second.priceUsd, 1.02);
  assert.equal(remoteCalls, 2);
});

test("token price: 未解析 token 返回 unresolved", async () => {
  const res = await queryTokenPrice({
    query: "not-a-token",
    network: "bsc",
    kind: "symbol",
  }, {
    forceRemote: true,
    priceBatchResolver() {
      return {};
    },
  });

  assert.equal(res.ok, false);
  assert.equal(res.source, "unresolved");
});

test("token price: batch 去重与 debugStats", async () => {
  let remoteCalls = 0;
  const res = await queryTokenPriceBatch([
    { query: "USDT", network: "bsc", kind: "symbol" },
    { query: "usdt", network: "bsc", kind: "symbol" },
  ], {
    forceRemote: true,
    debugStats: true,
    priceBatchResolver(tokens) {
      remoteCalls += 1;
      const out = {};
      for (const token of tokens) {
        out[token] = { usd: 1 };
      }
      return out;
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].ok, true);
  assert.equal(res.stats.totalInput, 2);
  assert.equal(res.stats.uniqueInput, 1);
  assert.equal(res.stats.dedupeHits, 1);
  assert.equal(remoteCalls, 1);
});

test("token price: bnb native 会映射到 wbnb 地址查询远端价格", async () => {
  const res = await queryTokenPrice({
    query: "bnb",
    network: "bsc",
    kind: "symbol",
  }, {
    forceRemote: true,
    priceBatchResolver(tokens) {
      assert.ok(tokens.includes("0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"));
      return {
        "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { usd: 600 },
      };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.chain, "evm");
  assert.equal(res.tokenAddress, "native");
  assert.equal(res.symbol, "BNB");
  assert.equal(res.priceUsd, 600);
});

test("token price: 稳定币价格偏离时返回保护 warning", async () => {
  const res = await queryTokenPrice({
    query: "usdt",
    network: "bsc",
    kind: "symbol",
  }, {
    forceRemote: true,
    priceBatchResolver(tokens) {
      const out = {};
      for (const token of tokens) {
        out[token] = { usd: 13.39 };
      }
      return out;
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.priceUsd, 13.39);
  assert.match(String(res.warning ?? ""), /稳定币价格偏离区间/);
});

test("token price: btc native 会映射到 bitcoin ID 查询远端价格", async () => {
  const res = await queryTokenPrice({
    query: "BTC",
    network: "btc",
    kind: "symbol",
  }, {
    forceRemote: true,
    priceBatchResolver(tokens) {
      assert.ok(tokens.includes("bitcoin"));
      return {
        bitcoin: { usd: 77590 },
      };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.chain, "btc");
  assert.equal(res.tokenAddress, "native");
  assert.equal(res.symbol, "BTC");
  assert.equal(res.priceUsd, 77590);
});

test("token price: btc brc20 symbol 可通过 CoinGecko 搜索 coin id 后命中价格", async () => {
  const coinGecko = new CoinGeckoSource();
  await coinGecko.init();

  const oldFetch = globalThis.fetch;
  const calledUrls = [];
  globalThis.fetch = async (url) => {
    calledUrls.push(String(url));

    if (String(url).includes("/search?query=ordi")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            coins: [
              { id: "ordinals", symbol: "ordi", name: "Ordinals", market_cap_rank: 120 },
            ],
          };
        },
      };
    }

    if (String(url).includes("/simple/price?ids=ordinals")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ordinals: {
              usd: 42.5,
              usd_24h_change: 3.2,
            },
          };
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return {};
      },
    };
  };

  try {
    const res = await queryTokenPrice({
      query: "ordi",
      network: "btc",
      kind: "symbol",
    }, {
      forceRemote: true,
      priceSources: [coinGecko],
    });

    assert.equal(res.ok, true);
    assert.equal(res.chain, "btc");
    assert.equal(res.tokenAddress, "ordi");
    assert.equal(res.priceUsd, 42.5);
    assert.ok(calledUrls.some((url) => url.includes("/search?query=ordi")));
    assert.ok(calledUrls.some((url) => url.includes("/simple/price?ids=ordinals")));
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("token price: 主源失败时次源可fallback成功", async () => {
  const brokenSource = {
    async getPrice() {
      throw new Error("primary down");
    },
  };
  const fallbackSource = {
    async getPrice(tokens) {
      const out = {};
      for (const token of tokens) {
        out[token] = { usd: 1 };
      }
      return out;
    },
  };

  const res = await queryTokenPrice({
    query: "usdt",
    network: "bsc",
    kind: "symbol",
  }, {
    forceRemote: true,
    priceSources: [brokenSource, fallbackSource],
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.priceUsd, 1);
});

test("token price: batch 场景次源仅补齐主源缺失 token", async () => {
  const primary = {
    async getPrice(tokens) {
      const out = {};
      for (const token of tokens) {
        if (String(token).toLowerCase().includes("55d398")) {
          out[token] = { usd: 1 };
        }
      }
      return out;
    },
  };
  const secondary = {
    calls: [],
    async getPrice(tokens) {
      this.calls.push([...tokens]);
      const out = {};
      for (const token of tokens) {
        out[token] = { usd: 2 };
      }
      return out;
    },
  };

  const res = await queryTokenPriceBatch([
    { query: "USDT", network: "bsc", kind: "symbol" },
    { query: "WBNB", network: "bsc", kind: "symbol" },
  ], {
    forceRemote: true,
    priceSources: [primary, secondary],
  });

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 2);
  const usdt = res.items.find((v) => String(v.symbol).toUpperCase() === "USDT");
  const wbnb = res.items.find((v) => String(v.symbol).toUpperCase() === "WBNB");
  assert.equal(usdt.priceUsd, 1);
  assert.equal(wbnb.priceUsd, 2);
  assert.equal(secondary.calls.length, 1);
  assert.equal(secondary.calls[0].length, 1);
});

test("token price: debugStats 包含 source 级命中与错误统计", async () => {
  const brokenSource = {
    metadata: { name: "broken-source" },
    async getPrice() {
      throw new Error("source down");
    },
  };
  const fallbackSource = {
    metadata: { name: "fallback-source" },
    async getPrice(tokens) {
      const out = {};
      for (const token of tokens) {
        out[token] = { usd: 1 };
      }
      return out;
    },
  };

  const res = await queryTokenPriceBatch([
    { query: "USDT", network: "bsc", kind: "symbol" },
  ], {
    forceRemote: true,
    debugStats: true,
    priceSources: [brokenSource, fallbackSource],
  });

  assert.equal(res.ok, true);
  assert.equal(res.items[0].ok, true);
  assert.ok(Array.isArray(res.stats.sourceStats));

  const broken = res.stats.sourceStats.find((v) => v.source === "broken-source");
  const fallback = res.stats.sourceStats.find((v) => v.source === "fallback-source");

  assert.equal(broken.attempts, 1);
  assert.equal(broken.errors, 1);
  assert.equal(fallback.attempts, 1);
  assert.equal(fallback.hits, 1);
});

test("token price: Binance 源可作为首源命中并减少回退调用", async () => {
  const binance = new BinanceTickerSource();
  await binance.init();

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        { symbol: "BTCUSDT", price: "77777.7" },
      ];
    },
  });

  const fallback = {
    calls: 0,
    async getPrice() {
      this.calls += 1;
      return {};
    },
  };

  try {
    const res = await queryTokenPrice({
      query: "BTC",
      network: "btc",
      kind: "symbol",
    }, {
      forceRemote: true,
      priceSources: [binance, fallback],
    });

    assert.equal(res.ok, true);
    assert.equal(res.priceUsd, 77777.7);
    assert.equal(fallback.calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("token price: bsc 地址价格可通过 CoinGecko 合约接口命中", async () => {
  const coinGecko = new CoinGeckoSource();
  await coinGecko.init();

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    async json() {
      if (String(url).includes("/simple/token_price/binance-smart-chain")) {
        return {
          "0x8e9b87cad37610d60120a1f48aa1036e24a3831a": {
            usd: 0.456,
            usd_24h_change: 2.3,
          },
        };
      }
      return {};
    },
  });

  try {
    const res = await queryTokenPrice({
      query: "0x8E9b87caD37610D60120A1f48AA1036e24a3831a",
      network: "bsc",
      kind: "address",
    }, {
      forceRemote: true,
      priceSources: [coinGecko],
    });

    assert.equal(res.ok, true);
    assert.equal(res.source, "remote");
    assert.equal(res.priceUsd, 0.456);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("token price: bsc 地址价格可通过现有 swapV2 reserves 命中", async () => {
  const swapV2 = new SwapV2Source({
    factoryGetter: async () => ({
      async getPair(tokenA, tokenB) {
        assert.equal(String(tokenA).toLowerCase(), "0x8e9b87cad37610d60120a1f48aa1036e24a3831a");
        assert.equal(String(tokenB).toLowerCase(), "0x55d398326f99059ff775485246999027b3197955");
        return "0x7bdc4515ba3c8b8890d4e21585865cc5d139f3ef";
      },
    }),
    pairGetter: async () => ({
      async getReserves() {
        return [100000000000000000000n, 123000000000000000000n];
      },
      async token0() {
        return "0x8e9b87cad37610d60120a1f48aa1036e24a3831a";
      },
      async token1() {
        return "0x55d398326f99059ff775485246999027b3197955";
      },
    }),
  });
  await swapV2.init();

  const res = await queryTokenPriceBatchByMeta([
    {
      ok: true,
      chain: "evm",
      network: "bsc",
      tokenAddress: "0x8e9b87cad37610d60120a1f48aa1036e24a3831a",
      symbol: "XPS",
      name: "X-PARALLEL SPACE",
      decimals: 18,
    },
  ], {
    priceSources: [swapV2],
  });

  assert.equal(res.items[0].ok, true);
  assert.equal(res.items[0].priceUsd, 1.23);
  assert.equal(res.items[0].source, "remote");
});
