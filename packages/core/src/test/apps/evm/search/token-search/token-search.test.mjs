import test from "node:test";
import assert from "node:assert/strict";

import {
  createEvmTokenSearchProvider,
  searchToken,
} from "../../../../../apps/evm/search/token-provider.mjs";

test("evm token-search: symbol query returns token candidate", async () => {
  const provider = createEvmTokenSearchProvider();
  const items = await provider.searchToken({
    query: "usdt",
    kind: "auto",
    network: "eth",
  });

  assert.equal(Array.isArray(items), true);
  assert.equal(items.length > 0, true);
  assert.equal(items[0].domain, "token");
  assert.equal(items[0].chain, "evm");
  assert.equal(items[0].network, "eth");
});

test("evm token-search: address query returns matched token", async () => {
  const items = await searchToken({
    query: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    network: "eth",
  });

  assert.equal(items.length > 0, true);
  assert.equal(String(items[0].tokenAddress).toLowerCase(), "0xdac17f958d2ee523a2206206994597c13d831ec7");
});

test("evm token-search: name query supports exact match", async () => {
  const items = await searchToken({
    query: "Tether USD",
    kind: "name",
    network: "eth",
  });

  assert.equal(items.length > 0, true);
  assert.equal(String(items[0].symbol).toUpperCase(), "USDT");
});

test("evm token-search: mixed-case symbol still works", async () => {
  const items = await searchToken({
    query: "UsDt",
    network: "eth",
  });

  assert.equal(items.length > 0, true);
});

test("evm token-search: limit works", async () => {
  const items = await searchToken({
    query: "usdt",
    network: "eth",
    limit: 1,
  });

  assert.equal(items.length <= 1, true);
});

test("evm token-search: empty query degrades to empty result", async () => {
  const items = await searchToken({
    query: "   ",
    network: "eth",
  });

  assert.deepEqual(items, []);
});

test("evm token-search: parser error does not leak sensitive text", async () => {
  const provider = createEvmTokenSearchProvider({
    parseInput() {
      throw new Error("PRIVATE_KEY_PLACEHOLDER");
    },
  });

  const items = await provider.searchToken({
    query: "usdt",
    network: "eth",
    metadata: {
      privateKey: "PRIVATE_KEY_PLACEHOLDER",
    },
  });

  assert.deepEqual(items, []);
});