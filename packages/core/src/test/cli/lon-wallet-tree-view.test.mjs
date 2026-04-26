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
        keyName: "alpha",
        chains: [
          { chain: "evm", addresses: [{}, {}] },
          { chain: "btc", addresses: [{}] },
        ],
      },
      {
        keyId: "k2",
        keyName: "beta",
        chains: [{ chain: "trx", addresses: [{}] }],
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
  assert.equal(summary.accounts[0].addresses, 3);
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
