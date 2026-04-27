import test from "node:test";
import assert from "node:assert/strict";

import {
  searchAddressAssetsBatchTaskWithEngine,
} from "../../../tasks/search/index.mjs";

function createMockEngine() {
  return {
    async search(input = {}) {
      const query = String(input?.query ?? "").trim().toLowerCase();
      if (!query || query === "bad") {
        throw new Error("mock search failed");
      }

      const network = String(input?.network ?? "eth").trim() || "eth";
      return {
        candidates: [
          {
            domain: "address",
            id: `address:evm:${network}:${query}:native`,
            title: "ETH",
            chain: "evm",
            network,
            address: query,
            tokenAddress: "native",
            symbol: "ETH",
            source: "mock",
            providerId: "mock-address",
            confidence: 1,
            extra: {
              asset: {
                assetType: "native",
                address: "native",
                symbol: "ETH",
                rawBalance: "1",
                formatted: "1",
                decimals: 18,
              },
            },
          },
        ],
      };
    },
  };
}

test("searchAddressAssetsBatchTaskWithEngine: items 为空时返回错误", async () => {
  const res = await searchAddressAssetsBatchTaskWithEngine({ items: [] }, createMockEngine());

  assert.equal(res.ok, false);
  assert.equal(res.error, "items 不能为空");
  assert.deepEqual(res.summary, { total: 0, success: 0, failed: 0 });
});

test("searchAddressAssetsBatchTaskWithEngine: 缺少 query 会返回参数错误", async () => {
  const res = await searchAddressAssetsBatchTaskWithEngine(
    { items: [{ network: "eth" }] },
    createMockEngine(),
  );

  assert.equal(res.ok, false);
  assert.match(String(res.error), /items\[0\]\.query 不能为空/);
});

test("searchAddressAssetsBatchTaskWithEngine: 批量返回保持输入顺序并统计失败", async () => {
  const res = await searchAddressAssetsBatchTaskWithEngine(
    {
      items: [
        { query: "0x1111111111111111111111111111111111111111", network: "eth" },
        { query: "bad", network: "eth" },
        { query: "0x2222222222222222222222222222222222222222", network: "bsc" },
      ],
    },
    createMockEngine(),
  );

  assert.equal(res.ok, false);
  assert.deepEqual(res.summary, { total: 3, success: 2, failed: 1 });
  assert.equal(Array.isArray(res.items), true);
  assert.equal(res.items.length, 3);

  assert.equal(res.items[0].query, "0x1111111111111111111111111111111111111111");
  assert.equal(res.items[0].ok, true);

  assert.equal(res.items[1].query, "bad");
  assert.equal(res.items[1].ok, false);
  assert.match(String(res.items[1].error), /mock search failed/);

  assert.equal(res.items[2].query, "0x2222222222222222222222222222222222222222");
  assert.equal(res.items[2].ok, true);
  assert.equal(res.items[2].network, "bsc");
});
