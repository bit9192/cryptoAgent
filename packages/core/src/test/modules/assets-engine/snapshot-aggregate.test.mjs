import test from "node:test";
import assert from "node:assert/strict";

import { aggregateAssetSnapshot } from "../../../modules/assets-engine/snapshot-aggregate.mjs";

test("assets-engine: price missing should keep valueUsd null", async () => {
  const res = aggregateAssetSnapshot({
    balances: [
      {
        chain: "evm",
        ownerAddress: "0xabc",
        tokenAddress: "0xtoken-a",
        symbol: "TKA",
        decimals: 6,
        balance: 1500000n,
      },
    ],
    prices: [],
    risks: [],
  });

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].balance, "1.5");
  assert.equal(res.items[0].valueUsd, null);
});

test("assets-engine: duplicate token rows should be merged", async () => {
  const res = aggregateAssetSnapshot({
    balances: [
      {
        chain: "evm",
        ownerAddress: "0xabc",
        tokenAddress: "0xtoken-a",
        symbol: "TKA",
        decimals: 6,
        balance: 1000000n,
      },
      {
        chain: "evm",
        ownerAddress: "0xabc",
        tokenAddress: "0xtoken-a",
        symbol: "TKA",
        decimals: 6,
        balance: 2500000n,
      },
    ],
    prices: [
      { chain: "evm", tokenAddress: "0xtoken-a", priceUsd: 2 },
    ],
    risks: [
      { chain: "evm", tokenAddress: "0xtoken-a", riskLevel: "low", score: 5 },
    ],
  });

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].balanceRaw, 3500000n);
  assert.equal(res.items[0].balance, "3.5");
  assert.equal(res.items[0].valueUsd, 7);
  assert.equal(res.items[0].riskLevel, "low");
});

test("assets-engine: sorting should be stable when value equals", async () => {
  const res = aggregateAssetSnapshot({
    balances: [
      {
        chain: "evm",
        ownerAddress: "0xabc",
        tokenAddress: "0xtoken-a",
        symbol: "TKA",
        decimals: 0,
        balance: 10n,
      },
      {
        chain: "evm",
        ownerAddress: "0xabc",
        tokenAddress: "0xtoken-b",
        symbol: "TKB",
        decimals: 0,
        balance: 10n,
      },
    ],
    prices: [
      { chain: "evm", tokenAddress: "0xtoken-a", priceUsd: 1 },
      { chain: "evm", tokenAddress: "0xtoken-b", priceUsd: 1 },
    ],
  });

  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].tokenAddress, "0xtoken-a");
  assert.equal(res.items[1].tokenAddress, "0xtoken-b");
});
