import test from "node:test";
import assert from "node:assert/strict";

import { createWallet } from "../../../apps/wallet/index.mjs";
import { createBtcProvider } from "../../../apps/btc/provider.mjs";
import { createTrxProvider } from "../../../apps/trx/provider.mjs";
import { createEvmProvider } from "../../../apps/evm/provider.mjs";

test("wallet.getAddressTypes: 单链与全链查询", async () => {
  const wallet = createWallet();

  await wallet.registerProvider({ provider: createBtcProvider() });
  await wallet.registerProvider({ provider: createTrxProvider() });
  await wallet.registerProvider({ provider: createEvmProvider() });

  const btc = await wallet.getAddressTypes({ chain: "btc" });
  assert.equal(btc.ok, true);
  assert.equal(btc.chain, "btc");
  assert.deepEqual(btc.addressTypes, ["p2pkh", "p2sh-p2wpkh", "p2wpkh", "p2tr"]);

  const all = await wallet.getAddressTypes();
  assert.equal(all.ok, true);
  assert.ok(Array.isArray(all.items));

  const byChain = new Map(all.items.map((item) => [item.chain, item.addressTypes]));
  assert.deepEqual(byChain.get("btc"), ["p2pkh", "p2sh-p2wpkh", "p2wpkh", "p2tr"]);
  assert.deepEqual(byChain.get("trx"), ["default"]);
  assert.deepEqual(byChain.get("evm"), ["default"]);

  await assert.rejects(
    () => wallet.getAddressTypes({ chain: "unknown" }),
    /chain provider 未注册/i,
  );
});

test("wallet.getAddressTypes: provider 无方法时默认回退 default", async () => {
  const wallet = createWallet();

  await wallet.registerProvider({
    provider: {
      chain: "mock",
      version: "1.0.0",
      operations: [],
      supports() {
        return false;
      },
      async createSigner() {
        throw new Error("not used");
      },
    },
  });

  const result = await wallet.getAddressTypes({ chain: "mock" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.addressTypes, ["default"]);
});
