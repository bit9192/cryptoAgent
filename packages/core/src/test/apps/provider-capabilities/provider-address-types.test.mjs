import { test } from "node:test";
import assert from "node:assert/strict";

import { createBtcProvider } from "../../../apps/btc/provider.mjs";
import { createTrxProvider } from "../../../apps/trx/provider.mjs";
import { createEvmProvider } from "../../../apps/evm/provider.mjs";

test("provider capabilities: BTC getAddressTypes", () => {
  const provider = createBtcProvider();
  assert.equal(typeof provider.getAddressTypes, "function");

  const types = provider.getAddressTypes();
  assert.ok(Array.isArray(types));
  assert.deepEqual(types, ["p2pkh", "p2sh-p2wpkh", "p2wpkh", "p2tr"]);

  const typesAgain = provider.getAddressTypes();
  assert.deepEqual(typesAgain, types);
  assert.notEqual(typesAgain, types);
});

test("provider capabilities: TRX getAddressTypes", () => {
  const provider = createTrxProvider();
  assert.equal(typeof provider.getAddressTypes, "function");

  const types = provider.getAddressTypes();
  assert.ok(Array.isArray(types));
  assert.deepEqual(types, ["default"]);
});

test("provider capabilities: EVM getAddressTypes", () => {
  const provider = createEvmProvider();
  assert.equal(typeof provider.getAddressTypes, "function");

  const types = provider.getAddressTypes();
  assert.ok(Array.isArray(types));
  assert.deepEqual(types, ["default"]);
});
