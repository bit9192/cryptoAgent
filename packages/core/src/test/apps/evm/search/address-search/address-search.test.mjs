import test from "node:test";
import assert from "node:assert/strict";

import {
  queryAddressCheck,
  queryAddressCheckBatch,
  queryAddressBalanceByNetwork,
  queryAddressBalance,
} from "../../../../../apps/evm/search/address-search.mjs";

test("address search: check batch returns type and assets", async () => {
  const list = await queryAddressCheckBatch([
    {
      address: "0x00000000000000000000000000000000000000c1",
      network: "eth",
    },
    {
      address: "0x00000000000000000000000000000000000000a1",
      network: "eth",
    },
  ], {
    addressTypeResolver: async ({ address }) => {
      if (String(address).toLowerCase() === "0x00000000000000000000000000000000000000a1") {
        return "erc20";
      }
      return "eoa";
    },
    assetListResolver: async ({ addressType }) => {
      if (addressType === "erc20") {
        return [];
      }
      return [{ assetType: "erc20", address: "0x00000000000000000000000000000000000000a1", symbol: "AAA", extra: { source: "mock" } }];
    },
  });

  assert.equal(list.ok, true);
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].addressType, "eoa");
  assert.equal(list.items[1].addressType, "erc20");
  assert.equal(list.items[0].assets.length, 2);
  assert.equal(list.items[1].assets.length, 2);
});

test("address search: by-network batch returns balances", async () => {
  const res = await queryAddressBalanceByNetwork([
    {
      address: "0x00000000000000000000000000000000000000c1",
      assets: [
        { assetType: "erc20", address: "0x00000000000000000000000000000000000000a1", symbol: "AAA" },
      ],
    },
    {
      address: "0x00000000000000000000000000000000000000c2",
      assest: [
        { assetType: "erc20", address: "0x00000000000000000000000000000000000000a1", symbol: "AAA" },
      ],
    },
  ], "eth", {
    queryBalanceBatch: async (pairs) => ({
      ok: true,
      items: pairs.map((item, index) => ({
        chain: "evm",
        tokenAddress: item.token,
        ownerAddress: item.address,
        balance: BigInt(index + 1),
      })),
    }),
  });

  assert.equal(res.ok, true);
  assert.equal(res.network, "eth");
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].balances.length, 2);
  assert.equal(res.items[0].balances[0].assetType, "native");
  assert.equal(res.items[0].balances[1].assetType, "erc20");
  assert.equal(res.items[1].balances[1].rawBalance, 4n);
});

test("address search: by-network batch backfills missing token metadata", async () => {
  const res = await queryAddressBalanceByNetwork([
    {
      address: "0x00000000000000000000000000000000000000c1",
      assets: [
        { assetType: "erc20", address: "0x00000000000000000000000000000000000000a1" },
      ],
    },
  ], "bsc", {
    queryBalanceBatch: async (pairs) => ({
      ok: true,
      items: pairs.map((item, index) => ({
        chain: "evm",
        tokenAddress: item.token,
        ownerAddress: item.address,
        balance: BigInt(index + 1),
      })),
    }),
    queryMetadataBatch: async () => ({
      ok: true,
      items: [
        {
          chain: "evm",
          tokenAddress: "0x00000000000000000000000000000000000000A1",
          symbol: "AAA",
          name: "Asset AAA",
          decimals: 18,
        },
      ],
    }),
  });

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].balances[1].symbol, "AAA");
  assert.equal(res.items[0].balances[1].name, "Asset AAA");
  assert.equal(res.items[0].balances[1].decimals, 18);
  assert.equal(res.items[0].balances[1].formatted, "0.000000000000000002");
});

test("address search: mixed-network batch groups by network and keeps order", async () => {
  const networkCalls = [];
  const res = await queryAddressBalance([
    {
      address: "0x00000000000000000000000000000000000000c1",
      network: "eth",
      assets: [
        { assetType: "erc20", address: "0x00000000000000000000000000000000000000a1", symbol: "AAA" },
      ],
    },
    {
      address: "0x00000000000000000000000000000000000000c2",
      network: "bsc",
      assets: [
        { assetType: "erc20", address: "0x00000000000000000000000000000000000000a2", symbol: "BBB" },
      ],
    },
  ], {
    queryBalanceBatch: async (pairs, options) => {
      networkCalls.push(options.network);
      return {
        ok: true,
        items: pairs.map((item) => ({
          chain: "evm",
          tokenAddress: item.token,
          ownerAddress: item.address,
          balance: options.network === "eth" ? 11n : 22n,
        })),
      };
    },
  });

  assert.equal(res.ok, true);
  assert.deepEqual([...new Set(networkCalls)].sort(), ["bsc", "eth"]);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].network, "eth");
  assert.equal(res.items[0].balances[0].rawBalance, 11n);
  assert.equal(res.items[1].network, "bsc");
  assert.equal(res.items[1].balances[0].rawBalance, 22n);
});

test("address search: missing network in mixed batch throws", async () => {
  await assert.rejects(
    async () => await queryAddressBalance([
      { address: "0x00000000000000000000000000000000000000c1", assets: [] },
    ], {}),
    /network/,
  );
});

test("address search: address check degrades to unknown on resolver failure", async () => {
  const row = await queryAddressCheck({
    address: "0x00000000000000000000000000000000000000c1",
    network: "eth",
  }, {
    addressTypeResolver: async () => {
      throw new Error("boom");
    },
  });

  assert.equal(row.ok, true);
  assert.equal(row.addressType, "unknown");
  assert.equal(Array.isArray(row.assets), true);
});

test("address search: queryAddressCheck discovers assets by Alchemy when no custom resolver", async () => {
  const row = await queryAddressCheck({
    address: "0x00000000000000000000000000000000000000c1",
    network: "eth",
  }, {
    includeNative: true,
    alchemyGetAddressAssets: async () => ({
      ok: true,
      assets: [
        {
          network: "eth",
          tokenAddress: "0x00000000000000000000000000000000000000a1",
          symbol: "AAA",
          name: "Asset AAA",
          decimals: 18,
        },
        {
          network: "eth",
          tokenAddress: "invalid-address",
          symbol: "BAD",
        },
      ],
    }),
  });

  assert.equal(row.ok, true);
  assert.equal(Array.isArray(row.assets), true);
  assert.equal(row.assets.length, 2);
  assert.equal(row.assets[0].assetType, "native");
  assert.equal(row.assets[1].address, "0x00000000000000000000000000000000000000A1");
  assert.equal(row.assets[1].symbol, "AAA");
  assert.equal(row.assets[1].extra?.source, "alchemy-data");
});

test("address search: queryAddressCheck degrades when Alchemy fails", async () => {
  const row = await queryAddressCheck({
    address: "0x00000000000000000000000000000000000000c1",
    network: "eth",
  }, {
    includeNative: true,
    alchemyGetAddressAssets: async () => {
      throw new Error("alchemy-down");
    },
  });

  assert.equal(row.ok, true);
  assert.equal(Array.isArray(row.assets), true);
  assert.equal(row.assets.length, 1);
  assert.equal(row.assets[0].assetType, "native");
});

test("address search: queryAddressCheck ignores owner address from Alchemy asset rows", async () => {
  const owner = "0x00000000000000000000000000000000000000c1";
  const row = await queryAddressCheck({
    address: owner,
    network: "bsc",
  }, {
    includeNative: true,
    alchemyGetAddressAssets: async () => ({
      ok: true,
      assets: [
        {
          network: "bsc",
          address: owner,
          contractAddress: "0x00000000000000000000000000000000000000a1",
          symbol: "AAA",
          decimals: 18,
        },
        {
          network: "bsc",
          address: owner,
          symbol: "SHOULD_SKIP",
        },
      ],
    }),
  });

  assert.equal(row.ok, true);
  assert.equal(row.assets.length, 2);
  assert.equal(row.assets[0].assetType, "native");
  assert.equal(row.assets[1].address, "0x00000000000000000000000000000000000000A1");
  assert.equal(row.assets[1].symbol, "AAA");
});
