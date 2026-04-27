import test from "node:test";
import assert from "node:assert/strict";

import { buildWalletTreeSummary } from "../../cli/lon-wallet-tree-view.mjs";

test("lon wallet-tree view: 输出结构化计数摘要", () => {
  const summary = buildWalletTreeSummary({
    ok: true,
    counts: { accounts: 2, chains: 3, addresses: 4 },
    warnings: ["w1"],
    tree: [
      {
        keyId: "k1",
        name: "alpha",
        keyType: "mnemonic",
        sourceType: "orig",
        path: null,
        addresses: {},
      },
      {
        keyId: "k1",
        name: "alpha-0",
        keyType: "private",
        sourceType: "derive",
        path: "m/44'/60'/0'/0/0",
        addresses: { evm: "0xabc", btc: ["bc1q1"] },
      },
      {
        keyId: "k2",
        name: "beta",
        keyType: "orig",
        sourceType: "orig",
        path: null,
        addresses: { trx: "TRXabc" },
      },
    ],
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.action, "wallet.tree.summary");
  assert.deepEqual(summary.counts, {
    accounts: 2,
    chains: 3,
    addresses: 4,
    warnings: 1,
  });
  assert.equal(summary.accounts.length, 2);
  assert.equal(summary.accounts[0].rows, 2);
  assert.equal(summary.accounts[0].addresses, 2);
  assert.deepEqual(summary.accounts[0].chains, ["btc", "evm"]);
  assert.equal(summary.accounts[1].addresses, 1);
});

test("lon wallet-tree view: 缺省输入回退为零计数", () => {
  const summary = buildWalletTreeSummary(null);

  assert.equal(summary.ok, false);
  assert.equal(summary.counts.accounts, 0);
  assert.equal(summary.counts.chains, 0);
  assert.equal(summary.counts.addresses, 0);
  assert.equal(summary.counts.warnings, 0);
  assert.deepEqual(summary.accounts, []);
});
