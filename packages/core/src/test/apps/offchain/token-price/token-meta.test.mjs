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

test("token meta: btc network 别名可命中 BRC20 配置", async () => {
  const res = await queryTokenMeta({
    query: "ordi",
    network: "btc",
    kind: "symbol",
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "config");
  assert.equal(res.tokenAddress, "ordi");
  assert.equal(res.symbol, "ORDI");
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

test("token meta: kind=symbol 时 T 前缀 query 不应被当成非法地址", async () => {
  const res = await queryTokenMeta({
    query: "Tst",
    network: "bsc",
    kind: "symbol",
  }, {
    forceRemote: true,
    async remoteResolver(item) {
      return {
        chain: "evm",
        network: item.network,
        tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
        symbol: "TST",
        name: "Test Token",
        decimals: 18,
      };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.symbol, "TST");
  assert.equal(res.decimals, 18);
});

test("token meta: forceRemote symbol 在指定network时优先匹配对应链候选", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    async json() {
      if (!String(url).includes("/search?q=arkm")) {
        throw new Error(`unexpected url: ${url}`);
      }
      return {
        pairs: [
          {
            chainId: "bsc",
            dexId: "pancakeswap",
            pairAddress: "0xbscpair",
            priceUsd: "1.0",
            liquidity: { usd: 9000000 },
            volume: { h24: 800000 },
            baseToken: {
              address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
              name: "Arkham",
              symbol: "ARKM",
            },
            quoteToken: {
              address: "0x55d398326f99059fF775485246999027B3197955",
              name: "Tether USD",
              symbol: "USDT",
            },
          },
          {
            chainId: "ethereum",
            dexId: "uniswap",
            pairAddress: "0xethpair",
            priceUsd: "1.01",
            liquidity: { usd: 1000000 },
            volume: { h24: 120000 },
            baseToken: {
              address: "0x6E2a43be0B1d33b726f0CA3b8de60b3482b8b050",
              name: "Arkham",
              symbol: "ARKM",
            },
            quoteToken: {
              address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
              name: "Tether USD",
              symbol: "USDT",
            },
          },
        ],
      };
    },
  });

  try {
    const res = await queryTokenMeta({
      query: "arkm",
      network: "eth",
      kind: "symbol",
    }, {
      forceRemote: true,
      evmMetadataBatchReader: async () => ({ ok: true, items: [] }),
    });

    assert.equal(res.ok, true);

  test("token meta: ETH 上 UNI symbol 可命中本地配置", async () => {
    const res = await queryTokenMeta({
      query: "UNI",
      network: "eth",
      kind: "symbol",
    });

    assert.equal(res.ok, true);
    assert.equal(res.source, "config");
    assert.equal(String(res.tokenAddress).toLowerCase(), "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984");
    assert.equal(res.symbol, "UNI");
  });
    assert.equal(res.source, "remote");
    assert.equal(res.network, "eth");
    assert.equal(String(res.tokenAddress).toLowerCase(), "0x6e2a43be0b1d33b726f0ca3b8de60b3482b8b050");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("token meta: forceRemote symbol 应优先精确匹配symbol避免相似币误命中", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    async json() {
      if (!String(url).includes("/search?q=arkm")) {
        throw new Error(`unexpected url: ${url}`);
      }
      return {
        pairs: [
          {
            chainId: "ethereum",
            dexId: "uniswap",
            pairAddress: "0xhigh-liq-wrong",
            priceUsd: "0.002",
            liquidity: { usd: 9000000 },
            volume: { h24: 800000 },
            baseToken: {
              address: "0xEe8268E6996f32De4DB966B5feCFFbD7ed93f512",
              name: "DARK ELON MUSK",
              symbol: "DARKMUSK",
            },
            quoteToken: {
              address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
              name: "Tether USD",
              symbol: "USDT",
            },
          },
          {
            chainId: "ethereum",
            dexId: "uniswap",
            pairAddress: "0xlower-liq-correct",
            priceUsd: "1.5",
            liquidity: { usd: 1000000 },
            volume: { h24: 120000 },
            baseToken: {
              address: "0x6E2a43be0B1d33b726f0CA3b8de60b3482b8b050",
              name: "Arkham",
              symbol: "ARKM",
            },
            quoteToken: {
              address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
              name: "Tether USD",
              symbol: "USDT",
            },
          },
        ],
      };
    },
  });

  try {
    const res = await queryTokenMeta({
      query: "arkm",
      network: "eth",
      kind: "symbol",
    }, {
      forceRemote: true,
      evmMetadataBatchReader: async () => ({ ok: true, items: [] }),
    });

    assert.equal(res.ok, true);
    assert.equal(res.source, "remote");
    assert.equal(String(res.tokenAddress).toLowerCase(), "0x6e2a43be0b1d33b726f0ca3b8de60b3482b8b050");
    assert.equal(String(res.symbol).toUpperCase(), "ARKM");
  } finally {
    globalThis.fetch = oldFetch;
  }
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

test("token meta: debugStats 返回命中统计", async () => {
  const res = await queryTokenMetaBatch([
    { query: "ordi", network: "mainnet", kind: "symbol" },
    { query: "ORDI", network: "mainnet", kind: "symbol" },
    { query: "sunpump", network: "mainnet", kind: "symbol" },
    { query: "not-a-token", network: "mainnet", kind: "symbol" },
  ], {
    debugStats: true,
    async remoteResolver(item) {
      if (String(item.query).toLowerCase() === "sunpump") {
        return {
          chain: "trx",
          network: "mainnet",
          tokenAddress: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
          symbol: "SUN",
          name: "SUN",
          decimals: 18,
        };
      }
      return null;
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.stats.totalInput, 4);
  assert.equal(res.stats.uniqueInput, 3);
  assert.equal(res.stats.dedupeHits, 1);
  assert.equal(res.stats.configHits, 1);
  assert.equal(res.stats.remoteHits, 1);
  assert.equal(res.stats.unresolved, 1);
});

test("token meta: forceRemote 为 true 时跳过缓存并回写", async () => {
  const cache = createMemoryCache();
  await cache.put({
    chain: "evm",
    network: "bsc",
    items: [{
      tokenAddress: "0xb45e6dd851df10961d1aad912baf220168fcaa25",
      symbol: "OLD",
      name: "Old Token",
      decimals: 0,
    }],
  });

  let remoteCalled = 0;
  const res = await queryTokenMeta({
    query: "0xb45e6dd851df10961d1aad912baf220168fcaa25",
    network: "bsc",
  }, {
    cache,
    forceRemote: true,
    async remoteResolver(item) {
      remoteCalled += 1;
      return {
        chain: "evm",
        network: item.network,
        tokenAddress: item.query,
        symbol: "NEW",
        name: "New Token",
        decimals: 18,
      };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.decimals, 18);
  assert.equal(remoteCalled, 1);
});

test("token meta: EVM 地址远端优先使用链上 ERC20 读取", async () => {
  let evmReaderCalled = 0;
  let sourceCalled = 0;

  const res = await queryTokenMeta({
    query: "0xb45e6dd851df10961d1aad912baf220168fcaa25",
    network: "bsc",
  }, {
    forceRemote: true,
    async evmMetadataReader(item) {
      evmReaderCalled += 1;
      return {
        chain: "evm",
        network: item.network,
        tokenAddress: item.query,
        name: "BSC Token",
        symbol: "BTK",
        decimals: 18,
      };
    },
    tokenInfoSource: {
      async getTokenInfo() {
        sourceCalled += 1;
        return null;
      },
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.decimals, 18);
  assert.equal(evmReaderCalled, 1);
  assert.equal(sourceCalled, 0);
});

test("token meta: TRX 地址远端优先使用链上 TRC20 读取", async () => {
  let trxReaderCalled = 0;
  let sourceCalled = 0;

  const res = await queryTokenMeta({
    query: "TXL6rJbvmjD46zeN1JssfgxvSo99qC8MRT",
    network: "mainnet",
  }, {
    forceRemote: true,
    async trxMetadataReader(item) {
      trxReaderCalled += 1;
      return {
        chain: "trx",
        network: item.network,
        tokenAddress: item.query,
        name: "Sundog",
        symbol: "SUNDOG",
        decimals: 18,
      };
    },
    tokenInfoSource: {
      async getTokenInfo() {
        sourceCalled += 1;
        return {
          baseToken: {
            address: "TXL6rJbvmjD46zeN1JssfgxvSo99qC8MRT",
            symbol: "SUNDOG",
            name: "Sundog",
            decimals: 0,
          },
          chainId: "tron",
        };
      },
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.chain, "trx");
  assert.equal(res.decimals, 18);
  assert.equal(trxReaderCalled, 1);
  assert.equal(sourceCalled, 0);
});

test("token meta: network=trx 别名可规范到 mainnet 并命中配置", async () => {
  const res = await queryTokenMeta({
    query: "SUN",
    network: "trx",
    kind: "symbol",
  });

  assert.equal(res.ok, true);
  assert.ok(["config", "cache"].includes(res.source));
  assert.equal(res.chain, "trx");
  assert.equal(res.network, "mainnet");
  assert.equal(String(res.tokenAddress).toLowerCase(), "tssmhyev2ue9qyh95dqyocunczel1nvu3s");
});

test("token meta: symbol 远端结果与请求网络链不匹配时降级 unresolved", async () => {
  const res = await queryTokenMeta({
    query: "SUNDOG",
    network: "bsc",
    kind: "symbol",
  }, {
    forceRemote: true,
    tokenInfoSource: {
      async getTokenInfo() {
        return {
          chainId: "tron",
          baseToken: {
            address: "9kWKLnZFTSj4vn9BLWivJjBLZoYEXySt7TJYjM75PZ8Y",
            symbol: "SUNDOG",
            name: "SUNDOG",
            decimals: 0,
          },
        };
      },
    },
  });

  assert.equal(res.ok, false);
  assert.equal(res.source, "unresolved");
});

test("token meta: symbol 远端结果同链但网络不匹配时降级 unresolved", async () => {
  const res = await queryTokenMeta({
    query: "FXS",
    network: "bsc",
    kind: "symbol",
  }, {
    forceRemote: true,
    tokenInfoSource: {
      async getTokenInfo() {
        return {
          chainId: "ethereum",
          baseToken: {
            address: "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0",
            symbol: "FXS",
            name: "Frax Share",
            decimals: 18,
          },
        };
      },
    },
  });

  assert.equal(res.ok, false);
  assert.equal(res.source, "unresolved");
});

test("token meta: symbol 远端命中后会补齐 EVM decimals", async () => {
  let evmReaderCalled = 0;

  const res = await queryTokenMeta({
    query: "fxs",
    network: "eth",
    kind: "symbol",
  }, {
    forceRemote: true,
    tokenInfoSource: {
      async getTokenInfo() {
        return {
          chainId: "ethereum",
          baseToken: {
            address: "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0",
            symbol: "FXS",
            name: "Frax Share",
            decimals: 0,
          },
        };
      },
    },
    async evmMetadataReader(item) {
      evmReaderCalled += 1;
      return {
        chain: "evm",
        network: item.network,
        tokenAddress: item.query,
        symbol: "FXS",
        name: "Frax Share",
        decimals: 18,
      };
    },
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.decimals, 18);
  assert.equal(evmReaderCalled, 1);
});

test("token meta: unresolved symbol 返回候选列表", async () => {
  const tokenInfoSource = {
    async getTokenInfo() {
      return null;
    },
    async getTokenCandidates() {
      return [
        {
          chain: "evm",
          network: "eth",
          chainId: "ethereum",
          tokenAddress: "0x1111111111111111111111111111111111111111",
          symbol: "UNI",
          name: "Uniswap",
          dexId: "uniswap",
          pairAddress: "0xpair1",
        },
      ];
    },
  };

  const res = await queryTokenMeta({
    query: "unix",
    network: "eth",
    kind: "symbol",
  }, {
    forceRemote: true,
    tokenInfoSource,
  });

  assert.equal(res.ok, false);
  assert.equal(res.source, "unresolved");
  assert.ok(Array.isArray(res.candidates));
  assert.equal(res.candidates.length, 1);
  assert.equal(String(res.candidates[0].symbol).toUpperCase(), "UNI");
});

test("token meta: tokenInfoSources 可按顺序回退到次源", async () => {
  const solanaFirst = {
    async getTokenInfo() {
      return {
        chain: null,
        network: null,
        tokenAddress: "So11111111111111111111111111111111111111112",
        symbol: "AAVE",
        name: "Aave (Solana)",
      };
    },
  };
  const ethSecond = {
    async getTokenInfo() {
      return {
        chain: "evm",
        network: "eth",
        tokenAddress: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
        symbol: "AAVE",
        name: "Aave",
      };
    },
  };

  const res = await queryTokenMeta({
    query: "aave",
    network: "eth",
    kind: "symbol",
  }, {
    forceRemote: true,
    tokenInfoSources: [solanaFirst, ethSecond],
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "remote");
  assert.equal(res.network, "eth");
  assert.equal(String(res.tokenAddress).toLowerCase(), "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9");
});

test("token meta: unresolved candidates 合并多source并去重", async () => {
  const sourceA = {
    async getTokenInfo() {
      return null;
    },
    async getTokenCandidates() {
      return [
        {
          chain: "evm",
          network: "eth",
          tokenAddress: "0x1111111111111111111111111111111111111111",
          symbol: "AAVE",
          name: "Aave",
        },
      ];
    },
  };

  const sourceB = {
    async getTokenInfo() {
      return null;
    },
    async getTokenCandidates() {
      return [
        {
          chain: "evm",
          network: "eth",
          tokenAddress: "0x1111111111111111111111111111111111111111",
          symbol: "AAVE",
          name: "Aave",
        },
        {
          chain: "evm",
          network: "bsc",
          tokenAddress: "0x2222222222222222222222222222222222222222",
          symbol: "AAVE",
          name: "Aave BSC",
        },
      ];
    },
  };

  const res = await queryTokenMeta({
    query: "aavex",
    network: "eth",
    kind: "symbol",
  }, {
    forceRemote: true,
    tokenInfoSources: [sourceA, sourceB],
  });

  assert.equal(res.ok, false);
  assert.equal(res.source, "unresolved");
  assert.ok(Array.isArray(res.candidates));
  assert.equal(res.candidates.length, 2);
});

test("token meta: bsc 上 bnb symbol 可解析为 native", async () => {
  const res = await queryTokenMeta({
    query: "bnb",
    network: "bsc",
    kind: "symbol",
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "config");
  assert.equal(res.chain, "evm");
  assert.equal(res.network, "bsc");
  assert.equal(res.tokenAddress, "native");
  assert.equal(res.symbol, "BNB");
  assert.equal(res.decimals, 18);
});

test("token meta: eth 上 eth symbol 可解析为 native", async () => {
  const res = await queryTokenMeta({
    query: "eth",
    network: "eth",
    kind: "symbol",
  });

  assert.equal(res.ok, true);
  assert.equal(res.source, "config");
  assert.equal(res.chain, "evm");
  assert.equal(res.network, "eth");
  assert.equal(res.tokenAddress, "native");
  assert.equal(res.symbol, "ETH");
  assert.equal(res.decimals, 18);
});
