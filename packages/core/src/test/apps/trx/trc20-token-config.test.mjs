import test from "node:test";
import assert from "node:assert/strict";

import { createTrc20 } from "../../../apps/trx/send.mjs";

test("createTrc20: 支持通过 token key + network 解析默认地址", async () => {
  const signer = {
    async getAddress() {
      return "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
    },
    async signTransaction(tx) {
      return tx;
    },
  };

  const token = createTrc20({
    token: "usdt",
    networkNameOrProvider: "nile",
    signer,
  });

  assert.equal(token.tokenName, "Tether USD");
  assert.equal(token.symbolHint, "USDT");
  assert.equal(token.decimalsHint, 6);
  assert.equal(token.address, "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");
});
