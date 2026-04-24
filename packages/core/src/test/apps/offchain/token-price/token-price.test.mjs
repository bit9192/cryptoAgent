import test from "node:test";
import assert from "node:assert/strict";

import {
  queryTokenPrice,
  queryTokenPriceBatch,
} from "../../../../apps/offchain/token-price/index.mjs";

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
    priceBatchResolver() {
      throw new Error("should not hit remote when cache is fresh");
    },
  });

  assert.equal(second.ok, true);
  assert.equal(second.source, "cache");
  assert.equal(second.priceUsd, 1.01);
  assert.equal(remoteCalls, 1);
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
