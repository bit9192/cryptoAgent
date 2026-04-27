import test from "node:test";
import assert from "node:assert/strict";

import { createWallet } from "../../../apps/wallet/index.mjs";

function createMockEvmProvider(counter) {
  return {
    chain: "evm",
    version: "test",
    operations: ["getAddress"],
    supports(operation) {
      return this.operations.includes(String(operation ?? ""));
    },
    async createSigner(input = {}) {
      return {
        chain: "evm",
        keyId: input.keyId,
        async getAddress(getAddressOptions = {}) {
          counter.count += 1;
          const path = String(getAddressOptions.path ?? "m/44'/60'/0'/0/0");
          const addressType = String(getAddressOptions.addressType ?? "default");
          return `addr:${path}:${addressType}`;
        },
      };
    },
  };
}

test("wallet getSigner: getAddress uses wallet-level cache across signer instances", async () => {
  const wallet = createWallet();
  await wallet.loadDevKeys();

  const listed = await wallet.listKeys();
  const devKey = (listed.items ?? []).find((item) => item.source === "dev");
  assert.ok(devKey?.keyId, "should have at least one dev key");

  await wallet.unlock({ keyId: devKey.keyId, scope: { chain: "evm" }, rebuildTree: false });

  const counter = { count: 0 };
  await wallet.registerProvider({ provider: createMockEvmProvider(counter) });

  const { signer: signer1 } = await wallet.getSigner({ chain: "evm", keyId: devKey.keyId });
  const addr1 = await signer1.getAddress({ path: "m/44'/60'/0'/0/0" });
  assert.equal(addr1, "addr:m/44'/60'/0'/0/0:default");
  assert.equal(counter.count, 1);

  const { signer: signer2 } = await wallet.getSigner({ chain: "evm", keyId: devKey.keyId });
  const addr2 = await signer2.getAddress({ path: "m/44'/60'/0'/0/0" });
  assert.equal(addr2, addr1);
  assert.equal(counter.count, 1, "second call should hit wallet cache");

  const { signer: signer3 } = await wallet.getSigner({ chain: "evm", keyId: devKey.keyId });
  const addr3 = await signer3.getAddress({ path: "m/44'/60'/0'/0/1" });
  assert.equal(addr3, "addr:m/44'/60'/0'/0/1:default");
  assert.equal(counter.count, 2, "different path should miss cache");

  const { signer: signer4 } = await wallet.getSigner({ chain: "evm", keyId: devKey.keyId });
  const addr4 = await signer4.getAddress({ path: "m/44'/60'/0'/0/1", addressType: "special" });
  assert.equal(addr4, "addr:m/44'/60'/0'/0/1:special");
  assert.equal(counter.count, 3, "different addressType should miss cache");

  await wallet.lock({ keyId: devKey.keyId });
  await wallet.unlock({ keyId: devKey.keyId, scope: { chain: "evm" }, rebuildTree: false });

  const { signer: signer5 } = await wallet.getSigner({ chain: "evm", keyId: devKey.keyId });
  const addr5 = await signer5.getAddress({ path: "m/44'/60'/0'/0/0" });
  assert.equal(addr5, "addr:m/44'/60'/0'/0/0:default");
  assert.equal(counter.count, 4, "cache should be cleared after lock+unlock");
});
