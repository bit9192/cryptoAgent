import test from "node:test";
import assert from "node:assert/strict";

import { createTokenSearchEngine } from "../../../../modules/search-engine/index.mjs";

test("token-search: happy path 聚合跨链候选并输出 sourceStats", async () => {
  const engine = createTokenSearchEngine({
    providers: [
      {
        id: "btc-local",
        chain: "btc",
        network: "mainnet",
        async search() {
          return [{
            chain: "btc",
            network: "mainnet",
            tokenAddress: "ordi",
            symbol: "ORDI",
            name: "Ordinals",
            confidence: 0.95,
            source: "provider",
          }];
        },
      },
      {
        id: "evm-local",
        chain: "evm",
        network: "eth",
        async search() {
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: "0x1234567890123456789012345678901234567890",
            symbol: "ORDI",
            name: "Ordinals (EVM)",
            confidence: 0.9,
            source: "provider",
          }];
        },
      },
    ],
  });

  const res = await engine.search({ query: "ordi", kind: "symbol" });

  assert.equal(res.ok, true);
  assert.equal(res.queryKind, "symbol");
  assert.equal(res.candidates.length, 2);
  assert.equal(res.sourceStats.total, 2);
  assert.equal(res.sourceStats.success, 2);
  assert.equal(res.sourceStats.failed, 0);
  for (const row of res.candidates) {
    assert.ok(typeof row.chain === "string" && row.chain.length > 0);
    assert.ok(typeof row.network === "string" && row.network.length > 0);
    assert.ok(typeof row.source === "string" && row.source.length > 0);
    assert.ok(typeof row.confidence === "number");
  }
});

test("token-search: edge 去重同链同地址候选", async () => {
  const engine = createTokenSearchEngine({
    providers: [
      {
        id: "p1",
        chain: "evm",
        network: "eth",
        async search() {
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
            symbol: "AAVE",
            name: "Aave",
            confidence: 0.9,
          }];
        },
      },
      {
        id: "p2",
        chain: "evm",
        network: "eth",
        async search() {
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
            symbol: "AAVE",
            name: "Aave",
            confidence: 0.8,
          }];
        },
      },
    ],
  });

  const res = await engine.search({ query: "aave", kind: "symbol" });
  assert.equal(res.ok, true);
  assert.equal(res.candidates.length, 1);
});

test("token-search: edge limit 生效", async () => {
  const engine = createTokenSearchEngine({
    providers: [
      {
        id: "p1",
        chain: "btc",
        network: "mainnet",
        async search() {
          return [
            {
              chain: "btc",
              network: "mainnet",
              tokenAddress: "ordi",
              symbol: "ORDI",
              name: "Ordinals",
              confidence: 0.95,
            },
            {
              chain: "btc",
              network: "mainnet",
              tokenAddress: "sats",
              symbol: "SATS",
              name: "SATS",
              confidence: 0.7,
            },
          ];
        },
      },
      {
        id: "p2",
        chain: "evm",
        network: "eth",
        async search() {
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: "0x1234567890123456789012345678901234567890",
            symbol: "ORDI",
            name: "Ordinals (EVM)",
            confidence: 0.8,
          }];
        },
      },
    ],
  });

  const res = await engine.search({ query: "ordi", kind: "symbol", limit: 1 });
  assert.equal(res.ok, true);
  assert.equal(res.candidates.length, 1);
});

test("token-search: invalid 空 query 抛错", async () => {
  const engine = createTokenSearchEngine();
  await assert.rejects(async () => {
    await engine.search({ query: "   " });
  }, /query 必须是非空字符串/);
});

test("token-search: invalid provider 定义抛错", async () => {
  assert.throws(() => {
    createTokenSearchEngine({
      providers: [{ id: "x" }],
    });
  }, /providers\[0\]\.(chain|network|search) 必须是/);
});

test("token-search: security provider 错误不泄露敏感信息", async () => {
  const engine = createTokenSearchEngine({
    providers: [
      {
        id: "p1",
        chain: "evm",
        network: "eth",
        async search() {
          throw new Error("PRIVATE_KEY_PLACEHOLDER");
        },
      },
    ],
  });

  const res = await engine.search({ query: "aave", kind: "symbol" });
  const raw = JSON.stringify(res);
  assert.equal(res.ok, true);
  assert.equal(res.sourceStats.failed, 1);
  assert.equal(raw.includes("PRIVATE_KEY_PLACEHOLDER"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(res.sourceStats, "errors"), false);
});
