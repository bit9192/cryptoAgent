import test from "node:test";
import assert from "node:assert/strict";

import {
  retrieveWalletKeyCandidates,
  pickAddressQueryFromInputs,
} from "../../../modules/wallet-engine/index.mjs";

function makeWalletStatusForDebug() {
  return {
    keys: [
      { keyId: "k-main", keyName: "main", keyType: "mnemonic", source: "file", status: "unlocked" },
      { keyId: "k-child", keyName: "main-child", keyType: "privateKey", source: "file", status: "unlocked" },
    ],
    addresses: [
      { keyId: "k-child", keyName: "main-child", chain: "evm", address: "0x1111111111111111111111111111111111111111", name: "child-evm" },
    ],
  };
}

test("debug interfaces: keys 检索支持 name 命中主 key", () => {
  const status = makeWalletStatusForDebug();
  const keys = retrieveWalletKeyCandidates({ name: "main", nameExact: true }, status);

  assert.equal(keys.length, 1);
  assert.equal(keys[0].keyId, "k-main");
  assert.equal(keys[0].keyType, "mnemonic");
});

test("debug interfaces: 地址提取支持 key fallback", () => {
  const status = makeWalletStatusForDebug();
  const picked = pickAddressQueryFromInputs(
    [{ name: "main-child" }],
    {
      walletStatus: status,
      keyFilters: { name: "main-child", nameExact: true },
    },
  );

  assert.equal(picked.ok, true);
  assert.equal(picked.source, "wallet-status");
  assert.equal(picked.query, "0x1111111111111111111111111111111111111111");
});

test("debug interfaces: key 命中但无地址返回 NO_ADDRESS_FOR_KEY", () => {
  const status = makeWalletStatusForDebug();
  const picked = pickAddressQueryFromInputs(
    [{ name: "main" }],
    {
      walletStatus: status,
      keyFilters: { name: "main", nameExact: true },
    },
  );

  assert.equal(picked.ok, false);
  assert.equal(picked.errorCode, "NO_ADDRESS_FOR_KEY");
  assert.equal(picked.key.keyId, "k-main");
});
