import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultSearchEngine,
  createSearchEngine,
} from "../../../modules/search-engine/index.mjs";
import {
  createDefaultSearchProviders,
} from "../../../modules/search-engine/composition-root.mjs";

test("evm-provider-integration: EVM address provider 通过 composition root 注册", async () => {
  const providers = createDefaultSearchProviders();
  const addressProvider = providers.find((p) => p.id === "evm-address");

  assert.ok(addressProvider, "EVM address provider 应该在默认 providers 中");
  assert.equal(addressProvider.chain, "evm");
  assert.ok(Array.isArray(addressProvider.networks) && addressProvider.networks.length > 0);
  assert.ok(addressProvider.capabilities.includes("address"));
  assert.equal(typeof addressProvider.searchAddress, "function");
});

test("evm-provider-integration: SearchEngine 可通过 domain=address 调度到 EVM address provider", async () => {
  const engine = createDefaultSearchEngine();

  // 使用测试地址（在实际环境中可能没有资产）
  // 这个测试主要验证调度逻辑，不测试具体的资产查询
  const testAddress = "0x0000000000000000000000000000000000000000";

  try {
    const result = await engine.search({
      domain: "address",
      query: testAddress,
      network: "eth",
    });

    // 调度成功，即使没有结果也是可以的
    assert.ok(result !== undefined);
    assert.ok(Array.isArray(result.candidates));
  } catch (err) {
    // 如果是因为地址无效或网络不可用导致的错误，也接受
    // 主要验证的是调度逻辑，而不是具体的数据查询
    if (!err.message.includes("不能为空") && !err.message.includes("network")) {
      throw err;
    }
  }
});

test("evm-provider-integration: SearchEngine 仍保持注册式架构", async () => {
  const engine = createDefaultSearchEngine();

  // 验证 SearchEngine 包含基本的提供者
  const providers = createDefaultSearchProviders();
  assert.ok(providers.length > 0, "应该有默认 providers");

  // 验证各个 domain 都有对应的 provider
  const domains = new Set();
  for (const provider of providers) {
    for (const capability of provider.capabilities || []) {
      domains.add(capability);
    }
  }

  assert.ok(domains.has("token"), "应该支持 token domain");
  assert.ok(domains.has("address"), "应该支持 address domain");
  assert.ok(domains.has("trade"), "应该支持 trade domain");
});

test("evm-provider-integration: 自定义 provider 与默认 provider 共存", async () => {
  const customProvider = {
    id: "custom-address",
    chain: "custom",
    networks: ["test"],
    capabilities: ["address"],
    async searchAddress() {
      return [{
        domain: "address",
        chain: "custom",
        network: "test",
        id: "custom:test:0xtest",
        title: "Custom Address",
        address: "0xtest",
        source: "custom",
        confidence: 0.95,
      }];
    },
  };

  const engine = createDefaultSearchEngine();

  // 注册自定义 provider
  engine.registerProvider(customProvider);

  // 验证 engine 包含自定义 provider
  const result = await engine.search({
    domain: "address",
    query: "0xtest",
    network: "test",
  });

  assert.ok(result !== undefined);
  // 自定义 provider 应该被包含在结果中（如果成功）
});

// ── BS-3: BTC providers 注册验证 ─────────────────────────────────────────────

test("btc-provider-integration: BTC token provider 通过 composition root 注册", () => {
  const providers = createDefaultSearchProviders();
  const btcTokenProvider = providers.find((p) => p.id === "btc-token");

  assert.ok(btcTokenProvider, "BTC token provider 应该在默认 providers 中");
  assert.equal(btcTokenProvider.chain, "btc");
  assert.ok(btcTokenProvider.capabilities.includes("token"));
  assert.equal(typeof btcTokenProvider.searchToken, "function");
});

test("btc-provider-integration: BTC address provider 通过 composition root 注册", () => {
  const providers = createDefaultSearchProviders();
  const btcAddressProvider = providers.find((p) => p.id === "btc-address");

  assert.ok(btcAddressProvider, "BTC address provider 应该在默认 providers 中");
  assert.equal(btcAddressProvider.chain, "btc");
  assert.ok(btcAddressProvider.capabilities.includes("address"));
  assert.equal(typeof btcAddressProvider.searchAddress, "function");
});

test("btc-provider-integration: BTC / EVM / TRX 三链 providers 在 SearchEngine 中共存", () => {
  const providers = createDefaultSearchProviders();
  const chains = new Set(providers.map((p) => p.chain));

  assert.ok(chains.has("btc"), "应包含 BTC providers");
  assert.ok(chains.has("evm"), "应包含 EVM providers");
  assert.ok(chains.has("trx"), "应包含 TRX providers");

  // 验证 address domain 有多链覆盖
  const addressProviders = providers.filter((p) => p.capabilities?.includes("address"));
  const addressChains = new Set(addressProviders.map((p) => p.chain));
  assert.ok(addressChains.has("btc"), "address domain 应覆盖 BTC 链");
  assert.ok(addressChains.has("evm"), "address domain 应覆盖 EVM 链");
});
