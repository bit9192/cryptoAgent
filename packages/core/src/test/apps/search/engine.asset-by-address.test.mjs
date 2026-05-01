import test from "node:test";
import assert from "node:assert/strict";

import { searchAddressWithProviders } from "../../../apps/search/address-search.mjs";
import { createSearchEngine } from "../../../apps/search/engine.mjs";

function createMockAddressProvider({ id, chain, networks, items = [] }) {
  return {
    id,
    chain,
    networks,
    capabilities: ["address"],
    async searchAddress() {
      return items.map((item) => ({
        domain: "address",
        chain,
        network: networks[0],
        address: item.address,
        symbol: item.symbol,
        ...item,
      }));
    },
  };
}

// ── happy: provider 按 chain 分发 ──────────────────────────────────────────
test("engine.asset.byAddress: 按 chain 分发 address provider", async () => {
  const result = await searchAddressWithProviders(
    { address: "0x6Fb8aa6fc6f27e591423009194529aE126660027", chain: "evm", network: "eth" },
    {
      providers: [
        createMockAddressProvider({
          id: "evm-mock",
          chain: "evm",
          networks: ["eth"],
          items: [{ address: "0x6Fb8aa6fc6f27e591423009194529aE126660027", symbol: "USDT" }],
        }),
        createMockAddressProvider({
          id: "btc-mock",
          chain: "btc",
          networks: ["mainnet"],
          items: [{ address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", symbol: "BTC" }],
        }),
      ],
    },
  );

  assert.strictEqual(result.ok, true);
  assert.ok(Array.isArray(result.items));
  // btc provider 不应被命中
  assert.ok(result.items.every((item) => item.chain === "evm"), "只应返回 evm 结果");
  assert.strictEqual(result.sourceStats.total, 1);
  assert.strictEqual(result.sourceStats.hit, 1);
});

// ── happy: 无 chain 过滤，所有 address provider 都执行 ────────────────────
test("engine.asset.byAddress: 无 chain 过滤则所有 provider 均参与", async () => {
  const result = await searchAddressWithProviders(
    { address: "someaddr" },
    {
      providers: [
        createMockAddressProvider({ id: "evm-mock", chain: "evm", networks: ["eth"], items: [{ address: "someaddr", symbol: "X" }] }),
        createMockAddressProvider({ id: "btc-mock", chain: "btc", networks: ["mainnet"], items: [{ address: "someaddr", symbol: "Y" }] }),
      ],
    },
  );

  assert.strictEqual(result.sourceStats.total, 2);
  assert.strictEqual(result.items.length, 2);
});

// ── happy: network 过滤 ────────────────────────────────────────────────────
test("engine.asset.byAddress: network 过滤只选匹配 provider", async () => {
  const result = await searchAddressWithProviders(
    { address: "someaddr", chain: "evm", network: "bsc" },
    {
      providers: [
        createMockAddressProvider({ id: "evm-eth", chain: "evm", networks: ["eth"], items: [{ address: "someaddr", symbol: "A" }] }),
        createMockAddressProvider({ id: "evm-bsc", chain: "evm", networks: ["bsc"], items: [{ address: "someaddr", symbol: "B" }] }),
      ],
    },
  );

  assert.strictEqual(result.sourceStats.total, 1);
  assert.strictEqual(result.items[0].symbol, "B");
});

// ── invalid: 空 address 抛出 TypeError ────────────────────────────────────
test("engine.asset.byAddress: 空 address 抛出 TypeError", async () => {
  await assert.rejects(
    () => searchAddressWithProviders({ address: "" }, { providers: [] }),
    (err) => {
      assert.ok(err instanceof TypeError);
      return true;
    },
  );
});

// ── edge: 无匹配 provider，返回空 items ───────────────────────────────────
test("engine.asset.byAddress: 无匹配 provider 返回空 items", async () => {
  const result = await searchAddressWithProviders(
    { address: "0x6Fb8aa6fc6f27e591423009194529aE126660027", chain: "evm" },
    { providers: [] },
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.items.length, 0);
  assert.strictEqual(result.sourceStats.total, 0);
});

// ── edge: provider 抛错，不影响其他 provider ──────────────────────────────
test("engine.asset.byAddress: provider 抛错时 failed 计数且不影响其他", async () => {
  const result = await searchAddressWithProviders(
    { address: "someaddr" },
    {
      providers: [
        {
          id: "broken",
          chain: "evm",
          networks: ["eth"],
          capabilities: ["address"],
          async searchAddress() { throw new Error("network error"); },
        },
        createMockAddressProvider({ id: "ok", chain: "btc", networks: ["mainnet"], items: [{ address: "someaddr", symbol: "BTC" }] }),
      ],
    },
  );

  assert.strictEqual(result.sourceStats.failed, 1);
  assert.strictEqual(result.sourceStats.success, 1);
  assert.strictEqual(result.items.length, 1);
});

// ── integration: engine.asset.byAddress 可访问 ────────────────────────────
test("engine.asset.byAddress: engine 实例可调用", async () => {
  const engine = createSearchEngine();
  assert.strictEqual(typeof engine.asset.byAddress, "function");
});
