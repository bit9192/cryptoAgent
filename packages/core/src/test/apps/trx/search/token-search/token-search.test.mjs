import test from "node:test";
import assert from "node:assert/strict";

import { createTrxTokenSearchProvider } from "../../../../../apps/trx/search/token-provider.mjs";

test("trx-token-search: H1-1 symbol 命中 mainnet USDT", async () => {
  const provider = createTrxTokenSearchProvider();
  const items = await provider.searchToken({ query: "usdt", network: "mainnet" });

  assert.ok(Array.isArray(items));
  assert.ok(items.length >= 1);
  assert.equal(items[0].domain, "token");
  assert.equal(items[0].chain, "trx");
  assert.equal(items[0].network, "mainnet");
  assert.equal(items[0].symbol, "USDT");
  assert.equal(items[0].address, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  assert.equal(items[0].source, "config");
  assert.equal(items[0].extra.protocol, "trc20");
  assert.equal(items[0].extra.decimals, 6);
});

test("trx-token-search: H1-3 name 模糊匹配", async () => {
  const provider = createTrxTokenSearchProvider();
  const items = await provider.searchToken({ query: "Tether", network: "mainnet" });

  assert.ok(items.length >= 1);
  assert.equal(items[0].symbol, "USDT");
});

test("trx-token-search: H1-4 contract address 命中", async () => {
  const provider = createTrxTokenSearchProvider();
  const items = await provider.searchToken({
    query: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    network: "mainnet",
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].address, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
});

test("trx-token-search: H1-5 nile 命中 nile USDT", async () => {
  const provider = createTrxTokenSearchProvider();
  const items = await provider.searchToken({ query: "usdt", network: "nile" });

  assert.ok(items.length >= 1);
  assert.equal(items[0].network, "nile");
  assert.equal(items[0].address, "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");
});

test("trx-token-search: E1-1 查询大小写不敏感", async () => {
  const provider = createTrxTokenSearchProvider();
  const a = await provider.searchToken({ query: "usdt", network: "mainnet" });
  const b = await provider.searchToken({ query: "uSdT", network: "mainnet" });
  const c = await provider.searchToken({ query: "USDT", network: "mainnet" });

  assert.equal(a[0].id, b[0].id);
  assert.equal(a[0].id, c[0].id);
});

test("trx-token-search: E1-2 network 默认 mainnet", async () => {
  const provider = createTrxTokenSearchProvider();
  const items = await provider.searchToken({ query: "usdt" });

  assert.ok(items.length >= 1);
  assert.equal(items[0].network, "mainnet");
});

test("trx-token-search: E1-3 limit 生效", async () => {
  const provider = createTrxTokenSearchProvider({
    resolver: {
      async resolve() {
        return [
          { name: "Token A", symbol: "A", decimals: 6, address: "TQ5M9xxxxxxxxxxxxxxxxxxxxxxxxxxxxx1" },
          { name: "Token B", symbol: "B", decimals: 6, address: "TQ5M9xxxxxxxxxxxxxxxxxxxxxxxxxxxxx2" },
        ];
      },
    },
  });

  const items = await provider.searchToken({ query: "token", network: "mainnet", limit: 1 });
  assert.equal(items.length, 1);
});

test("trx-token-search: E1-4 地址大小写不敏感", async () => {
  const provider = createTrxTokenSearchProvider();
  const items = await provider.searchToken({
    query: "tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t",
    network: "mainnet",
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].address, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
});

test("trx-token-search: E1-5 shasta 配置为空时返回 []", async () => {
  const provider = createTrxTokenSearchProvider();
  const items = await provider.searchToken({ query: "usdt", network: "shasta" });

  assert.deepEqual(items, []);
});

test("trx-token-search: I1-1 空 query 抛 TypeError", async () => {
  const provider = createTrxTokenSearchProvider();

  await assert.rejects(
    () => provider.searchToken({ query: "", network: "mainnet" }),
    (err) => err instanceof TypeError,
  );
});

test("trx-token-search: I1-3 无匹配返回 []", async () => {
  const provider = createTrxTokenSearchProvider();
  const items = await provider.searchToken({ query: "nonexistent_token_xyz", network: "mainnet" });

  assert.deepEqual(items, []);
});

test("trx-token-search: S1-1 resolver 抛错时降级 []", async () => {
  const provider = createTrxTokenSearchProvider({
    resolver: {
      async resolve() {
        throw new Error("Internal DB connection: password=secret123");
      },
    },
  });

  const items = await provider.searchToken({ query: "usdt", network: "mainnet" });
  assert.deepEqual(items, []);
});

test("trx-token-search: S1-2 超长 query 不崩溃", async () => {
  const provider = createTrxTokenSearchProvider();
  const longQuery = "x".repeat(512);
  const items = await provider.searchToken({ query: longQuery, network: "mainnet" });

  assert.ok(Array.isArray(items));
});
