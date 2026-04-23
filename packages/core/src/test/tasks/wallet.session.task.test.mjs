import test from "node:test";
import assert from "node:assert/strict";

import task from "../../tasks/wallet/index.mjs";

function createCtx(input, wallet) {
  return {
    input: () => input,
    wallet,
  };
}

test("wallet:session cache.syncUnlocked imports unlocked non-dev keys", async () => {
  const wallet = {
    async listKeys() {
      return {
        items: [
          { keyId: "k1", name: "a", source: "file", sourceFile: "storage/key/a.enc.json", status: "unlocked" },
          { keyId: "k2", name: "b", source: "dev", sourceFile: "dev", status: "unlocked" },
          { keyId: "k3", name: "c", source: "file", sourceFile: "storage/key/c.enc.json", status: "locked" },
        ],
      };
    },
  };

  const res = await task.run(createCtx({ action: "cache.syncUnlocked", sessionId: "s1" }, wallet));
  assert.equal(res.ok, true);
  assert.equal(res.upserts, 1);
  assert.equal(res.data.counts.keys, 1);
});

test("wallet:session cache.importConfigured stores configured addresses", async () => {
  const wallet = {
    async deriveConfiguredAddresses() {
      return {
        items: [
          {
            keyId: "k1",
            chain: "evm",
            address: "0xAAbbCCdd0011223344556677889900aAbBcCdDeE",
            name: "main-1",
            path: "m/44'/60'/0'/0/1",
            addressType: null,
          },
        ],
        warnings: [],
      };
    },
  };

  const res = await task.run(createCtx({ action: "cache.importConfigured", sessionId: "s2", strict: true }, wallet));
  assert.equal(res.ok, true);
  assert.equal(res.imported, 1);
  assert.equal(res.data.counts.addresses, 1);
  assert.equal(res.data.addresses[0].chain, "evm");
});

test("wallet:session cache.remove removes by name", async () => {
  const wallet = {
    async deriveConfiguredAddresses() {
      return {
        items: [
          { keyId: "k9", chain: "btc", address: "bc1qexample", name: "btc-main", path: "m/84'/0'/0'/0/0", addressType: "p2wpkh" },
        ],
        warnings: [],
      };
    },
  };

  await task.run(createCtx({ action: "cache.importConfigured", sessionId: "s3" }, wallet));
  const removed = await task.run(createCtx({ action: "cache.remove", sessionId: "s3", name: "btc-main" }, wallet));

  assert.equal(removed.ok, true);
  assert.equal(removed.removed, 1);
  assert.equal(removed.data.counts.addresses, 0);
});
