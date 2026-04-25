import test from "node:test";
import assert from "node:assert/strict";

import { createEvmDexScreenerTradeProvider } from "../../../../../apps/evm/search/trade-provider.mjs";
import { searchOnchainLiquidityPairs } from "../../../../../apps/evm/search/trade-onchain-liquidity.mjs";
import { getEvmDexConfigs } from "../../../../../apps/evm/configs/dexes.js";

test("trade-search ETS-T1: network is required", async () => {
  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs() {
        return [];
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  await assert.rejects(
    async () => {
      await provider.searchTradePairs({
        tokenAddress: "0x55d398326f99059ff775485246999027b3197955",
      });
    },
    {
      name: "TypeError",
      message: /network/i,
    },
  );
});

test("trade-search ETS-T1: filters by network, sorts by liquidity and applies limit", async () => {
  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs() {
        return [
          {
            chainId: "bsc",
            dexId: "pancakeswap",
            pairAddress: "0x1111111111111111111111111111111111111111",
            priceUsd: 1,
            liquidity: { usd: 2000000 },
            volume: { h24: 300000 },
            baseToken: { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT" },
            quoteToken: { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", symbol: "WBNB" },
          },
          {
            chainId: "ethereum",
            dexId: "uniswap",
            pairAddress: "0x2222222222222222222222222222222222222222",
            priceUsd: 1,
            liquidity: { usd: 9000000 },
            volume: { h24: 800000 },
            baseToken: { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT" },
            quoteToken: { address: "0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2", symbol: "WETH" },
          },
          {
            chainId: "bsc",
            dexId: "biswap",
            pairAddress: "0x3333333333333333333333333333333333333333",
            priceUsd: 1,
            liquidity: { usd: 500000 },
            volume: { h24: 40000 },
            baseToken: { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT" },
            quoteToken: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", symbol: "USDC" },
          },
        ];
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  const items = await provider.searchTradePairs({
    tokenAddress: "0x55d398326f99059ff775485246999027b3197955",
    network: "bsc",
    limit: 1,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].network, "bsc");
  assert.equal(items[0].extra?.dexId, "pancakeswap");
  assert.equal(items[0].extra?.liquidityUsd, 2000000);
});

test("trade-search ETS-T1: invalid address returns empty array", async () => {
  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs() {
        throw new Error("should not be called for invalid address");
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  const items = await provider.searchTradePairs({
    tokenAddress: "0x123",
    network: "bsc",
  });

  assert.deepEqual(items, []);
});

test("trade-search ETS-T1: source failure degrades to empty array", async () => {
  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs() {
        throw new Error("apiKey=SECRET_TOKEN");
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  const items = await provider.searchTradePairs({
    tokenAddress: "0x55d398326f99059ff775485246999027b3197955",
    network: "bsc",
  });

  assert.deepEqual(items, []);
});

test("trade-search ETS-T2: summary aggregates top pair and totals", async () => {
  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs() {
        return [
          {
            chainId: "bsc",
            dexId: "pancakeswap",
            pairAddress: "0x1111111111111111111111111111111111111111",
            priceUsd: 1,
            liquidity: { usd: 2000000 },
            volume: { h24: 300000 },
            baseToken: { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT" },
            quoteToken: { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", symbol: "WBNB" },
          },
          {
            chainId: "bsc",
            dexId: "biswap",
            pairAddress: "0x3333333333333333333333333333333333333333",
            priceUsd: 1,
            liquidity: { usd: 500000 },
            volume: { h24: 40000 },
            baseToken: { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT" },
            quoteToken: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", symbol: "USDC" },
          },
        ];
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  const summary = await provider.getTokenTradeSummary({
    tokenAddress: "0x55d398326f99059ff775485246999027b3197955",
    network: "bsc",
  });

  assert.equal(summary.pairCount, 2);
  assert.equal(summary.topDex, "pancakeswap");
  assert.equal(summary.topPairAddress, "0x1111111111111111111111111111111111111111");
  assert.equal(summary.liquidityUsd, 2000000);
  assert.equal(summary.totalLiquidityUsd, 2500000);
  assert.equal(summary.volume24h, 300000);
  assert.equal(summary.totalVolume24h, 340000);
});

test("trade-search ETS-T2: summary requires network", async () => {
  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs() {
        return [];
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  await assert.rejects(
    async () => {
      await provider.getTokenTradeSummary({
        tokenAddress: "0x55d398326f99059ff775485246999027b3197955",
      });
    },
    {
      name: "TypeError",
      message: /network/i,
    },
  );
});

test("trade-search ETS-T2: summary returns empty defaults on no pairs", async () => {
  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs() {
        return [];
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  const summary = await provider.getTokenTradeSummary({
    tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    network: "eth",
  });

  assert.equal(summary.pairCount, 0);
  assert.equal(summary.topDex, null);
  assert.equal(summary.topPairAddress, null);
  assert.equal(summary.totalLiquidityUsd, 0);
  assert.equal(summary.totalVolume24h, 0);
});

test("trade-search ETS-T3: finds two-hop route to USDT", async () => {
  const tokenB = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const wbnb = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const usdt = "0x55d398326f99059ff775485246999027b3197955";

  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs(tokenAddress) {
        const token = String(tokenAddress).toLowerCase();
        if (token === tokenB) {
          return [{
            chainId: "bsc",
            dexId: "pancakeswap",
            pairAddress: "0x1010101010101010101010101010101010101010",
            priceUsd: 0.5,
            liquidity: { usd: 1200000 },
            volume: { h24: 150000 },
            baseToken: { address: tokenB, symbol: "B" },
            quoteToken: { address: wbnb, symbol: "WBNB" },
          }];
        }
        if (token === wbnb) {
          return [{
            chainId: "bsc",
            dexId: "pancakeswap",
            pairAddress: "0x2020202020202020202020202020202020202020",
            priceUsd: 600,
            liquidity: { usd: 8000000 },
            volume: { h24: 900000 },
            baseToken: { address: wbnb, symbol: "WBNB" },
            quoteToken: { address: usdt, symbol: "USDT" },
          }];
        }
        return [];
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  const routes = await provider.searchTwoHopRoutes({
    tokenAddress: tokenB,
    network: "bsc",
    targetSymbol: "USDT",
  });

  assert.equal(routes.length, 1);
  assert.equal(routes[0].targetSymbol, "USDT");
  assert.equal(String(routes[0].intermediateToken?.symbol).toUpperCase(), "WBNB");
  assert.equal(routes[0].firstHop?.extra?.pairAddress, "0x1010101010101010101010101010101010101010");
  assert.equal(routes[0].secondHop?.extra?.pairAddress, "0x2020202020202020202020202020202020202020");
});

test("trade-search ETS-T3: requires network", async () => {
  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs() {
        return [];
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  await assert.rejects(
    async () => {
      await provider.searchTwoHopRoutes({
        tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
    },
    {
      name: "TypeError",
      message: /network/i,
    },
  );
});

test("trade-search ETS-T3: returns empty when second hop not found", async () => {
  const tokenB = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const wbnb = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  const provider = createEvmDexScreenerTradeProvider({
    dexscreener: {
      async resolvePairs(tokenAddress) {
        const token = String(tokenAddress).toLowerCase();
        if (token === tokenB) {
          return [{
            chainId: "bsc",
            dexId: "pancakeswap",
            pairAddress: "0x1010101010101010101010101010101010101010",
            priceUsd: 0.5,
            liquidity: { usd: 1200000 },
            volume: { h24: 150000 },
            baseToken: { address: tokenB, symbol: "B" },
            quoteToken: { address: wbnb, symbol: "WBNB" },
          }];
        }
        if (token === wbnb) {
          return [{
            chainId: "bsc",
            dexId: "pancakeswap",
            pairAddress: "0x3030303030303030303030303030303030303030",
            priceUsd: 600,
            liquidity: { usd: 8000000 },
            volume: { h24: 900000 },
            baseToken: { address: wbnb, symbol: "WBNB" },
            quoteToken: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", symbol: "USDC" },
          }];
        }
        return [];
      },
      async getTokenInfo() {
        return null;
      },
    },
  });

  const routes = await provider.searchTwoHopRoutes({
    tokenAddress: tokenB,
    network: "bsc",
    targetSymbol: "USDT",
  });

  assert.deepEqual(routes, []);
});

test("trade-search ETS-T4: reads network dex config", async () => {
  const bscDexes = getEvmDexConfigs({ network: "bsc" });
  const ethDexes = getEvmDexConfigs({ network: "eth" });

  assert.equal(Array.isArray(bscDexes), true);
  assert.equal(Array.isArray(ethDexes), true);
  assert.equal(bscDexes.length >= 1, true);
  assert.equal(ethDexes.length >= 1, true);
  assert.equal(typeof bscDexes[0].id, "string");
});

test("trade-search ETS-T4: merges pairs from multiple offchain sources", async () => {
  const token = "0x55d398326f99059ff775485246999027b3197955";

  const provider = createEvmDexScreenerTradeProvider({
    offchainSources: [
      {
        id: "source-a",
        async resolvePairs() {
          return [{
            chainId: "bsc",
            dexId: "pancakeswap",
            pairAddress: "0x1111111111111111111111111111111111111111",
            priceUsd: 1,
            liquidity: { usd: 2000000 },
            volume: { h24: 200000 },
            baseToken: { address: token, symbol: "USDT" },
            quoteToken: { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", symbol: "WBNB" },
          }];
        },
      },
      {
        id: "source-b",
        async resolvePairs() {
          return [{
            chainId: "bsc",
            dexId: "biswap",
            pairAddress: "0x2222222222222222222222222222222222222222",
            priceUsd: 1,
            liquidity: { usd: 900000 },
            volume: { h24: 100000 },
            baseToken: { address: token, symbol: "USDT" },
            quoteToken: { address: "0xcccccccccccccccccccccccccccccccccccccccc", symbol: "USDC" },
          }];
        },
      },
    ],
  });

  const items = await provider.searchTradePairs({
    tokenAddress: token,
    network: "bsc",
    limit: 10,
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].extra?.liquidityUsd >= items[1].extra?.liquidityUsd, true);
});

test("trade-search ETS-T4: onchain fallback can be enabled", async () => {
  const token = "0xF89712b7C0b6136E1436a8c4E3f4B9C1a1276dfC";

  const provider = createEvmDexScreenerTradeProvider({
    offchainSources: [{
      id: "source-empty",
      async resolvePairs() {
        return [];
      },
    }],
    enableOnchainFallback: true,
    onchainLiquiditySearcher: async () => ([{
      chainId: "bsc",
      dexId: "onchain-probe",
      pairAddress: "0x3333333333333333333333333333333333333333",
      priceUsd: 0.2,
      liquidity: { usd: 150000 },
      volume: { h24: 20000 },
      baseToken: { address: token, symbol: "TOKEN" },
      quoteToken: { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT" },
    }]),
  });

  const items = await provider.searchTradePairs({
    tokenAddress: token,
    network: "bsc",
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].extra?.dexId, "onchain-probe");
});

test("trade-search ETS-T4: without onchain fallback empty offchain result stays empty", async () => {
  const provider = createEvmDexScreenerTradeProvider({
    offchainSources: [{
      id: "source-empty",
      async resolvePairs() {
        return [];
      },
    }],
    enableOnchainFallback: false,
    onchainLiquiditySearcher: async () => ([{
      chainId: "bsc",
      dexId: "onchain-probe",
      pairAddress: "0x3333333333333333333333333333333333333333",
      priceUsd: 0.2,
      liquidity: { usd: 150000 },
      volume: { h24: 20000 },
      baseToken: { address: "0xc353950E65Ad19D4FC57Ce655Be474831ADC26Cc", symbol: "TOKEN" },
      quoteToken: { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT" },
    }]),
  });

  const items = await provider.searchTradePairs({
    tokenAddress: "0xc353950E65Ad19D4FC57Ce655Be474831ADC26Cc",
    network: "bsc",
  });

  assert.deepEqual(items, []);
});

test("trade-search ETS-T5: onchain getPair is batched by multicall per dex", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const validPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";
  let getPairBatchCount = 0;

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{
      id: "pancakeswap-v2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quotes: ["USDT", "WBNB"],
    }],
  }, {
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};
        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          getPairBatchCount += 1;
          return shape.map((row) => ({
            ...row,
            pairAddress: String(row?.quote?.symbol ?? "") === "WBNB"
              ? validPair
              : "0x0000000000000000000000000000000000000000",
          }));
        }

        return shape.map((row) => ({
          ...row,
          token0: token,
          token1: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
          reserves: [1000n * 10n ** 18n, 2000n * 10n ** 18n, 0],
        }));
      },
    },
  });

  assert.equal(getPairBatchCount, 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, validPair);
  assert.equal(items[0].quoteToken?.symbol, "WBNB");
});

test("trade-search ETS-T5: multicall partial failure is downgraded", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const validPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{
      id: "pancakeswap-v2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quotes: ["USDT", "WBNB"],
    }],
  }, {
    multicall: {
      async call(shape) {
        return shape.map((row) => ({
          ...row,
          pairAddress: String(row?.quote?.symbol ?? "") === "WBNB" ? validPair : null,
        }));
      },
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, validPair);
});

test("trade-search ETS-T6: reserves are batched by multicall and usd metrics are estimated", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const usdt = "0x55d398326f99059ff775485246999027b3197955";
  const validPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";
  let multicallCount = 0;

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{
      id: "pancakeswap-v2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quotes: ["USDT", "WBNB"],
    }],
  }, {
    multicall: {
      async call(shape) {
        multicallCount += 1;
        const first = shape?.[0] ?? {};
        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({
            ...row,
            pairAddress: String(row?.quote?.symbol ?? "") === "USDT"
              ? validPair
              : "0x0000000000000000000000000000000000000000",
          }));
        }

        return shape.map((row) => ({
          ...row,
          token0: token,
          token1: usdt,
          reserves: [1000n * 10n ** 18n, 500n * 10n ** 18n, 0],
        }));
      },
    },
  });

  assert.equal(multicallCount, 3);
  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, validPair);
  assert.equal(items[0].priceUsd, 0.5);
  assert.equal(items[0].liquidity?.usd, 1000);
});

test("trade-search ETS-T6: reserve multicall failure is downgraded", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const validPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{
      id: "pancakeswap-v2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quotes: ["USDT"],
    }],
  }, {
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};
        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({
            ...row,
            pairAddress: validPair,
          }));
        }
        throw new Error("reserve multicall failed");
      },
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, validPair);
  assert.equal(items[0].priceUsd, null);
  assert.equal(items[0].liquidity?.usd, null);
});

test("trade-search ETS-T7: onchain decimals multicall refines usd metrics", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const usdt = "0x55d398326f99059ff775485246999027b3197955";
  const validPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";
  let multicallCount = 0;

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{
      id: "pancakeswap-v2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quotes: ["USDT"],
    }],
  }, {
    multicall: {
      async call(shape) {
        multicallCount += 1;
        const first = shape?.[0] ?? {};

        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({ ...row, pairAddress: validPair }));
        }

        if (Object.prototype.hasOwnProperty.call(first, "candidate")) {
          return shape.map((row) => ({
            ...row,
            token0: token,
            token1: usdt,
            reserves: [2000n * 10n ** 9n, 500n * 10n ** 6n, 0],
          }));
        }

        return shape.map((row) => ({
          ...row,
          decimals: String(row?.tokenAddress).toLowerCase() === token ? 9 : 6,
        }));
      },
    },
  });

  assert.equal(multicallCount, 3);
  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, validPair);
  assert.equal(items[0].priceUsd, 0.25);
  assert.equal(items[0].liquidity?.usd, 1000);
});

test("trade-search ETS-T7: decimals multicall failure degrades gracefully", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const usdt = "0x55d398326f99059ff775485246999027b3197955";
  const validPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{
      id: "pancakeswap-v2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quotes: ["USDT"],
    }],
  }, {
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};

        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({ ...row, pairAddress: validPair }));
        }

        if (Object.prototype.hasOwnProperty.call(first, "candidate")) {
          return shape.map((row) => ({
            ...row,
            token0: token,
            token1: usdt,
            reserves: [2000n * 10n ** 18n, 500n * 10n ** 18n, 0],
          }));
        }

        throw new Error("decimals multicall failed");
      },
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, validPair);
  assert.equal(items[0].priceUsd, 0.25);
  assert.equal(items[0].liquidity?.usd, 1000);
});

test("trade-search ETS-T8: WBNB quote gets USD anchor from WBNB/USDT pair", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const wbnb = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
  const usdt = "0x55d398326f99059ff775485246999027b3197955";
  const tokenWbnbPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";
  const wbnbUsdtPair = "0x4444444444444444444444444444444444444444";

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{
      id: "pancakeswap-v2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quotes: ["USDT", "WBNB"],
    }],
  }, {
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};

        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({
            ...row,
            pairAddress: String(row?.quote?.symbol ?? "") === "WBNB"
              ? tokenWbnbPair
              : "0x0000000000000000000000000000000000000000",
          }));
        }

        if (Object.prototype.hasOwnProperty.call(first, "candidate")) {
          return shape.map((row) => ({
            ...row,
            token0: token,
            token1: wbnb,
            reserves: [200n * 10n ** 18n, 100n * 10n ** 18n, 0],
          }));
        }

        if (Object.prototype.hasOwnProperty.call(first, "anchorPairAddress")) {
          return shape.map((row) => ({
            ...row,
            token0: wbnb,
            token1: usdt,
            reserves: [100n * 10n ** 18n, 50000n * 10n ** 18n, 0],
          }));
        }

        if (Object.prototype.hasOwnProperty.call(first, "anchorSymbol")) {
          return shape.map((row) => ({
            ...row,
            pairAddress: String(row?.anchorSymbol ?? "") === "WBNB" ? wbnbUsdtPair : "0x0000000000000000000000000000000000000000",
          }));
        }

        return shape.map((row) => ({
          ...row,
          decimals: 18,
        }));
      },
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, tokenWbnbPair);
  assert.equal(Math.abs((items[0].priceUsd ?? 0) - 250) < 1e-9, true);
  assert.equal(Math.abs((items[0].liquidity?.usd ?? 0) - 100000) < 1e-6, true);
});

test("trade-search ETS-T8: anchor lookup failure degrades WBNB quote metrics", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const wbnb = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
  const tokenWbnbPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{
      id: "pancakeswap-v2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      quotes: ["USDT", "WBNB"],
    }],
  }, {
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};

        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({
            ...row,
            pairAddress: String(row?.quote?.symbol ?? "") === "WBNB"
              ? tokenWbnbPair
              : "0x0000000000000000000000000000000000000000",
          }));
        }

        if (Object.prototype.hasOwnProperty.call(first, "candidate")) {
          return shape.map((row) => ({
            ...row,
            token0: token,
            token1: wbnb,
            reserves: [200n * 10n ** 18n, 100n * 10n ** 18n, 0],
          }));
        }

        if (Object.prototype.hasOwnProperty.call(first, "anchorPairAddress")) {
          throw new Error("anchor reserve lookup failed");
        }

        if (Object.prototype.hasOwnProperty.call(first, "anchorSymbol")) {
          throw new Error("anchor pair lookup failed");
        }

        return shape.map((row) => ({
          ...row,
          decimals: 18,
        }));
      },
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, tokenWbnbPair);
  assert.equal(items[0].priceUsd, null);
  assert.equal(items[0].liquidity?.usd, null);
});

test("trade-search ETS-T9: decimals cache hit skips decimals multicall on second call", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const usdt = "0x55d398326f99059ff775485246999027b3197955";
  const validPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";
  const decimalsCache = new Map();
  let decimalsBatchCount = 0;

  const baseOptions = {
    decimalsCache,
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};
        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({ ...row, pairAddress: String(row?.quote?.symbol ?? "") === "USDT" ? validPair : "0x0000000000000000000000000000000000000000" }));
        }
        if (Object.prototype.hasOwnProperty.call(first, "candidate")) {
          return shape.map((row) => ({ ...row, token0: token, token1: usdt, reserves: [1000n * 10n ** 18n, 500n * 10n ** 18n, 0] }));
        }
        decimalsBatchCount += 1;
        return shape.map((row) => ({ ...row, decimals: 18 }));
      },
    },
  };

  const input = {
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{ id: "pancakeswap-v2", factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73", quotes: ["USDT"] }],
  };

  await searchOnchainLiquidityPairs(input, baseOptions);
  const countAfterFirst = decimalsBatchCount;

  await searchOnchainLiquidityPairs(input, baseOptions);
  const countAfterSecond = decimalsBatchCount;

  assert.equal(countAfterFirst, 1);
  assert.equal(countAfterSecond, 1, "second call should not trigger decimals multicall when cache is hot");
});

test("trade-search ETS-T9: decimalsCache undefined behaves as before (no cache)", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const usdt = "0x55d398326f99059ff775485246999027b3197955";
  const validPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";
  let decimalsBatchCount = 0;

  const options = {
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};
        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({ ...row, pairAddress: validPair }));
        }
        if (Object.prototype.hasOwnProperty.call(first, "candidate")) {
          return shape.map((row) => ({ ...row, token0: token, token1: usdt, reserves: [1000n * 10n ** 18n, 500n * 10n ** 18n, 0] }));
        }
        decimalsBatchCount += 1;
        return shape.map((row) => ({ ...row, decimals: 18 }));
      },
    },
  };

  const input = {
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{ id: "pancakeswap-v2", factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73", quotes: ["USDT"] }],
  };

  await searchOnchainLiquidityPairs(input, options);
  await searchOnchainLiquidityPairs(input, options);

  assert.equal(decimalsBatchCount, 2, "without cache, each call should query decimals");
});

test("trade-search ETS-T10: anchor fails but anchorPriceResolver provides WBNB price", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const wbnb = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
  const tokenWbnbPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";
  let resolverCalled = false;

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{ id: "pancakeswap-v2", factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73", quotes: ["USDT", "WBNB"] }],
  }, {
    async anchorPriceResolver(symbol) {
      resolverCalled = true;
      if (symbol === "WBNB") return 500;
      return null;
    },
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};
        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({
            ...row,
            pairAddress: String(row?.quote?.symbol ?? "") === "WBNB"
              ? tokenWbnbPair
              : "0x0000000000000000000000000000000000000000",
          }));
        }
        if (Object.prototype.hasOwnProperty.call(first, "candidate")) {
          return shape.map((row) => ({ ...row, token0: token, token1: wbnb, reserves: [200n * 10n ** 18n, 100n * 10n ** 18n, 0] }));
        }
        if (Object.prototype.hasOwnProperty.call(first, "anchorSymbol")) {
          throw new Error("anchor pair lookup failed");
        }
        if (Object.prototype.hasOwnProperty.call(first, "anchorPairAddress")) {
          throw new Error("anchor reserve lookup failed");
        }
        return shape.map((row) => ({ ...row, decimals: 18 }));
      },
    },
  });

  assert.equal(resolverCalled, true);
  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, tokenWbnbPair);
  // 200 token / 100 WBNB * 500 WBNB_USD = 250 priceUsd, liquidity = 100 * 500 * 2 = 100000
  assert.equal(Math.abs((items[0].priceUsd ?? 0) - 250) < 1e-9, true);
  assert.equal(Math.abs((items[0].liquidity?.usd ?? 0) - 100000) < 1e-6, true);
});

test("trade-search ETS-T10: anchorPriceResolver throws, degrades gracefully", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const wbnb = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
  const tokenWbnbPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{ id: "pancakeswap-v2", factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73", quotes: ["USDT", "WBNB"] }],
  }, {
    async anchorPriceResolver() {
      throw new Error("external price source down");
    },
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};
        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({
            ...row,
            pairAddress: String(row?.quote?.symbol ?? "") === "WBNB"
              ? tokenWbnbPair
              : "0x0000000000000000000000000000000000000000",
          }));
        }
        if (Object.prototype.hasOwnProperty.call(first, "candidate")) {
          return shape.map((row) => ({ ...row, token0: token, token1: wbnb, reserves: [200n * 10n ** 18n, 100n * 10n ** 18n, 0] }));
        }
        if (Object.prototype.hasOwnProperty.call(first, "anchorSymbol")) {
          throw new Error("anchor pair lookup failed");
        }
        return shape.map((row) => ({ ...row, decimals: 18 }));
      },
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, tokenWbnbPair);
  assert.equal(items[0].priceUsd, null);
  assert.equal(items[0].liquidity?.usd, null);
});

test("trade-search ETS-T10: no anchorPriceResolver behaves same as before (backward compat)", async () => {
  const token = "0xfc69c8a4192130f5d3295876bec43f22704df1e2";
  const wbnb = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
  const tokenWbnbPair = "0x003a1b73998a41dd0760a000316269ed614fd2c4";

  const items = await searchOnchainLiquidityPairs({
    tokenAddress: token,
    network: "bsc",
    dexConfigs: [{ id: "pancakeswap-v2", factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73", quotes: ["USDT", "WBNB"] }],
  }, {
    multicall: {
      async call(shape) {
        const first = shape?.[0] ?? {};
        if (Object.prototype.hasOwnProperty.call(first, "quote")) {
          return shape.map((row) => ({
            ...row,
            pairAddress: String(row?.quote?.symbol ?? "") === "WBNB"
              ? tokenWbnbPair
              : "0x0000000000000000000000000000000000000000",
          }));
        }
        if (Object.prototype.hasOwnProperty.call(first, "candidate")) {
          return shape.map((row) => ({ ...row, token0: token, token1: wbnb, reserves: [200n * 10n ** 18n, 100n * 10n ** 18n, 0] }));
        }
        if (Object.prototype.hasOwnProperty.call(first, "anchorSymbol")) {
          throw new Error("anchor pair lookup failed");
        }
        return shape.map((row) => ({ ...row, decimals: 18 }));
      },
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].pairAddress, tokenWbnbPair);
  assert.equal(items[0].priceUsd, null);
  assert.equal(items[0].liquidity?.usd, null);
});

