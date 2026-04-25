import test from "node:test";
import assert from "node:assert/strict";

import { createBtcTokenSearchProvider } from "../../../../apps/btc/search/token-provider.mjs";

test("btc-token-search: happy 命中本地 BRC20 token - ORDI", async () => {
  const provider = createBtcTokenSearchProvider();
  const result = await provider.searchToken({
    query: "ordi",
    network: "mainnet",
  });

  assert.ok(Array.isArray(result) && result.length > 0);
  const item = result[0];
  assert.equal(item.domain, "token");
  assert.equal(item.chain, "btc");
  assert.equal(item.network, "mainnet");
  assert.equal(item.symbol, "ORDI");
  assert.equal(item.name, "Ordinals");
  assert.ok(item.confidence >= 0.9);
  assert.equal(item.extra.protocol, "brc20");
});

test("btc-token-search: happy 命中本地 BRC20 token - SATS", async () => {
  const provider = createBtcTokenSearchProvider();
  const result = await provider.searchToken({
    query: "sats",
    network: "mainnet",
  });

  assert.ok(Array.isArray(result) && result.length > 0);
  const item = result[0];
  assert.equal(item.symbol, "SATS");
  assert.equal(item.name, "SATS");
});

test("btc-token-search: edge ticker 大小写混输 - ORDI", async () => {
  const provider = createBtcTokenSearchProvider();
  const resultLower = await provider.searchToken({
    query: "ordi",
    network: "mainnet",
  });
  const resultUpper = await provider.searchToken({
    query: "ORDI",
    network: "mainnet",
  });
  const resultMixed = await provider.searchToken({
    query: "OrDi",
    network: "mainnet",
  });

  assert.equal(resultLower[0].id, resultUpper[0].id);
  assert.equal(resultLower[0].id, resultMixed[0].id);
});

test("btc-token-search: edge network 默认到 mainnet", async () => {
  const provider = createBtcTokenSearchProvider();
  const resultWithNetwork = await provider.searchToken({
    query: "ordi",
    network: "mainnet",
  });
  const resultWithoutNetwork = await provider.searchToken({
    query: "ordi",
  });

  assert.equal(resultWithNetwork[0].id, resultWithoutNetwork[0].id);
});

test("btc-token-search: invalid 空 query 应抛错", async () => {
  const provider = createBtcTokenSearchProvider();

  await assert.rejects(
    async () => {
      await provider.searchToken({
        query: "",
        network: "mainnet",
      });
    },
    { message: /query 不能为空/ }
  );
});

test("btc-token-search: invalid 不存在的 token 返回空", async () => {
  const provider = createBtcTokenSearchProvider();
  const result = await provider.searchToken({
    query: "nonexistent_token_xyz",
    network: "mainnet",
  });

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 0);
});

test("btc-token-search: invalid 不支持的 network 返回空", async () => {
  const provider = createBtcTokenSearchProvider();
  const result = await provider.searchToken({
    query: "ordi",
    network: "unsupported_network",
  });

  // 允许返回空或抛错（根据设计）
  assert.ok(result.length === 0 || result instanceof Error);
});

test("btc-token-search: security 错误信息不泄露敏感信息", async () => {
  const mockSearcherWithSecret = {
    protocol: "test",
    async search() {
      const err = new Error("Failed: apiKey=sk_test_secret_12345");
      throw err;
    },
  };

  const provider = createBtcTokenSearchProvider({
    searchers: [mockSearcherWithSecret],
  });

  const result = await provider.searchToken({
    query: "test",
    network: "mainnet",
  });

  // 应该优雅降级返回空数组，而不是泄露错误信息
  assert.equal(Array.isArray(result), true);
});
