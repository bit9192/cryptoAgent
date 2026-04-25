import test from "node:test";
import assert from "node:assert/strict";

import { DexScreenerSource } from "../../../apps/offchain/sources/dexscreener/index.mjs";
import { CoinGeckoSource } from "../../../apps/offchain/sources/coingecko/index.mjs";

function makeJsonResponse(data) {
  return {
    ok: true,
    status: 200,
    async json() {
      return data;
    },
  };
}

test("dexscreener getPrice: 使用地址查询并返回最佳交易对价格", async () => {
  const source = new DexScreenerSource();
  await source.init();

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/tokens\//);
    return makeJsonResponse({
      pairs: [
        {
          chainId: "ethereum",
          dexId: "uniswap",
          pairAddress: "0xpair-low",
          priceUsd: "1.00",
          liquidity: { usd: 1000 },
          volume: { h24: 5000 },
        },
        {
          chainId: "ethereum",
          dexId: "uniswap",
          pairAddress: "0xpair-high",
          priceUsd: "1.02",
          liquidity: { usd: 100000 },
          volume: { h24: 20000 },
        },
      ],
    });
  };

  try {
    const out = await source.getPrice("0x1111111111111111111111111111111111111111");
    const price = out["0x1111111111111111111111111111111111111111"];

    assert.equal(price.usd, 1.02);
    assert.equal(price.pairAddress, "0xpair-high");
    assert.equal(price.chainId, "ethereum");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("dexscreener getTokenInfo: 使用关键词搜索并返回 token 信息", async () => {
  const source = new DexScreenerSource();
  await source.init();

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/search\?q=USDT/);
    return makeJsonResponse({
      pairs: [
        {
          chainId: "tron",
          dexId: "sunswap",
          pairAddress: "TPAIR",
          priceUsd: "0.999",
          liquidity: { usd: 2000000 },
          volume: { h24: 3500000 },
          baseToken: { address: "TUSDT", name: "Tether USD", symbol: "USDT" },
          quoteToken: { address: "TTRX", name: "TRON", symbol: "TRX" },
          labels: ["v2"],
        },
      ],
    });
  };

  try {
    const info = await source.getTokenInfo("USDT");
    assert.equal(info.source, "dexscreener");
    assert.equal(info.chainId, "tron");
    assert.equal(info.baseToken.symbol, "USDT");
    assert.equal(info.priceUsd, 0.999);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("dexscreener getPrice: 查询token位于quote侧时返回换算后的USD价格", async () => {
  const source = new DexScreenerSource();
  await source.init();

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/tokens\//);
    return makeJsonResponse({
      pairs: [
        {
          chainId: "bsc",
          dexId: "pancakeswap",
          pairAddress: "0xpair-usdt",
          priceUsd: "13.39",
          priceNative: "13.3998",
          liquidity: { usd: 76160580.12 },
          volume: { h24: 1200000 },
          baseToken: { address: "0xark", name: "ARK", symbol: "ARK" },
          quoteToken: {
            address: "0x55d398326f99059fF775485246999027B3197955",
            name: "Tether USD",
            symbol: "USDT",
          },
        },
      ],
    });
  };

  try {
    const token = "0x55d398326f99059ff775485246999027b3197955";
    const out = await source.getPrice(token);
    const price = out[token];
    assert.equal(price.chainId, "bsc");
    assert.ok(Number.isFinite(price.usd));
    assert.ok(Math.abs(price.usd - 1) < 0.01);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("dexscreener getPairInfo: 返回标准化 pair 数据", async () => {
  const source = new DexScreenerSource();
  await source.init();

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/pairs\/tron\/TPAIR/);
    return makeJsonResponse({
      pairs: [
        {
          chainId: "tron",
          dexId: "sunswap",
          pairAddress: "TPAIR",
          priceUsd: "1.01",
          priceNative: "8.8",
          liquidity: { usd: 3000000 },
          volume: { h24: 4000000 },
          baseToken: { symbol: "USDT" },
          quoteToken: { symbol: "TRX" },
        },
      ],
    });
  };

  try {
    const pair = await source.getPairInfo("tron", "TPAIR");
    assert.equal(pair.chainId, "tron");
    assert.equal(pair.dexId, "sunswap");
    assert.equal(pair.priceUsd, 1.01);
    assert.equal(pair.liquidityUsd, 3000000);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("dexscreener getPrice: symbol 查询应优先精确匹配并按network优先选候选", async () => {
  const source = new DexScreenerSource();
  await source.init();

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/search\?q=arkm/);
    return makeJsonResponse({
      pairs: [
        {
          chainId: "bsc",
          dexId: "pancakeswap",
          pairAddress: "0xbsc-high",
          priceUsd: "2.0",
          liquidity: { usd: 9000000 },
          volume: { h24: 500000 },
          baseToken: { address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", name: "Arkham", symbol: "ARKM" },
          quoteToken: { address: "0x55d398326f99059fF775485246999027B3197955", name: "Tether USD", symbol: "USDT" },
        },
        {
          chainId: "ethereum",
          dexId: "uniswap",
          pairAddress: "0xeth-arkm",
          priceUsd: "1.5",
          liquidity: { usd: 1000000 },
          volume: { h24: 120000 },
          baseToken: { address: "0x6E2a43be0B1d33b726f0CA3b8de60b3482b8b050", name: "Arkham", symbol: "ARKM" },
          quoteToken: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", name: "Tether USD", symbol: "USDT" },
        },
        {
          chainId: "ethereum",
          dexId: "uniswap",
          pairAddress: "0xeth-wrong",
          priceUsd: "0.002",
          liquidity: { usd: 10000000 },
          volume: { h24: 900000 },
          baseToken: { address: "0xEe8268E6996f32De4DB966B5feCFFbD7ed93f512", name: "DARK ELON MUSK", symbol: "DARKMUSK" },
          quoteToken: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", name: "Tether USD", symbol: "USDT" },
        },
      ],
    });
  };

  try {
    const out = await source.getPrice("arkm", { network: "eth" });
    const price = out.arkm;
    assert.equal(price.chainId, "ethereum");
    assert.equal(price.pairAddress, "0xeth-arkm");
    assert.equal(price.usd, 1.5);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("coingecko getPrice: bsc 合约地址可通过 token_price 接口返回价格", async () => {
  const source = new CoinGeckoSource();
  await source.init();

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/simple\/token_price\/binance-smart-chain/);
    assert.match(String(url), /contract_addresses=0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef/);
    return makeJsonResponse({
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef": {
        usd: 0.123,
        usd_24h_change: 1.5,
      },
    });
  };

  try {
    const out = await source.getPrice("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", { network: "bsc" });
    const price = out["0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"];
    assert.equal(price.usd, 0.123);
    assert.equal(price.platform, "binance-smart-chain");
  } finally {
    globalThis.fetch = oldFetch;
  }
});
