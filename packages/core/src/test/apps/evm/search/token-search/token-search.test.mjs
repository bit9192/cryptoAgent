import test from "node:test";
import assert from "node:assert/strict";

import {
  createEvmTokenSearchProvider,
  searchToken,
  searchTokenBatch,
  resolveTokenNetworks,
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
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "eth",
        tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        symbol: "USDT",
        name: "Tether USD",
      },
    ]),
  });

  const items = await provider.searchToken({
    query: "Tether USD",
    network: "eth",
  });

  assert.equal(items.length > 0, true);
  assert.equal(String(items[0].symbol).toUpperCase(), "USDT");
});

test("evm token-search: name query is filtered when onchain name mismatches", async () => {
  const provider = createEvmTokenSearchProvider({
    metadataSingleReader: async () => ({
      name: "Wrong Name",
      symbol: "USDT",
      decimals: 6,
    }),
  });

  const items = await provider.searchToken({
    query: "Tether USD",
    network: "eth",
  });

  assert.deepEqual(items, []);
});

test("evm token-search: name query keeps item when onchain name matches", async () => {
  const provider = createEvmTokenSearchProvider({
    metadataSingleReader: async () => ({
      name: "tether usd",
      symbol: "USDT",
      decimals: 6,
    }),
  });

  const items = await provider.searchToken({
    query: "Tether USD",
    network: "eth",
  });

  assert.equal(items.length > 0, true);
});

test("evm token-search: auto kind can fallback to name path", async () => {
  const provider = createEvmTokenSearchProvider({
    resolveCandidates: (parsed) => {
      if (parsed.queryKind === "name") {
        return [{
          key: "beto",
          symbol: "BETO",
          name: "Beto",
          decimals: 18,
          address: "0x1111111111111111111111111111111111111111",
        }];
      }
      return [];
    },
    metadataSingleReader: async () => ({
      name: "Beto",
      symbol: "BETO",
      decimals: 18,
    }),
    remoteSymbolFallback: async () => null,
  });

  const items = await provider.searchToken({
    query: "beto",
    network: "bsc",
  });

  assert.equal(items.length > 0, true);
  assert.equal(String(items[0].name).toLowerCase(), "beto");
});

test("evm token-search: mixed-case symbol still works", async () => {
  const items = await searchToken({
    query: "UsDt",
    network: "eth",
  });

  assert.equal(items.length > 0, true);
});

test("evm token-search: bnb on bsc resolves local wbnb alias", async () => {
  const provider = createEvmTokenSearchProvider({
    remoteSymbolFallback: async () => {
      throw new Error("should-not-call-remote");
    },
  });

  const items = await provider.searchToken({
    query: "bnb",
    network: "bsc",
  });

  assert.equal(items.length > 0, true);
  assert.equal(String(items[0].tokenAddress).toLowerCase(), "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c");
  assert.equal(String(items[0].symbol).toUpperCase(), "WBNB");
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

test("evm token-search: batch name query verifies by multicall and filters mismatches", async () => {
  let callCount = 0;
  const provider = createEvmTokenSearchProvider({
    metadataBatchReader: async (items) => {
      callCount += 1;
      return {
        ok: true,
        items: items.map((it) => {
          const tokenAddress = String(it.token).toLowerCase();
          if (tokenAddress === "0xdac17f958d2ee523a2206206994597c13d831ec7") {
            return {
              tokenAddress: it.token,
              name: "Wrong Name",
              symbol: "USDT",
              decimals: 6,
            };
          }
          return {
            tokenAddress: it.token,
            name: "Uniswap",
            symbol: "UNI",
            decimals: 18,
          };
        }),
      };
    },
  });

  const batch = await provider.searchTokenBatch([
    { query: "Tether USD", network: "eth" },
    { query: "Uniswap", network: "eth" },
  ]);

  assert.equal(callCount, 1);
  assert.equal(batch.length, 2);
  assert.deepEqual(batch[0].items, []);
  assert.equal(batch[0].sourceStats.hit, 0);
  assert.equal(batch[0].sourceStats.empty, 1);
  assert.equal(batch[1].items.length > 0, true);
  assert.equal(batch[1].sourceStats.hit, 1);
  assert.equal(batch[1].sourceStats.empty, 0);
});

test("evm token-search: batch auto uses name fallback and multicall verification", async () => {
  let batchCallCount = 0;
  const provider = createEvmTokenSearchProvider({
    resolveCandidates: (parsed) => {
      if (parsed.queryKind === "name") {
        return [{
          key: "beto",
          symbol: "BETO",
          name: "Beto",
          decimals: 18,
          address: "0x2222222222222222222222222222222222222222",
        }];
      }
      return [];
    },
    remoteSymbolFallback: async () => null,
    metadataBatchReader: async (items) => {
      batchCallCount += 1;
      return {
        ok: true,
        items: items.map((it) => ({
          tokenAddress: String(it.token),
          name: "Beto",
          symbol: "BETO",
          decimals: 18,
        })),
      };
    },
  });

  const batch = await provider.searchTokenBatch([
    { query: "beto", network: "bsc" },
  ]);

  assert.equal(batchCallCount, 1);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].queryKind, "name");
  assert.equal(batch[0].items.length, 1);
  assert.equal(String(batch[0].items[0].name).toLowerCase(), "beto");
});

// ETS-5: symbol remote fallback via DexScreener

test("evm token-search: unknown symbol uses remoteSymbolFallback when resolver misses (rf1)", async () => {
  const provider = createEvmTokenSearchProvider({
    remoteSymbolFallback: async (_query, _options) => ({
      address: "0xD533a949740bb3306d119CC777fa900bA034cd52",
      symbol: "CRV",
      name: "Curve DAO Token",
    }),
    metadataSingleReader: async () => null,
  });

  const items = await provider.searchToken({ query: "crv", network: "eth" });

  assert.equal(Array.isArray(items), true);
  assert.equal(items.length >= 1, true);
  assert.equal(items[0].domain, "token");
  assert.equal(items[0].chain, "evm");
  assert.equal(items[0].network, "eth");
  assert.equal(
    String(items[0].tokenAddress).toLowerCase(),
    "0xd533a949740bb3306d119cc777fa900ba034cd52"
  );
});

test("evm token-search: remoteSymbolFallback returning null degrades to empty result (rf2)", async () => {
  const provider = createEvmTokenSearchProvider({
    remoteSymbolFallback: async () => null,
  });

  const items = await provider.searchToken({ query: "nonexistentxyz99", network: "eth" });

  assert.equal(Array.isArray(items), true);
  assert.deepEqual(items, []);
});

test("evm token-search: remoteSymbolFallback throwing degrades silently (rf3)", async () => {
  const provider = createEvmTokenSearchProvider({
    remoteSymbolFallback: async () => { throw new Error("network error"); },
  });

  const items = await provider.searchToken({ query: "failtoken", network: "eth" });

  assert.equal(Array.isArray(items), true);
  assert.deepEqual(items, []);
});

test("evm token-search: remoteSymbolFallback returning invalid address degrades (rf4)", async () => {
  const provider = createEvmTokenSearchProvider({
    remoteSymbolFallback: async () => ({ address: null, symbol: null }),
    metadataSingleReader: async () => null,
  });

  const items = await provider.searchToken({ query: "badtoken", network: "eth" });

  assert.equal(Array.isArray(items), true);
  assert.deepEqual(items, []);
});

// ETS-6: resolveTokenNetworks

const MOCK_AAVE_NETWORKS = [
  { chain: "evm", network: "eth", tokenAddress: "0x7Fc66500c84A76Ad7e9c93437bFC5Ac33E2DDaE9", symbol: "AAVE", name: "Aave Token", source: "coingecko" },
  { chain: "evm", network: "polygon", tokenAddress: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", symbol: "AAVE", name: "Aave", source: "coingecko" },
];

test("evm token-search: resolveTokenNetworks returns multi-network list (rtn-h1)", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => MOCK_AAVE_NETWORKS,
  });

  const result = await provider.resolveTokenNetworks({ query: "aave" });

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length >= 1, true);
  const ethEntry = result.find((r) => r.network === "eth");
  assert.ok(ethEntry, "should have eth entry");
  assert.equal(ethEntry.chain, "evm");
  assert.ok(/^0x[a-fA-F0-9]{40}$/.test(ethEntry.tokenAddress), "eth tokenAddress should be EVM address");
  assert.ok(ethEntry.source, "source field should be present");
});

test("evm token-search: resolveTokenNetworks deduplicates same chain/network (rtn-e1)", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => [
      { chain: "evm", network: "eth", tokenAddress: "0x7Fc66500c84A76Ad7e9c93437bFC5Ac33E2DDaE9", symbol: "AAVE", name: "Aave Token", source: "coingecko" },
      { chain: "evm", network: "eth", tokenAddress: "0x7Fc66500c84A76Ad7e9c93437bFC5Ac33E2DDaE9", symbol: "AAVE", name: "Aave Token", source: "coingecko" },
    ],
  });

  const result = await provider.resolveTokenNetworks({ query: "aave" });

  assert.equal(result.filter((r) => r.network === "eth").length, 1);
});

test("evm token-search: resolveTokenNetworks returns empty when no results (rtn-e2)", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => [],
  });

  const result = await provider.resolveTokenNetworks({ query: "unknownxyz" });

  assert.deepEqual(result, []);
});

test("evm token-search: resolveTokenNetworks degrades silently on error (rtn-i1)", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => { throw new Error("network error"); },
  });

  const result = await provider.resolveTokenNetworks({ query: "failquery" });

  assert.deepEqual(result, []);
});

test("evm token-search: no network returns cross-network list", async () => {
  const calledNetworks = [];
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "eth",
        tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        symbol: "CRV",
        name: "Curve DAO Token",
        source: "coingecko",
      },
      {
        chain: "evm",
        network: "bsc",
        tokenAddress: "0x1111111111111111111111111111111111111111",
        symbol: "CRV",
        name: "Bridged Curve DAO Token (Stargate)",
        source: "coingecko",
      },
    ]),
    metadataBatchReader: async (items, options) => {
      calledNetworks.push(String(options?.network ?? ""));
      return {
        ok: true,
        items: items.map((it) => ({
          tokenAddress: String(it.token),
          symbol: "CRV",
          name: "Curve DAO Token",
          decimals: 18,
        })),
      };
    },
  });

  const items = await provider.searchToken({ query: "crv", limit: 5 });

  assert.equal(items.length, 2);
  assert.equal(items[0].network, "eth");
  assert.equal(items[1].network, "bsc");
  assert.equal(items[0].extra?.metadataSource, "multicall");
  assert.equal(calledNetworks.includes("eth"), true);
  assert.equal(calledNetworks.includes("bsc"), true);
});

test("evm token-search: no network keeps only onchain-verified symbol matches", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "eth",
        tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        symbol: "CRV",
        name: "Curve DAO Token",
        source: "coingecko",
      },
      {
        chain: "evm",
        network: "bsc",
        tokenAddress: "0x1111111111111111111111111111111111111111",
        symbol: "CRV",
        name: "Bridged Curve DAO Token (Stargate)",
        source: "coingecko",
      },
    ]),
    metadataBatchReader: async (items, options) => {
      const network = String(options?.network ?? "");
      return {
        ok: true,
        items: items.map((it) => ({
          tokenAddress: String(it.token),
          symbol: network === "bsc" ? "BAD" : "CRV",
          name: "Curve DAO Token",
          decimals: 18,
        })),
      };
    },
  });

  const items = await provider.searchToken({ query: "crv", limit: 5 });

  assert.equal(items.length, 1);
  assert.equal(items[0].network, "eth");
});

test("evm token-search: explicit network keeps filtered single-network behavior", async () => {
  const provider = createEvmTokenSearchProvider({
    resolveCandidates: () => [],
    remoteSymbolFallback: async (_query, options) => {
      if (String(options?.network).toLowerCase() !== "eth") return null;
      return {
        address: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        symbol: "CRV",
        name: "Curve DAO Token",
      };
    },
  });

  const ethItems = await provider.searchToken({ query: "crv", network: "eth", limit: 5 });
  const bscItems = await provider.searchToken({ query: "crv", network: "bsc", limit: 5 });

  assert.equal(ethItems.length, 1);
  assert.equal(String(ethItems[0].network), "eth");
  assert.equal(bscItems.length, 0);
});

test("evm token-search: no-network mode falls back to single search when resolver fails", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => {
      throw new Error("rate-limit");
    },
  });

  const items = await provider.searchToken({ query: "usdt" });

  assert.equal(items.length > 0, true);
  assert.equal(items[0].network, "eth");
});

test("evm token-search: name-shaped query returns list without kind parameter", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "eth",
        tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        symbol: "CRV",
        name: "Curve DAO Token",
      },
      {
        chain: "evm",
        network: "bsc",
        tokenAddress: "0xc7ae4ab742f6b0b203f6710c87677005bc45ad01",
        symbol: "CRV",
        name: "Bridged Curve DAO Token (Stargate)",
      },
    ]),
    metadataBatchReader: async (items) => ({
      ok: true,
      items: items.map((it) => ({
        tokenAddress: String(it.token),
        symbol: "CRV",
        name: "Curve DAO Token",
        decimals: 18,
      })),
    }),
  });

  const items = await provider.searchToken({ query: "Curve DAO Token", limit: 5 });

  assert.equal(items.length, 2);
  assert.equal(items[0].network, "eth");
  assert.equal(items[1].network, "bsc");
});

test("evm token-search: name-shaped query with network filters list", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "eth",
        tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        symbol: "CRV",
        name: "Curve DAO Token",
      },
      {
        chain: "evm",
        network: "bsc",
        tokenAddress: "0xc7ae4ab742f6b0b203f6710c87677005bc45ad01",
        symbol: "CRV",
        name: "Bridged Curve DAO Token (Stargate)",
      },
    ]),
    metadataSingleReader: async () => ({
      name: "Curve DAO Token",
      symbol: "CRV",
      decimals: 18,
    }),
  });

  const items = await provider.searchToken({ query: "Curve DAO Token", network: "bsc", limit: 5 });

  assert.equal(items.length, 1);
  assert.equal(items[0].network, "bsc");
});

test("evm token-search: invalid kind is ignored and auto-detection still works", async () => {
  const provider = createEvmTokenSearchProvider({
    remoteSymbolFallback: async () => ({
      address: "0xD533a949740bb3306d119CC777fa900bA034cd52",
      symbol: "CRV",
      name: "Curve DAO Token",
    }),
    metadataSingleReader: async () => null,
  });

  const items = await provider.searchToken({ query: "crv", kind: "random-kind", network: "eth" });

  assert.equal(items.length > 0, true);
  assert.equal(String(items[0].symbol).toUpperCase(), "CRV");
});

// ETS-10 tests: cross-network unverified retention

test("evm token-search ETS-10: bsc multicall miss keeps unverified symbol-matched candidate", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "eth",
        tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        symbol: "CRV",
        name: "Curve DAO Token",
        source: "coingecko",
      },
      {
        chain: "evm",
        network: "bsc",
        tokenAddress: "0xc7ae4ab742f6b0b203f6710c87677005bc45ad01",
        symbol: "CRV",
        name: "Bridged Curve DAO Token (Stargate)",
        source: "coingecko",
      },
    ]),
    metadataBatchReader: async (items, options) => {
      if (String(options?.network) === "bsc") {
        return { ok: true, items: [] };
      }
      return {
        ok: true,
        items: items.map((it) => ({
          tokenAddress: String(it.token),
          symbol: "CRV",
          name: "Curve DAO Token",
          decimals: 18,
        })),
      };
    },
  });

  const result = await provider.searchToken({ query: "crv", limit: 10 });

  assert.equal(result.length, 2);

  const ethItem = result.find((it) => it.network === "eth");
  const bscItem = result.find((it) => it.network === "bsc");

  assert.ok(ethItem, "eth item should exist");
  assert.equal(ethItem.extra?.metadataSource, "multicall");
  assert.notEqual(ethItem.extra?.unverified, true);

  assert.ok(bscItem, "bsc item should exist");
  assert.equal(bscItem.extra?.metadataSource, "network-resolver");
  assert.equal(bscItem.extra?.unverified, true);
});

test("evm token-search ETS-10: symbol mismatch does not retain unverified candidate", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "bsc",
        tokenAddress: "0x1111111111111111111111111111111111111111",
        symbol: "XYZ",
        name: "Bad Token",
        source: "coingecko",
      },
    ]),
    metadataBatchReader: async () => ({ ok: true, items: [] }),
    remoteSymbolFallback: async () => null,
  });

  const result = await provider.searchToken({ query: "crv", limit: 10 });

  assert.equal(result.length, 0);
});

test("evm token-search ETS-10: multicall-verified item does not get unverified flag", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "eth",
        tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        symbol: "CRV",
        name: "Curve DAO Token",
        source: "coingecko",
      },
    ]),
    metadataBatchReader: async (items) => ({
      ok: true,
      items: items.map((it) => ({
        tokenAddress: String(it.token),
        symbol: "CRV",
        name: "Curve DAO Token",
        decimals: 18,
      })),
    }),
  });

  const result = await provider.searchToken({ query: "crv", limit: 10 });

  assert.equal(result.length, 1);
  assert.equal(result[0].extra?.metadataSource, "multicall");
  assert.notEqual(result[0].extra?.unverified, true);
});

test("evm token-search ETS-10: name-shaped query does not apply symbol unverified relaxation", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "bsc",
        tokenAddress: "0xc7ae4ab742f6b0b203f6710c87677005bc45ad01",
        symbol: "CRV",
        name: "Bridged Curve DAO Token (Stargate)",
        source: "coingecko",
      },
    ]),
    metadataBatchReader: async () => ({ ok: true, items: [] }),
    remoteSymbolFallback: async () => null,
  });

  // name-shaped query (has spaces) → queryKind=name → unverified relaxation should not apply
  const result = await provider.searchToken({ query: "Curve DAO Token", limit: 10 });

  assert.equal(result.length, 0);
});

// ETS-11 tests: profile filled in cross-network path

test("evm token-search ETS-11: cross-network eth usdt candidate gets profile from local config", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "eth",
        tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        symbol: "USDT",
        name: "Tether USD",
        source: "coingecko",
      },
    ]),
    metadataBatchReader: async (items) => ({
      ok: true,
      items: items.map((it) => ({
        tokenAddress: String(it.token),
        symbol: "USDT",
        name: "Tether USD",
        decimals: 6,
      })),
    }),
  });

  const result = await provider.searchToken({ query: "usdt", limit: 5 });

  assert.equal(result.length >= 1, true);
  const item = result.find((it) => it.network === "eth");
  assert.ok(item, "eth usdt item should exist");
  assert.equal(typeof item.extra.project, "object");
  assert.equal(item.extra.project.website, "https://tether.to");
  assert.equal(typeof item.extra.project.social, "object");
});

test("evm token-search ETS-11: cross-network bsc usdt candidate gets bsc profile", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "bsc",
        tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
        symbol: "USDT",
        name: "Tether USD",
        source: "coingecko",
      },
    ]),
    metadataBatchReader: async (items) => ({
      ok: true,
      items: items.map((it) => ({
        tokenAddress: String(it.token),
        symbol: "USDT",
        name: "Tether USD",
        decimals: 18,
      })),
    }),
  });

  const result = await provider.searchToken({ query: "usdt", limit: 5 });

  assert.equal(result.length >= 1, true);
  const item = result.find((it) => it.network === "bsc");
  assert.ok(item, "bsc usdt item should exist");
  assert.equal(item.extra.project.website, "https://tether.to");
});

test("evm token-search ETS-11: cross-network candidate without profile returns null-safe structure", async () => {
  const provider = createEvmTokenSearchProvider({
    networkResolver: async () => ([
      {
        chain: "evm",
        network: "eth",
        tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        symbol: "CRV",
        name: "Curve DAO Token",
        source: "coingecko",
      },
    ]),
    metadataBatchReader: async (items) => ({
      ok: true,
      items: items.map((it) => ({
        tokenAddress: String(it.token),
        symbol: "CRV",
        name: "Curve DAO Token",
        decimals: 18,
      })),
    }),
  });

  const result = await provider.searchToken({ query: "crv", limit: 5 });

  assert.equal(result.length >= 1, true);
  const item = result[0];
  assert.equal(typeof item.extra.project, "object");
  assert.equal(item.extra.project.website, null);
  assert.deepEqual(Object.keys(item.extra.project.social).sort(), ["discord", "github", "telegram", "twitter"]);
});