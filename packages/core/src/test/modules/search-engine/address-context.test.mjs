import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultSearchEngine } from "../../../modules/search-engine/index.mjs";

test("address-context: BTC 地址返回 chain/type/network/provider 信息", async () => {
  const engine = createDefaultSearchEngine();

  const result = await engine.resolveAddressContext({
    query: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].chain, "btc");
  assert.equal(result.items[0].addressType, "p2pkh");
  assert.equal(result.items[0].detectedNetwork, "mainnet");
  assert.equal(result.items[0].providerIds.includes("btc-address"), true);
  assert.equal(result.items[0].availableNetworks.includes("mainnet"), true);
  assert.equal(result.items[0].availableNetworks.includes("testnet"), true);
});

test("address-context: TRX 地址返回 trx 上下文且不混入 BTC", async () => {
  const engine = createDefaultSearchEngine();

  const result = await engine.resolveAddressContext({
    query: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].chain, "trx");
  assert.equal(result.items[0].addressType, "base58");
  assert.equal(result.items[0].providerIds.includes("trx-address"), true);
  assert.equal(result.items[0].providerIds.includes("btc-address"), false);
  assert.equal(result.items[0].availableNetworks.includes("mainnet"), true);
  assert.equal(result.items[0].availableNetworks.includes("nile"), true);
});

test("address-context: EVM 地址返回 evm 上下文与配置网络", async () => {
  const engine = createDefaultSearchEngine();

  const result = await engine.resolveAddressContext({
    query: "0x63320F728777d332a1F1031019481A94144779fB",
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].chain, "evm");
  assert.equal(result.items[0].addressType, "hex");
  assert.equal(result.items[0].normalizedAddress, "0x63320F728777d332a1F1031019481A94144779fB");
  assert.equal(result.items[0].providerIds.includes("evm-address"), true);
  assert.equal(result.items[0].availableNetworks.includes("eth"), true);
  assert.equal(result.items[0].availableNetworks.includes("bsc"), true);
});

test("address-context: 非法输入返回空列表", async () => {
  const engine = createDefaultSearchEngine();

  const result = await engine.resolveAddressContext({
    query: "not-an-address",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.items, []);
});