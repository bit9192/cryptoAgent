import test from "node:test";
import assert from "node:assert/strict";

import { createPickWalletOps } from "../../../apps/wallet/pick-wallet.mjs";

test("pickWallet: 透传 path，缺失 path 时保持默认匹配", async () => {
  const calls = [];
  const ops = createPickWalletOps({
    getAddressTypes: async () => ({
      ok: true,
      items: [
        { chain: "evm", addressTypes: ["default"] },
        { chain: "btc", addressTypes: ["p2wpkh", "p2tr"] },
      ],
    }),
    getSigner: async () => ({
      async getAddress(options = {}) {
        calls.push(options);
        if (options.addressType) {
          return `${options.addressType}:${options.path ?? "default"}`;
        }
        return `single:${options.path ?? "default"}`;
      },
    }),
  });

  const request = {
    scope: "all",
    selectors: { keyId: "k-1" },
    outps: {
      chains: "all",
    },
  };

  const tree = {
    tree: [
      {
        keyId: "k-1",
        name: "n",
        sourceName: "s",
        keyType: "private",
        sourceType: "import",
        path: "m/44'/60'/0'/0/3",
        addresses: {},
      },
      {
        keyId: "k-1",
        name: "n",
        sourceName: "s",
        keyType: "private",
        sourceType: "import",
        path: null,
        addresses: {},
      },
    ],
  };

  const result = await ops.pickWallet(request, tree);
  assert.equal(result.length, 2);

  // 顺序不固定：按集合断言。
  const normalizedCalls = calls.map((item) => JSON.stringify(item));

  // 有 path 行：evm + 两个 btc typed 都应透传 path
  assert.ok(normalizedCalls.includes(JSON.stringify({ path: "m/44'/60'/0'/0/3" })));
  assert.ok(normalizedCalls.includes(JSON.stringify({ addressType: "p2wpkh", path: "m/44'/60'/0'/0/3" })));
  assert.ok(normalizedCalls.includes(JSON.stringify({ addressType: "p2tr", path: "m/44'/60'/0'/0/3" })));

  // 无 path 行：保持默认，不应强制传 path
  assert.ok(normalizedCalls.includes(JSON.stringify({})));
  assert.ok(normalizedCalls.includes(JSON.stringify({ addressType: "p2wpkh" })));
  assert.ok(normalizedCalls.includes(JSON.stringify({ addressType: "p2tr" })));
});
