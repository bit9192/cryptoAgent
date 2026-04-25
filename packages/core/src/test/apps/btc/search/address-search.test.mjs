import test from "node:test";
import assert from "node:assert/strict";

import { classifyBtcAddress } from "../../../../apps/btc/search/address-classifier.mjs";
import { createBtcAddressSearchProvider } from "../../../../apps/btc/search/address-provider.mjs";

// ── 测试地址（持币地址，mainnet）──────────────────────────────────────────────
const P2TR_ADDRESS = "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6";
const P2WPKH_ADDRESS = "bc1qunzhcu9upxmj2e4fhqzjladhmke8j9spm5dlec";

// ── Mock SearchItem 工厂 ──────────────────────────────────────────────────────
function mockNativeItem(address, network) {
  return {
    domain: "address",
    chain: "btc",
    network,
    id: `address:btc:${network}:${address}:native`,
    extra: { assetType: "native", confirmed: 150000, unconfirmed: 0 },
  };
}

function mockBrc20Item(address, network) {
  return {
    domain: "address",
    chain: "btc",
    network,
    id: `address:btc:${network}:${address}:brc20:ordi`,
    extra: { assetType: "brc20", ticker: "ORDI", balance: "1000" },
  };
}

// ── address-classifier.mjs 单元测试 ──────────────────────────────────────────

test("btc-address-classifier: H2-1 Taproot (P2TR) 地址 → addressType=p2tr, capabilities=[native,brc20]", () => {
  const result = classifyBtcAddress(P2TR_ADDRESS);
  assert.equal(result.addressType, "p2tr");
  assert.equal(result.network, "mainnet");
  assert.deepEqual(result.capabilities, ["native", "brc20"]);
  assert.equal(result.address, P2TR_ADDRESS);
  assert.equal(result.originalAddress, P2TR_ADDRESS);
});

test("btc-address-classifier: H2-2 SegWit v0 (P2WPKH) 地址 → addressType=p2wpkh, capabilities=[native]", () => {
  const result = classifyBtcAddress(P2WPKH_ADDRESS);
  assert.equal(result.addressType, "p2wpkh");
  assert.equal(result.network, "mainnet");
  assert.deepEqual(result.capabilities, ["native"]);
  // 无 brc20
  assert.ok(!result.capabilities.includes("brc20"));
});

test("btc-address-classifier: E2-1 未指定 network，从 bc1p 推断 mainnet", () => {
  const result = classifyBtcAddress(P2TR_ADDRESS, null);
  assert.equal(result.network, "mainnet");
  assert.equal(result.sourceNetwork, "mainnet");
});

test("btc-address-classifier: E2-2 指定 network=testnet，地址转换为 tb1p...", () => {
  const result = classifyBtcAddress(P2TR_ADDRESS, "testnet");
  assert.equal(result.network, "testnet");
  assert.ok(result.address.startsWith("tb1p"), `期望 tb1p 开头，实际: ${result.address}`);
  assert.equal(result.originalAddress, P2TR_ADDRESS);
});

// ── address-provider.mjs 集成测试（使用 mock resolver）────────────────────────

function createMockNativeResolver(returnItems) {
  return {
    name: "mock-native",
    async resolve(input) {
      return returnItems ?? [mockNativeItem(input.address, input.network)];
    },
  };
}

function createMockBrc20Resolver(returnItems) {
  return {
    name: "mock-brc20",
    async resolve(input) {
      return returnItems ?? [mockBrc20Item(input.address, input.network)];
    },
  };
}

test("btc-address-search: H2-3 Taproot 地址 → 返回 native + brc20 两类 SearchItem", async () => {
  const provider = createBtcAddressSearchProvider({
    nativeResolver: createMockNativeResolver(),
    brc20Resolver: createMockBrc20Resolver(),
  });

  const result = await provider.searchAddress({ query: P2TR_ADDRESS });

  assert.ok(Array.isArray(result) && result.length === 2, `期望 2 条，实际 ${result.length}`);
  const assetTypes = result.map((item) => item.extra?.assetType);
  assert.ok(assetTypes.includes("native"));
  assert.ok(assetTypes.includes("brc20"));
  result.forEach((item) => {
    assert.equal(item.domain, "address");
    assert.equal(item.chain, "btc");
  });
});

test("btc-address-search: H2-4 P2WPKH 地址 → 只返回 native（BRC20 resolver 不调用）", async () => {
  let brc20Called = false;
  const provider = createBtcAddressSearchProvider({
    nativeResolver: createMockNativeResolver(),
    brc20Resolver: {
      name: "mock-brc20-spy",
      async resolve() {
        brc20Called = true;
        return [];
      },
    },
  });

  const result = await provider.searchAddress({ query: P2WPKH_ADDRESS });

  assert.ok(!brc20Called, "BRC20 resolver 不应被调用");
  assert.ok(Array.isArray(result) && result.length === 1);
  assert.equal(result[0].extra?.assetType, "native");
});

test("btc-address-search: E2-3 无资产时返回空数组，不抛错", async () => {
  const provider = createBtcAddressSearchProvider({
    nativeResolver: createMockNativeResolver([]),
    brc20Resolver: createMockBrc20Resolver([]),
  });

  const result = await provider.searchAddress({ query: P2TR_ADDRESS });
  assert.deepEqual(result, []);
});

test("btc-address-search: I2-1 空 address → 应抛 TypeError", async () => {
  const provider = createBtcAddressSearchProvider({
    nativeResolver: createMockNativeResolver(),
    brc20Resolver: createMockBrc20Resolver(),
  });

  await assert.rejects(
    () => provider.searchAddress({ query: "" }),
    (err) => {
      assert.ok(err instanceof TypeError);
      return true;
    },
  );
});

test("btc-address-search: I2-2 非法 BTC 地址格式 → 应抛错", async () => {
  const provider = createBtcAddressSearchProvider({
    nativeResolver: createMockNativeResolver(),
    brc20Resolver: createMockBrc20Resolver(),
  });

  await assert.rejects(() => provider.searchAddress({ query: "not_a_btc_address" }));
});

test("btc-address-search: I2-3 EVM 地址输入 → 应抛错（格式不兼容）", async () => {
  const provider = createBtcAddressSearchProvider({
    nativeResolver: createMockNativeResolver(),
    brc20Resolver: createMockBrc20Resolver(),
  });

  await assert.rejects(() =>
    provider.searchAddress({ query: "0xdeadbeef1234567890123456789012345678abcd" }),
  );
});

test("btc-address-search: S2-1 resolver 抛错 → aggregator 降级，不透传敏感信息", async () => {
  const provider = createBtcAddressSearchProvider({
    nativeResolver: {
      name: "mock-native-throws",
      async resolve() {
        throw new Error("Network error: apiKey=secret_key_12345 unauthorized");
      },
    },
    brc20Resolver: {
      name: "mock-brc20-throws",
      async resolve() {
        throw new Error("BRC20 error: apiKey=another_secret_key");
      },
    },
  });

  // aggregator 捕获所有 resolver 错误，返回空数组，不抛出
  const result = await provider.searchAddress({ query: P2TR_ADDRESS });
  assert.deepEqual(result, []);
});
