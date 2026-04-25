import test from "node:test";
import assert from "node:assert/strict";

import {
  createEvmTokenSearchProvider,
  searchToken,
  searchTokenBatch,
} from "../../../../../apps/evm/search/token-provider.mjs";
import { evmNetworks } from "../../../../../apps/evm/configs/networks.js";

function expectedMainnetNetworks() {
  return Object.entries(evmNetworks)
    .filter(([, cfg]) => cfg && cfg.isMainnet === true)
    .map(([name]) => String(name).trim())
    .filter(Boolean)
    .sort();
}

test("evm token-search: provider networks are derived from networks config", async () => {
  const provider = createEvmTokenSearchProvider();
  const actual = [...provider.networks].sort();
  const expected = expectedMainnetNetworks();

  assert.deepEqual(actual, expected);
});

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

test("evm token-search: unknown address still returns placeholder candidate", async () => {
  const provider = createEvmTokenSearchProvider({
    metadataSingleReader: async () => {
      throw new Error("not-found");
    },
  });

  const items = await provider.searchToken({
    query: "0x26d21254E5B01979c0831E7310AD1Ba1887dAa8E",
    network: "bsc",
  });

  assert.equal(items.length > 0, true);
  assert.equal(String(items[0].tokenAddress).toLowerCase(), "0x26d21254e5b01979c0831e7310ad1ba1887daa8e");
});

test("evm token-search: address candidate can be enriched by single metadata reader", async () => {
  const provider = createEvmTokenSearchProvider({
    metadataSingleReader: async () => ({
      tokenAddress: "0x26d21254E5B01979c0831E7310AD1Ba1887dAa8E",
      name: "Mock Token",
      symbol: "MOCK",
      decimals: 18,
    }),
  });

  const items = await provider.searchToken({
    query: "0x26d21254E5B01979c0831E7310AD1Ba1887dAa8E",
    network: "bsc",
  });

  assert.equal(items.length > 0, true);
  assert.equal(items[0].name, "Mock Token");
  assert.equal(items[0].symbol, "MOCK");
  assert.equal(items[0].decimals, 18);
  assert.equal(items[0].extra.metadataSource, "single-reader");
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

test("evm token-search: provider exposes batch search interface", async () => {
  const provider = createEvmTokenSearchProvider({
    metadataBatchReader: async () => ({ ok: true, items: [] }),
  });

  const batch = await provider.searchTokenBatch([
    { query: "usdt", network: "eth" },
    { query: "uni", network: "eth" },
  ]);

  assert.equal(Array.isArray(batch), true);
  assert.equal(batch.length, 2);
  assert.equal(Array.isArray(batch[0].items), true);
  assert.equal(Array.isArray(batch[1].items), true);
});

test("evm token-search: project profile is mapped from local config", async () => {
  const items = await searchToken({
    query: "usdt",
    network: "eth",
  });

  assert.equal(items.length > 0, true);
  assert.equal(typeof items[0].extra, "object");
  assert.equal(typeof items[0].extra.project, "object");
  assert.equal(items[0].extra.project.website, "https://tether.to");
  assert.equal(typeof items[0].extra.project.social, "object");
});

test("evm token-search: project profile keeps null-safe shape when config missing", async () => {
  const items = await searchToken({
    query: "weth",
    network: "eth",
  });

  assert.equal(items.length > 0, true);
  const project = items[0].extra.project;
  assert.equal(typeof project, "object");
  assert.equal(project.description, null);
  assert.equal(project.website, null);
  assert.equal(project.docs, null);
  assert.equal(project.logo, null);
  assert.deepEqual(Object.keys(project.social).sort(), ["discord", "github", "telegram", "twitter"]);
});

test("evm token-search: batch metadata uses one multicall reader call per network", async () => {
  let callCount = 0;
  const provider = createEvmTokenSearchProvider({
    metadataBatchReader: async (items) => {
      callCount += 1;
      return {
        ok: true,
        items: items.map((it) => ({
          tokenAddress: String(it.token),
          name: "Onchain Name",
          symbol: "ONC",
          decimals: 18,
        })),
      };
    },
  });

  const batch = await provider.searchTokenBatch([
    { query: "usdt", network: "eth" },
    { query: "uni", network: "eth" },
  ]);

  assert.equal(callCount, 1);
  assert.equal(batch[0].items.length > 0, true);
  assert.equal(batch[0].items[0].extra.metadataSource, "multicall");
  assert.equal(batch[0].items[0].symbol, "ONC");
});

test("evm token-search: batch degrades when one input is invalid", async () => {
  const batch = await searchTokenBatch([
    { query: "usdt", network: "eth" },
    { query: "   ", network: "eth" },
  ], {
    metadataBatchReader: async () => ({ ok: true, items: [] }),
  });

  assert.equal(batch.length, 2);
  assert.equal(batch[0].items.length > 0, true);
  assert.deepEqual(batch[1].items, []);
});