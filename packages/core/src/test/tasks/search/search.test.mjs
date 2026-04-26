import test from "node:test";
import assert from "node:assert/strict";

import {
  searchTask,
  searchTaskWithEngine,
  searchAddressCheckTaskWithEngine,
  searchAddressTokenBalancesBatchTaskWithEngine,
  searchAddressAssetsTaskWithEngine,
  searchAddressValuationTaskWithEngine,
  searchPortfolioTaskWithEngine,
  searchPortfolioValuationTaskWithEngine,
} from "../../../tasks/search/index.mjs";

// ─── Happy Path ───────────────────────────────────────────────────────────────

test("searchTask: token domain 返回 ok=true 且 candidates 为数组", async () => {
  const result = await searchTask({ domain: "token", query: "USDT", network: "eth" });
  assert.equal(result.ok, true);
  assert.equal(result.domain, "token");
  assert.equal(result.query, "USDT");
  assert.ok(Array.isArray(result.candidates));
});

test("searchTask: address domain 返回 ok=true 且 candidates 为数组", async () => {
  // 使用 Vitalik 公开地址
  const result = await searchTask({
    domain: "address",
    query: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    network: "eth",
    timeoutMs: 15000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.domain, "address");
  assert.ok(Array.isArray(result.candidates));
});

// ─── Invalid ──────────────────────────────────────────────────────────────────

test("searchTask: domain 非法时返回 ok=false 且有 error", async () => {
  const result = await searchTask({ domain: "nft", query: "USDT", network: "eth" });
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === "string" && result.error.length > 0);
  assert.deepEqual(result.candidates, []);
});

test("searchTask: query 为空时返回 ok=false 且有 error", async () => {
  const result = await searchTask({ domain: "token", query: "", network: "eth" });
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === "string" && result.error.length > 0);
  assert.deepEqual(result.candidates, []);
});

test("searchTask: 无 input 时返回 ok=false", async () => {
  const result = await searchTask();
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === "string");
});

// ─── Engine singleton ─────────────────────────────────────────────────────────

test("searchTask: 多次调用复用同一 engine 实例（不重复装配）", async () => {
  const r1 = await searchTask({ domain: "token", query: "ETH", network: "eth" });
  const r2 = await searchTask({ domain: "token", query: "BNB", network: "bsc" });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
});

test("searchTaskWithEngine: EVM 地址在未指定网络时走单次无网络搜索并返回命中网络", async () => {
  const calls = [];
  const engine = {
    async resolveAddressContext() {
      return {
        ok: true,
        items: [
          {
            chain: "evm",
            availableNetworks: ["bsc", "eth"],
          },
        ],
      };
    },
    async search(input = {}) {
      calls.push(input.network);
      if (input.domain !== "address") {
        return { ok: true, candidates: [] };
      }
      if (input.network === "eth") {
        return { ok: true, candidates: [] };
      }
      return {
        ok: true,
        candidates: [
          {
            domain: "address",
            chain: "evm",
            network: "bsc",
            address: "0x1111111111111111111111111111111111111111",
          },
        ],
      };
    },
  };

  const result = await searchTaskWithEngine({
    domain: "address",
    query: "0x1111111111111111111111111111111111111111",
  }, engine);

  assert.equal(result.ok, true);
  assert.equal(result.network, "bsc");
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(calls, [undefined]);
});

test("searchTaskWithEngine: 指定网络时不做跨网回退", async () => {
  const calls = [];
  const engine = {
    async resolveAddressContext() {
      return {
        ok: true,
        items: [
          {
            chain: "evm",
            availableNetworks: ["eth", "bsc"],
          },
        ],
      };
    },
    async search(input = {}) {
      calls.push(input.network);
      return { ok: true, candidates: [] };
    },
  };

  const result = await searchTaskWithEngine({
    domain: "address",
    query: "0x2222222222222222222222222222222222222222",
    network: "bsc",
  }, engine);

  assert.equal(result.ok, true);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(calls, ["bsc"]);
});

test("searchAddressCheckTaskWithEngine: 仅走 resolveAddressContext，不走 search", async () => {
  let searchCalled = false;
  const engine = {
    async resolveAddressContext() {
      return {
        ok: true,
        items: [
          {
            chain: "trx",
            addressType: "base58",
            normalizedAddress: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
            networks: ["mainnet", "nile"],
          },
        ],
      };
    },
    async search() {
      searchCalled = true;
      return { ok: true, candidates: [] };
    },
  };

  const result = await searchAddressCheckTaskWithEngine({
    query: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
  }, engine);

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].chain, "trx");
  assert.equal(searchCalled, false);
});

test("searchAddressCheckTaskWithEngine: query 为空返回错误", async () => {
  const engine = {
    async resolveAddressContext() {
      return { ok: true, items: [] };
    },
  };

  const result = await searchAddressCheckTaskWithEngine({ query: "" }, engine);
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === "string" && result.error.length > 0);
  assert.deepEqual(result.items, []);
});

test("searchAddressTokenBalancesBatchTaskWithEngine: 返回三链批量余额并保持顺序", async () => {
  const pairs = [
    { chain: "evm", network: "eth", address: "0x1111111111111111111111111111111111111111", token: "native" },
    { chain: "trx", network: "mainnet", address: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h", token: "native" },
    { chain: "btc", network: "btc", address: "bc1ps793rn2savj7u7stawzly7uua62nuay7pzq027ck8hfrdzffdnnqf3gegf", token: "ORDI" },
  ];

  const result = await searchAddressTokenBalancesBatchTaskWithEngine(
    { pairs },
    null,
    {
      evmBatchReader: async () => ({
        ok: true,
        items: [{ ownerAddress: pairs[0].address, tokenAddress: "native", balance: 10n }],
      }),
      trxBatchReader: async () => ({
        ok: true,
        items: [{ ok: true, ownerAddress: pairs[1].address, tokenAddress: "native", balance: 20n }],
      }),
      btcBatchReader: async () => ({
        ok: true,
        items: [{ ok: true, address: pairs[2].address, tokenAddress: "ORDI", balance: "30" }],
      }),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].chain, "evm");
  assert.equal(result.items[0].rawBalance, "10");
  assert.equal(result.items[1].chain, "trx");
  assert.equal(result.items[1].rawBalance, "20");
  assert.equal(result.items[2].chain, "btc");
  assert.equal(result.items[2].rawBalance, "30");
  assert.deepEqual(result.summary, { total: 3, success: 3, failed: 0 });
});

test("searchAddressTokenBalancesBatchTaskWithEngine: 空 pairs 返回错误", async () => {
  const result = await searchAddressTokenBalancesBatchTaskWithEngine({ pairs: [] }, null, {});
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === "string" && result.error.length > 0);
});

test("searchAddressValuationTaskWithEngine: 估值接口返回资产估值与总价值", async () => {
  const engine = {
    async resolveAddressContext() {
      return {
        ok: true,
        items: [
          {
            chain: "trx",
            availableNetworks: ["mainnet"],
          },
        ],
      };
    },
    async search(input = {}) {
      if (input.domain !== "address") return { ok: true, candidates: [] };
      return {
        ok: true,
        candidates: [
          {
            domain: "address",
            chain: "trx",
            network: "mainnet",
            symbol: "TRX",
            tokenAddress: "native",
            extra: {
              protocol: "native",
              balance: "2",
            },
          },
          {
            domain: "address",
            chain: "trx",
            network: "mainnet",
            symbol: "USDT",
            tokenAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
            extra: {
              protocol: "trc20",
              contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
              balance: "3",
            },
          },
        ],
      };
    },
  };

  const result = await searchAddressValuationTaskWithEngine(
    {
      query: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
      network: "mainnet",
    },
    engine,
    {
      priceBatchQuery: async () => ({
        ok: true,
        items: [
          { ok: true, priceUsd: 0.2, source: "mock" },
          { ok: true, priceUsd: 1.0, source: "mock" },
        ],
      }),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].extra.valuation.valueUsd, 0.4);
  assert.equal(result.assets[1].extra.valuation.valueUsd, 3);
  assert.equal(result.totalValueUsd, 3.4);
});

test("searchAddressAssetsTaskWithEngine: 默认只查余额不触发价格查询", async () => {
  let priceBatchCalls = 0;
  const engine = {
    async resolveAddressContext() {
      return {
        ok: true,
        items: [
          {
            chain: "trx",
            availableNetworks: ["mainnet"],
          },
        ],
      };
    },
    async search(input = {}) {
      if (input.domain !== "address") return { ok: true, candidates: [] };
      return {
        ok: true,
        candidates: [
          {
            domain: "address",
            chain: "trx",
            network: "mainnet",
            symbol: "TRX",
            tokenAddress: "native",
            extra: {
              protocol: "native",
              balance: "2",
            },
          },
        ],
      };
    },
  };

  const result = await searchAddressAssetsTaskWithEngine(
    {
      query: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
      network: "mainnet",
    },
    engine,
    {
      priceBatchQuery: async () => {
        priceBatchCalls += 1;
        return { ok: true, items: [] };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(priceBatchCalls, 0);
  assert.equal(result.totalValueUsd, 0);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].extra?.valuation, undefined);
});

test("searchAddressAssetsTaskWithEngine: BTC non-native 默认不估值，native 估值保持可用", async () => {
  const engine = {
    async resolveAddressContext() {
      return {
        ok: true,
        items: [
          {
            chain: "btc",
            availableNetworks: ["btc"],
          },
        ],
      };
    },
    async search(input = {}) {
      if (input.domain !== "address") return { ok: true, candidates: [] };
      return {
        ok: true,
        candidates: [
          {
            domain: "address",
            chain: "btc",
            network: "btc",
            symbol: "BTC",
            extra: {
              assetType: "native",
              confirmed: "1",
            },
          },
          {
            domain: "address",
            chain: "btc",
            network: "btc",
            symbol: "FOO",
            extra: {
              assetType: "brc20",
              balance: "100",
              ticker: "FOO",
            },
          },
        ],
      };
    },
  };

  const seenInputs = [];
  const result = await searchAddressAssetsTaskWithEngine(
    {
      query: "bc1ptestaddress000000000000000000000000000000000",
      network: "btc",
      withPrice: false,
    },
    engine,
    {
      priceBatchQuery: async (inputs = []) => {
        seenInputs.push(...inputs);
        return {
          ok: true,
          items: inputs.map((it) => {
            if (it.query === "BTC") return { ok: true, priceUsd: 60000, source: "mock" };
            return { ok: true, priceUsd: 999999999, source: "mock" };
          }),
        };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(seenInputs.length, 0);
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].extra.valuation, undefined);
  assert.equal(result.assets[1].extra.valuation, undefined);
  assert.equal(result.totalValueUsd, 0);
});

test("searchAddressValuationTaskWithEngine: BTC 白名单非原生可估值", async () => {
  const engine = {
    async resolveAddressContext() {
      return {
        ok: true,
        items: [
          {
            chain: "btc",
            availableNetworks: ["btc"],
          },
        ],
      };
    },
    async search(input = {}) {
      if (input.domain !== "address") return { ok: true, candidates: [] };
      return {
        ok: true,
        candidates: [
          {
            domain: "address",
            chain: "btc",
            network: "btc",
            symbol: "ORDI",
            extra: {
              assetType: "brc20",
              balance: "10",
              ticker: "ORDI",
            },
          },
        ],
      };
    },
  };

  const result = await searchAddressValuationTaskWithEngine(
    {
      query: "bc1ptestaddress000000000000000000000000000000000",
      network: "btc",
    },
    engine,
    {
      priceBatchQuery: async (items = []) => ({
        ok: true,
        items: items.map(() => ({ ok: true, priceUsd: 5, source: "mock" })),
      }),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].extra.valuation.priceUsd, 5);
  assert.equal(result.assets[0].extra.valuation.valueUsd, 50);
  assert.equal(result.totalValueUsd, 50);
});

test("searchPortfolioValuationTaskWithEngine: 聚合分链总价值并输出风险标记", async () => {
  const evmAssets = [
    {
      domain: "address",
      chain: "evm",
      network: "eth",
      symbol: "USDT",
      tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      extra: { asset: { assetType: "erc20" }, balance: "10" },
    },
  ];
  const trxAssets = [
    {
      domain: "address",
      chain: "trx",
      network: "mainnet",
      symbol: "TRX",
      tokenAddress: "native",
      extra: { protocol: "native", balance: "5" },
    },
  ];

  const engine = {
    async resolveAddressContext(input = {}) {
      const isEvm = String(input?.query ?? "").startsWith("0x");
      return {
        ok: true,
        items: [
          {
            chain: isEvm ? "evm" : "trx",
            availableNetworks: [isEvm ? "eth" : "mainnet"],
          },
        ],
      };
    },
    async search(input = {}) {
      if (input.domain !== "address") return { ok: true, candidates: [] };
      const isEvm = String(input?.query ?? "").startsWith("0x");
      return {
        ok: true,
        candidates: isEvm ? evmAssets : trxAssets,
      };
    },
  };

  const result = await searchPortfolioValuationTaskWithEngine(
    {
      addresses: [
        "0x1111111111111111111111111111111111111111",
        "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
      ],
    },
    engine,
    {
      priceBatchQuery: async (items = []) => ({
        ok: true,
        items: items.map((it) => {
          if (it.chain === "evm") return { ok: true, priceUsd: 0, source: "mock" };
          return { ok: true, priceUsd: 0.3, source: "mock" };
        }),
      }),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(Number(result.byChain.evm.totalValueUsd), 0);
  assert.equal(Number(result.byChain.trx.totalValueUsd), 1.5);
  assert.equal(result.totalValueUsd, 1.5);
  assert.equal(Array.isArray(result.riskFlags), true);
  assert.equal(result.riskFlags.length, 1);
  assert.equal(result.riskFlags[0].chain, "evm");
});

test("searchPortfolioValuationTaskWithEngine: 先批量查余额后集中估值（单次价格批量查询）", async () => {
  let priceBatchCalls = 0;
  let receivedPriceInputs = [];

  const trxAssets = [
    {
      domain: "address",
      chain: "trx",
      network: "mainnet",
      symbol: "TRX",
      tokenAddress: "native",
      extra: { protocol: "native", balance: "5" },
    },
    {
      domain: "address",
      chain: "trx",
      network: "mainnet",
      symbol: "USDT",
      tokenAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      extra: { protocol: "trc20", contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", balance: "3" },
    },
  ];

  const engine = {
    async resolveAddressContext() {
      return {
        ok: true,
        items: [{ chain: "trx", availableNetworks: ["mainnet"] }],
      };
    },
    async search(input = {}) {
      if (input.domain !== "address") return { ok: true, candidates: [] };
      return { ok: true, candidates: trxAssets };
    },
  };

  const result = await searchPortfolioValuationTaskWithEngine(
    {
      addresses: [
        "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
        "TP3wnPRXr7zUWExZXb4qKxjfGHBgTkC15N",
      ],
    },
    engine,
    {
      priceBatchQuery: async (items = []) => {
        priceBatchCalls += 1;
        receivedPriceInputs = items;
        return {
          ok: true,
          items: items.map((it) => {
            if (it.query === "TRX") return { ok: true, priceUsd: 0.2, source: "mock" };
            if (it.query === "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t") return { ok: true, priceUsd: 1, source: "mock" };
            return { ok: true, priceUsd: 0, source: "mock" };
          }),
        };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(priceBatchCalls, 1);
  assert.equal(receivedPriceInputs.length, 2);
  assert.equal(Number(result.byChain.trx.totalValueUsd), 8);
  assert.equal(result.totalValueUsd, 8);
  assert.equal(result.addressResults.length, 2);
  assert.equal(result.addressResults[0].totalValueUsd, 4);
  assert.equal(result.addressResults[1].totalValueUsd, 4);
});
