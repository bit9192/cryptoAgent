import test from "node:test";
import assert from "node:assert/strict";

import { createTrxAddressSearchProvider } from "../../../../../apps/trx/search/address-provider.mjs";
import { createAddressResolver } from "../../../../../apps/trx/search/address-resolver.mjs";

const MAIN_ADDRESS = "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9";
const NILE_ADDRESS = "TPjzedDEjwSo8MWXe9MCWkPFdnGmEPkDag";
const MAIN_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const NILE_USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

function nativeItem(address, network, balance = "0", exists = true) {
  return {
    domain: "address",
    chain: "trx",
    network,
    id: `address:trx:${network}:${address}:native`,
    title: "TRX (native)",
    symbol: "TRX",
    address,
    source: "trongrid",
    confidence: 0.95,
    extra: {
      protocol: "native",
      balance,
      exists,
    },
  };
}

function trc20Item(address, network, contractAddress, balance = "50", decimals = 6) {
  return {
    domain: "address",
    chain: "trx",
    network,
    id: `address:trx:${network}:${address}:${contractAddress}`,
    title: "Tether USD (USDT)",
    symbol: "USDT",
    address,
    source: "trongrid",
    confidence: 0.9,
    extra: {
      protocol: "trc20",
      contractAddress,
      balance,
      decimals,
    },
  };
}

test("trx-address-search: H2-1 返回 native + trc20", async () => {
  const provider = createTrxAddressSearchProvider({
    resolver: {
      async resolve() {
        return [
          nativeItem(MAIN_ADDRESS, "mainnet", "123.456", true),
          trc20Item(MAIN_ADDRESS, "mainnet", MAIN_USDT, "50.000000", 6),
        ];
      },
    },
  });

  const items = await provider.searchAddress({ address: MAIN_ADDRESS, network: "mainnet" });
  assert.ok(items.length >= 2);
  assert.ok(items.some((i) => i.extra?.protocol === "native"));
  assert.ok(items.some((i) => i.extra?.protocol === "trc20"));
  assert.ok(items.every((i) => i.domain === "address"));
  assert.ok(items.every((i) => i.chain === "trx"));
  assert.ok(items.every((i) => i.network === "mainnet"));
  assert.ok(items.every((i) => i.address === MAIN_ADDRESS));
});

test("trx-address-search: H2-2 native 字段完整", async () => {
  const provider = createTrxAddressSearchProvider({
    resolver: {
      async resolve() {
        return [nativeItem(MAIN_ADDRESS, "mainnet", "200", true)];
      },
    },
  });

  const items = await provider.searchAddress({ address: MAIN_ADDRESS, network: "mainnet" });
  assert.equal(items.length, 1);
  assert.equal(items[0].symbol, "TRX");
  assert.equal(typeof items[0].extra?.balance, "string");
  assert.equal(items[0].extra?.exists, true);
  assert.equal(items[0].source, "trongrid");
});

test("trx-address-search: H2-4 nile 返回 nile usdt", async () => {
  const provider = createTrxAddressSearchProvider({
    resolver: {
      async resolve() {
        return [
          nativeItem(NILE_ADDRESS, "nile", "10", true),
          trc20Item(NILE_ADDRESS, "nile", NILE_USDT, "5.0", 6),
        ];
      },
    },
  });

  const items = await provider.searchAddress({ address: NILE_ADDRESS, network: "nile" });
  const usdt = items.find((i) => i.extra?.protocol === "trc20");
  assert.ok(usdt);
  assert.equal(usdt.extra.contractAddress, NILE_USDT);
  assert.ok(items.every((i) => i.network === "nile"));
});

test("trx-address-search: E2-2 network 默认 mainnet", async () => {
  let observedNetwork = null;
  const provider = createTrxAddressSearchProvider({
    resolver: {
      async resolve(input) {
        observedNetwork = input.network;
        return [nativeItem(input.address, input.network, "1", true)];
      },
    },
  });

  await provider.searchAddress({ address: MAIN_ADDRESS });
  assert.equal(observedNetwork, "mainnet");
});

test("trx-address-search: E2-3 native resolver 失败不影响 trc20", async () => {
  const resolver = createAddressResolver({
    nativeResolver: {
      async resolve() {
        throw new Error("Network timeout");
      },
    },
    trc20Resolver: {
      async resolve(input) {
        return [trc20Item(input.address, input.network, MAIN_USDT, "50", 6)];
      },
    },
  });
  const provider = createTrxAddressSearchProvider({ resolver });

  const items = await provider.searchAddress({ address: MAIN_ADDRESS, network: "mainnet" });
  assert.equal(items.length, 1);
  assert.equal(items[0].extra.protocol, "trc20");
});

test("trx-address-search: E2-4 trc20 resolver 失败不影响 native", async () => {
  const resolver = createAddressResolver({
    nativeResolver: {
      async resolve(input) {
        return [nativeItem(input.address, input.network, "100", true)];
      },
    },
    trc20Resolver: {
      async resolve() {
        throw new Error("TRC20 batch failed");
      },
    },
  });
  const provider = createTrxAddressSearchProvider({ resolver });

  const items = await provider.searchAddress({ address: MAIN_ADDRESS, network: "mainnet" });
  assert.equal(items.length, 1);
  assert.equal(items[0].extra.protocol, "native");
});

test("trx-address-search: I2-1 空 address 抛 TypeError", async () => {
  const provider = createTrxAddressSearchProvider();

  await assert.rejects(
    () => provider.searchAddress({ address: "", network: "mainnet" }),
    (err) => err instanceof TypeError,
  );
});

test("trx-address-search: I2-2 非 TRX 地址抛 TypeError", async () => {
  const provider = createTrxAddressSearchProvider();

  await assert.rejects(
    () => provider.searchAddress({
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      network: "mainnet",
    }),
    (err) => err instanceof TypeError,
  );
});

test("trx-address-search: S2-1 native 抛敏感错误不透传", async () => {
  const resolver = createAddressResolver({
    nativeResolver: {
      async resolve() {
        throw new Error("trongrid apiKey=TG_SECRET_123 unauthorized");
      },
    },
    trc20Resolver: {
      async resolve(input) {
        return [trc20Item(input.address, input.network, MAIN_USDT, "50", 6)];
      },
    },
  });
  const provider = createTrxAddressSearchProvider({ resolver });

  const items = await provider.searchAddress({ address: MAIN_ADDRESS, network: "mainnet" });
  assert.equal(items.length, 1);
  assert.equal(items[0].extra.protocol, "trc20");
  assert.ok(!JSON.stringify(items).includes("TG_SECRET_123"));
});

test("trx-address-search: S2-2 结果不包含私钥字段", async () => {
  const provider = createTrxAddressSearchProvider({
    resolver: {
      async resolve() {
        return [nativeItem(MAIN_ADDRESS, "mainnet", "1", true)];
      },
    },
  });

  const items = await provider.searchAddress({ address: MAIN_ADDRESS, network: "mainnet" });
  const payload = JSON.stringify(items);
  assert.ok(!payload.includes("privateKey"));
  assert.ok(!payload.includes("mnemonic"));
  assert.ok(!payload.includes("seed"));
});
