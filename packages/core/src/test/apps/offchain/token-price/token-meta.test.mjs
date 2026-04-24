import test from "node:test";
import assert from "node:assert/strict";

import { queryTokenMeta, queryTokenMetaBatch } from "../../../../apps/offchain/token-price/index.mjs";

function createMemoryCache() {
  const records = new Map();
  return {
    async getMap(input) {
      const map = new Map();
      for (const token of input.tokens ?? []) {
        const key = `${input.chain}:${input.network}:${String(token).trim().toLowerCase()}`;
        if (records.has(key)) {
          const value = records.get(key);
          const maxAgeMs = Number(input.maxAgeMs);
          const updatedAt = Number(value?.updatedAt ?? 0);
          if (Number.isFinite(maxAgeMs) && maxAgeMs >= 0 && Number.isFinite(updatedAt) && updatedAt > 0) {
            if (Date.now() - updatedAt > maxAgeMs) continue;
          }
          map.set(String(token).trim().toLowerCase(), value);
        }
      }
      return map;
    },
    async put(input) {
      for (const item of input.items ?? []) {
        const key = `${input.chain}:${input.network}:${String(item.tokenAddress).trim().toLowerCase()}`;
        records.set(key, item);
      }
      return input.items?.length ?? 0;
    },
    async find(input) {
      const query = String(input.query ?? "").trim().toLowerCase();
      for (const [key, value] of records.entries()) {
        const [chain, network, tokenAddress] = key.split(":");
        if (input.chain && chain !== input.chain) continue;
        if (input.network && network !== input.network) continue;
        const maxAgeMs = Number(input.maxAgeMs);
        const updatedAt = Number(value?.updatedAt ?? 0);
        if (Number.isFinite(maxAgeMs) && maxAgeMs >= 0 && Number.isFinite(updatedAt) && updatedAt > 0) {
          if (Date.now() - updatedAt > maxAgeMs) continue;
        }
        const symbol = String(value.symbol ?? "").trim().toLowerCase();
        const name = String(value.name ?? "").trim().toLowerCase();
        if (tokenAddress === query || symbol === query || name === query) {
          return { chain, network, ...value };
        }
      }
      return null;
    },
  };
}

test("token meta: 配置命中 address -> meta", async () => {
  const res = await queryTokenMeta({
    query: "0x55d398326f99059fF775485246999027B3197955",
    network: "bsc",
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "config");
  assert.equal(res.symbol, "USDT");
  assert.equal(res.decimals, 18);
});

test("token meta: 配置命中 symbol -> address", async () => {
  const res = await queryTokenMeta({
    query: "ordi",
    network: "mainnet",
    kind: "symbol",
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "config");
  assert.equal(res.tokenAddress, "ordi");
  assert.equal(res.name, "Ordinals");
});

test("token meta: 缓存命中 address -> meta", async () => {
  const cache = createMemoryCache();
  await cache.put({
    chain: "trx",
    network: "mainnet",
    items: [{
      tokenAddress: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
    }],
  });

  const res = await queryTokenMeta({
    query: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    network: "mainnet",
  }, { cache });

  assert.equal(res.ok, true);
  assert.equal(res.source, "cache");
  assert.equal(res.symbol, "USDT");
});

test("token meta: 远端命中并回写缓存", async () => {
  const cache = createMemoryCache();
  let remoteCalled = 0;

  const first = await queryTokenMeta({
    query: "sunpump",
    network: "mainnet",
    kind: "symbol",
  }, {
    cache,
    async remoteResolver(item) {
      remoteCalled += 1;
      return {
        chain: "trx",
        network: item.network,
        tokenAddress: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
        symbol: "SUN",
        name: "SUN",
        decimals: 18,
      };
    },
  });

  const second = await queryTokenMeta({
    query: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
    network: "mainnet",
  }, { cache });

  assert.equal(first.ok, true);
  assert.equal(first.source, "remote");
  assert.equal(second.ok, true);
  assert.equal(second.source, "cache");
  assert.equal(remoteCalled, 1);
});

test("token meta: 默认使用 DexScreener 作为远端兜底", async () => {
  const cache = createMemoryCache();
  const oldFetch = globalThis.fetch;

  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    async json() {
      if (!String(url).includes("/search?q=SUNX")) {
        throw new Error(`unexpected url: ${url}`);
      }
      return {
        pairs: [
          {
            chainId: "tron",
            dexId: "sunswap",
            pairAddress: "TPAIR",
            priceUsd: "0.5",
            liquidity: { usd: 500000 },
            volume: { h24: 120000 },
            baseToken: {
              address: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
              name: "SUN",
              symbol: "SUN",
            },
            quoteToken: {
              address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
              name: "Tether USD",
              symbol: "USDT",
            },
          },
        ],
      };
    },
  });

  try {
    const first = await queryTokenMeta({
      query: "SUNX",
      network: "mainnet",
      kind: "symbol",
    }, { cache });

    const second = await queryTokenMeta({
      query: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
      network: "mainnet",
    }, { cache });

    assert.equal(first.ok, true);
    assert.equal(first.source, "remote");
    assert.equal(first.chain, "trx");
    assert.equal(first.symbol, "SUN");
    assert.equal(second.ok, true);
    assert.equal(second.source, "cache");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("token meta: 过期缓存会跳过并走远端回填", async () => {
  const cache = createMemoryCache();
  let remoteCalled = 0;

  await cache.put({
    chain: "trx",
    network: "mainnet",
    items: [{
      tokenAddress: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
      symbol: "SUN-OLD",
      name: "SUN Old",
      decimals: 6,
      updatedAt: Date.now() - 10_000,
    }],
  });

  const res = await queryTokenMeta({
    query: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
    network: "mainnet",
  }, {
    cache,
    cacheMaxAgeMs: 100,
    async remoteResolver(item) {
      remoteCalled += 1;
      return {
        chain: "trx",
        network: item.network,
        tokenAddress: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
        symbol: "SUN",
        name: "SUN",
        decimals: 18,
      };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.symbol, "SUN");
  assert.equal(remoteCalled, 1);
});

test("token meta: mixed chain batch 查询", async () => {
  const res = await queryTokenMetaBatch([
    { query: "USDT", network: "bsc", kind: "symbol" },
    { query: "ordi", network: "mainnet", kind: "symbol" },
    { query: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", network: "mainnet" },
  ]);

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 3);
  assert.deepEqual(res.items.map((item) => item.chain), ["evm", "btc", "trx"]);
});

test("token meta: batch 重复输入只触发一次远端解析", async () => {
  let remoteCalled = 0;
  const res = await queryTokenMetaBatch([
    { query: "sunpump", network: "mainnet", kind: "symbol" },
    { query: "SUNPUMP", network: "mainnet", kind: "symbol" },
    { query: "sunpump", network: "mainnet", kind: "symbol" },
  ], {
    async remoteResolver(item) {
      remoteCalled += 1;
      return {
        chain: "trx",
        network: item.network,
        tokenAddress: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
        symbol: "SUN",
        name: "SUN",
        decimals: 18,
      };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 3);
  assert.equal(remoteCalled, 1);
  assert.deepEqual(res.items.map((item) => item.source), ["remote", "remote", "remote"]);
  assert.deepEqual(res.items.map((item) => item.tokenAddress), [
    "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
    "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
    "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
  ]);
});

test("token meta: 非法空 query 抛错", async () => {
  await assert.rejects(
    async () => await queryTokenMeta({ query: "   " }),
    /query 不能为空/,
  );
});

test("token meta: 非法地址样式输入抛错", async () => {
  await assert.rejects(
    async () => await queryTokenMeta({ query: "0x123" }),
    /非法地址/,
  );
  await assert.rejects(
    async () => await queryTokenMeta({ query: "T123" }),
    /非法地址/,
  );
});

test("token meta: 远端异常不泄露敏感信息并降级", async () => {
  const secret = "TRX_MAINNET_API_KEY=super-secret-key";
  const res = await queryTokenMeta({
    query: "not-a-token",
    network: "mainnet",
    kind: "symbol",
  }, {
    async remoteResolver() {
      throw new Error(`remote failed: ${secret}`);
    },
  });

  assert.equal(res.ok, false);
  assert.equal(res.source, "unresolved");
  assert.match(String(res.error ?? ""), /未解析 token/);
  assert.doesNotMatch(String(res.error ?? ""), /TRX_MAINNET_API_KEY|super-secret-key/);
});
