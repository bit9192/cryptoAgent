import test from "node:test";
import assert from "node:assert/strict";

import {
  searchTask,
  searchTaskWithEngine,
  searchAddressAssetsTaskWithEngine,
  searchPortfolioTaskWithEngine,
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

test("searchTaskWithEngine: EVM 地址在未指定网络时按回退顺序命中非空网络", async () => {
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
  assert.deepEqual(calls, ["eth", "bsc"]);
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

test("searchAddressAssetsTaskWithEngine: 只靠 search 接口可返回资产估值与总价值", async () => {
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

  const result = await searchAddressAssetsTaskWithEngine(
    {
      query: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
      network: "mainnet",
      withPrice: true,
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

test("searchPortfolioTaskWithEngine: 聚合分链总价值并输出风险标记", async () => {
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

  const result = await searchPortfolioTaskWithEngine(
    {
      addresses: [
        "0x1111111111111111111111111111111111111111",
        "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
      ],
      withPrice: true,
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
