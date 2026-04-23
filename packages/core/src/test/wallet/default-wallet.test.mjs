import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultWallet } from "../../apps/default-wallet.mjs";

test("createDefaultWallet: 默认注册 evm/btc/trx 三条链", async () => {
  const wallet = await createDefaultWallet();
  const chains = await wallet.listChains();

  const chainList = chains.items.map((item) => item.chain).sort();
  assert.deepEqual(chainList, ["btc", "evm", "trx"]);
});

test("createDefaultWallet: 创建后可直接 getSigner（无需手动注册 provider）", async () => {
  const wallet = await createDefaultWallet();

  await wallet.loadDevKeys({ names: ["hardhat-account-0"] });
  const listed = await wallet.listKeys();
  const keyId = listed.items[0].keyId;

  await wallet.unlock({ keyId, scope: { chain: "evm" } });

  const signerRes = await wallet.getSigner({ chain: "evm", keyId });
  assert.equal(signerRes.ok, true);

  const address = await signerRes.signer.getAddress();
  assert.equal(typeof address, "string");
  assert.ok(address.startsWith("0x"));
});

test("createDefaultWallet: 支持按需关闭某条链注册", async () => {
  const wallet = await createDefaultWallet({ trx: false });
  const chains = await wallet.listChains();
  const chainList = chains.items.map((item) => item.chain).sort();

  assert.deepEqual(chainList, ["btc", "evm"]);
  const trxSupported = await wallet.supports({ chain: "trx", operation: "getAddress" });
  assert.equal(trxSupported.supported, false);
});
