import test from "node:test";
import assert from "node:assert/strict";

import { createTronscanAccountTokensSource } from "../../../../../apps/trx/search/sources/tronscan-account-tokens-source.mjs";
import { createTrxAddressSearchProvider } from "../../../../../apps/trx/search/address-provider.mjs";

const MAIN_ADDRESS = "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9";

test("tronscan-holdings: uses TRON-PRO-API-KEY header and normalizes holdings", async () => {
  let observedHeader = null;
  let observedUrl = null;
  const source = createTronscanAccountTokensSource({
    apiKey: "tronscan-key-123",
    fetchImpl: async (url, init = {}) => {
      observedUrl = String(url);
      observedHeader = init?.headers?.["TRON-PRO-API-KEY"] ?? null;
      return {
        ok: true,
        async json() {
          return {
            withPriceTokens: [
              {
                tokenId: "_",
                tokenType: "trc10",
                balance: "1252022877225",
              },
              {
                tokenId: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
                tokenType: "trc20",
                balance: "1230000",
                tokenDecimal: 6,
              },
            ],
          };
        },
      };
    },
  });

  const rows = await source.fetch(MAIN_ADDRESS, { network: "mainnet" });

  assert.equal(observedHeader, "tronscan-key-123");
  assert.match(observedUrl, /apilist\.tronscanapi\.com\/api\/accountv2/);
  assert.deepEqual(rows, [
    {
      contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      rawBalance: 1230000n,
      token: {
        symbol: "",
        name: "",
        decimals: 6,
      },
    },
  ]);
});

test("tronscan-holdings: Tronscan is preferred before v1 and wallet", async () => {
  let v1Called = 0;
  let walletCalled = 0;
  const provider = createTrxAddressSearchProvider({
    v1HoldingsGetter: async () => {
      v1Called += 1;
      return [
        {
          contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
          rawBalance: 9000000n,
        },
      ];
    },
    tronscanHoldingsGetter: async () => ([
      {
        contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        rawBalance: 5000000n,
        token: {
          symbol: "USDT",
          name: "Tether USD",
          decimals: 6,
        },
      },
    ]),
    walletHoldingsGetter: async () => {
      walletCalled += 1;
      return [];
    },
    tokenBookReader: () => ({ tokens: {} }),
    tokenMetadataBatchReader: async () => {
      throw new Error("should not call metadata batch");
    },
  });

  const items = await provider.searchAddress({ address: MAIN_ADDRESS, network: "mainnet" });
  const trc20 = items.find((item) => item.extra?.protocol === "trc20");

  assert.ok(trc20);
  assert.equal(trc20.symbol, "USDT");
  assert.equal(trc20.extra.balance, "5");
  assert.equal(v1Called, 0);
  assert.equal(walletCalled, 0);
});

test("tronscan-holdings: Tronscan failure falls back to v1 holdings", async () => {
  let walletCalled = 0;
  const provider = createTrxAddressSearchProvider({
    v1HoldingsGetter: async () => ([
      {
        contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        rawBalance: 2100000n,
      },
    ]),
    tronscanHoldingsGetter: async () => {
      throw new Error("401 unauthorized");
    },
    walletHoldingsGetter: async () => {
      walletCalled += 1;
      return [];
    },
    tokenBookReader: () => ({ tokens: {} }),
    tokenMetadataBatchReader: async () => ({
      ok: true,
      items: [
        {
          ok: true,
          tokenAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
          symbol: "USDT",
          name: "Tether USD",
          decimals: 6,
        },
      ],
    }),
  });

  const items = await provider.searchAddress({ address: MAIN_ADDRESS, network: "mainnet" });
  const trc20 = items.find((item) => item.extra?.protocol === "trc20");

  assert.ok(trc20);
  assert.equal(trc20.extra.balance, "2.1");
  assert.equal(walletCalled, 0);
});

test("tronscan-holdings: v1 empty then wallet holdings are used", async () => {
  const provider = createTrxAddressSearchProvider({
    v1HoldingsGetter: async () => [],
    tronscanHoldingsGetter: async () => [],
    walletHoldingsGetter: async () => ([
      {
        contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        rawBalance: 3300000n,
      },
    ]),
    tokenBookReader: () => ({ tokens: {} }),
    tokenMetadataBatchReader: async () => ({
      ok: true,
      items: [
        {
          ok: true,
          tokenAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
          symbol: "USDT",
          name: "Tether USD",
          decimals: 6,
        },
      ],
    }),
  });

  const items = await provider.searchAddress({ address: MAIN_ADDRESS, network: "mainnet" });
  const trc20 = items.find((item) => item.extra?.protocol === "trc20");

  assert.ok(trc20);
  assert.equal(trc20.extra.balance, "3.3");
});