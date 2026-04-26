import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import task from "../../tasks/wallet/index.mjs";

function createCtx(input, wallet) {
  return {
    input: () => input,
    wallet,
  };
}

test("wallet:session wallet.deriveConfigured stores configured addresses", async () => {
  await task.run(createCtx({ action: "wallet.clear" }, {}));
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

  const res = await task.run(createCtx({ action: "wallet.deriveConfigured" }, wallet));
  assert.equal(res.ok, true);
  assert.equal(res.syncedKeys, 1);
  assert.equal(res.imported, 1);
  assert.equal(res.data.counts.keys, 1);
  assert.equal(res.data.counts.addresses, 1);
  assert.equal(res.data.addresses[0].chain, "evm");
});

test("wallet:session wallet.clear clears cached data", async () => {
  await task.run(createCtx({ action: "wallet.clear" }, {}));
  const wallet = {
    async listKeys() {
      return {
        items: [
          { keyId: "k9", name: "main", source: "file", sourceFile: "storage/key/main.enc.json", status: "unlocked" },
        ],
      };
    },
    async deriveConfiguredAddresses() {
      return {
        items: [
          { keyId: "k9", chain: "btc", address: "bc1qexample", name: "btc-main", path: "m/84'/0'/0'/0/0", addressType: "p2wpkh" },
        ],
        warnings: [],
      };
    },
  };

  const derived = await task.run(createCtx({ action: "wallet.deriveConfigured" }, wallet));
  assert.equal(derived.ok, true);
  assert.equal(derived.data.counts.addresses, 1);

  const cleared = await task.run(createCtx({ action: "wallet.clear" }, wallet));
  assert.equal(cleared.ok, true);
  assert.equal(cleared.data.counts.keys, 0);
  assert.equal(cleared.data.counts.addresses, 0);
});

test("wallet:session wallet.clear also clears wallet unlock sessions", async () => {
  await task.run(createCtx({ action: "wallet.clear" }, {}));
  let lockAllCalled = 0;

  const wallet = {
    async lockAll() {
      lockAllCalled += 1;
      return { ok: true, count: 2 };
    },
  };

  const cleared = await task.run(createCtx({ action: "wallet.clear" }, wallet));
  assert.equal(cleared.ok, true);
  assert.equal(lockAllCalled, 1);
  assert.equal(cleared.data.counts.keys, 0);
  assert.equal(cleared.data.counts.addresses, 0);
});

test("wallet:session wallet.unlock requires interactive flow", async () => {
  await task.run(createCtx({ action: "wallet.clear" }, {}));
  const wallet = {
    async listKeys() {
      return { items: [] };
    },
  };

  const res = await task.run(createCtx({ action: "wallet.unlock" }, wallet));
  assert.equal(res.ok, false);
  assert.match(String(res.message ?? ""), /不支持交互选择/);
});

test("wallet:session wallet.unlock uses select + password and upserts key cache", async () => {
  await task.run(createCtx({ action: "wallet.clear" }, {}));
  const cwd = process.cwd();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wallet-unlock-task-"));
  const keyDir = path.join(root, "storage", "key");
  const walletFile = path.join(keyDir, "demo.enc.json");

  await fs.mkdir(keyDir, { recursive: true });
  await fs.writeFile(walletFile, "{}", "utf8");

  process.chdir(root);
  try {
    const wallet = {
      async listKeys() {
        return { items: [] };
      },
      async loadKeyFile() {
        return {
          ok: true,
          addedKeyIds: ["k-unlock-1"],
          skippedKeyIds: [],
          warnings: [],
        };
      },
      async unlock() {
        return {
          ok: true,
          unlockedAt: "2026-01-01T00:00:00.000Z",
          expiresAt: null,
          scope: "session",
        };
      },
      async getKeyMeta() {
        return {
          item: {
            keyId: "k-unlock-1",
            name: "demo-key",
            type: "mnemonic",
            source: "file",
            sourceFile: "storage/key/demo.enc.json",
          },
        };
      },
    };

    const ctx = {
      input: () => ({ action: "wallet.unlock" }),
      wallet,
      async interact(opts) {
        if (opts?.type === "wallet.unlock.select") {
          return { payload: { fileAbs: walletFile } };
        }
        if (opts?.type === "wallet.password.input") {
          return { payload: { password: "123456" } };
        }
        return { payload: {} };
      },
    };

    const res = await task.run(ctx);

    assert.equal(res.ok, true);
    assert.equal(res.action, "wallet.unlock");
    assert.equal(res.selected.shortName, "demo");
    assert.equal(res.data.counts.keys, 1);
    assert.equal(res.data.keys[0].keyId, "k-unlock-1");
  } finally {
    process.chdir(cwd);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("wallet:session wallet.tree builds minimal tree from cached session", async () => {
  await task.run(createCtx({ action: "wallet.clear" }, {}));
  const wallet = {
    async listKeys() {
      return {
        items: [
          { keyId: "k1", name: "alpha", source: "file", sourceFile: "storage/key/a.enc.json", status: "unlocked" },
          { keyId: "k2", name: "beta", source: "file", sourceFile: "storage/key/b.enc.json", status: "unlocked" },
        ],
      };
    },
    async deriveConfiguredAddresses() {
      return {
        items: [
          { keyId: "k1", chain: "evm", address: "0xabc", name: "e1", path: "m/44'/60'/0'/0/0", addressType: null },
          { keyId: "k1", chain: "btc", address: "bc1qabc", name: "b1", path: "m/84'/0'/0'/0/0", addressType: "p2wpkh" },
          { keyId: "k2", chain: "trx", address: "TRXabc", name: "t1", path: "m/44'/195'/0'/0/0", addressType: null },
        ],
        warnings: [],
      };
    },
  };

  const derived = await task.run(createCtx({ action: "wallet.deriveConfigured" }, wallet));
  assert.equal(derived.ok, true);

  const treeRes = await task.run(createCtx({ action: "wallet.tree" }, wallet));
  assert.equal(treeRes.ok, true);
  assert.equal(treeRes.action, "wallet.tree");
  assert.equal(treeRes.counts.accounts, 2);
  assert.equal(treeRes.counts.addresses, 3);
  assert.equal(Array.isArray(treeRes.tree), true);
});

test("wallet:session wallet.inputs.set/show/clear works with scope data", async () => {
  await task.run(createCtx({ action: "wallet.inputs.clear" }, {}));

  const setRes = await task.run(createCtx({
    action: "wallet.inputs.set",
    scope: "wallet",
    data: {
      keyId: "k1",
      chain: "evm",
      address: "0xabc",
    },
  }, {}));

  assert.equal(setRes.ok, true);
  assert.equal(setRes.action, "wallet.inputs.set");
  assert.equal(setRes.item.scope, "wallet");

  const showRes = await task.run(createCtx({ action: "wallet.inputs.show", scope: "wallet" }, {}));
  assert.equal(showRes.ok, true);
  assert.equal(showRes.action, "wallet.inputs.show");
  assert.equal(showRes.count, 1);
  assert.equal(showRes.items[0].data.keyId, "k1");

  const clearRes = await task.run(createCtx({ action: "wallet.inputs.clear", scope: "wallet" }, {}));
  assert.equal(clearRes.ok, true);
  assert.equal(clearRes.action, "wallet.inputs.clear");
  assert.equal(clearRes.removed, 1);

  const after = await task.run(createCtx({ action: "wallet.inputs.show", scope: "wallet" }, {}));
  assert.equal(after.count, 0);
});

test("wallet:session wallet.inputs.set validates required args", async () => {
  await assert.rejects(
    () => task.run(createCtx({ action: "wallet.inputs.set", data: { keyId: "k1" } }, {})),
    /参数缺失: scope/,
  );
});

test("wallet:session wallet.inputs.patch updates partial fields", async () => {
  await task.run(createCtx({ action: "wallet.inputs.clear" }, {}));
  await task.run(createCtx({
    action: "wallet.inputs.set",
    scope: "wallet",
    data: {
      keyId: "k1",
      chain: "evm",
      amount: "1",
    },
  }, {}));

  const patchRes = await task.run(createCtx({
    action: "wallet.inputs.patch",
    scope: "wallet",
    data: {
      amount: "2",
    },
  }, {}));

  assert.equal(patchRes.ok, true);
  assert.equal(patchRes.action, "wallet.inputs.patch");
  assert.equal(patchRes.item.data.amount, "2");
  assert.equal(patchRes.item.data.keyId, "k1");
});

test("wallet:session wallet.inputs.resolve merges defaults/inputs/args", async () => {
  await task.run(createCtx({ action: "wallet.inputs.clear" }, {}));
  await task.run(createCtx({
    action: "wallet.inputs.set",
    scope: "wallet",
    data: {
      chain: "evm",
      address: "0xabc",
      amount: "1",
    },
  }, {}));

  const resolveRes = await task.run(createCtx({
    action: "wallet.inputs.resolve",
    scope: "wallet",
    defaults: {
      chain: "btc",
      symbol: "USDT",
      amount: "0",
    },
    args: {
      amount: "3",
    },
  }, {}));

  assert.equal(resolveRes.ok, true);
  assert.equal(resolveRes.action, "wallet.inputs.resolve");
  assert.equal(resolveRes.resolvedArgs.chain, "evm");
  assert.equal(resolveRes.resolvedArgs.symbol, "USDT");
  assert.equal(resolveRes.resolvedArgs.amount, "3");
});

test("wallet:session wallet.status supports resolver-based filtering with useInputs", async () => {
  await task.run(createCtx({ action: "wallet.clear" }, {}));

  const wallet = {
    async listKeys() {
      return {
        items: [
          { keyId: "k1", name: "alpha", source: "file", sourceFile: "storage/key/a.enc.json", status: "unlocked" },
          { keyId: "k2", name: "beta", source: "file", sourceFile: "storage/key/b.enc.json", status: "unlocked" },
        ],
      };
    },
    async deriveConfiguredAddresses() {
      return {
        items: [
          { keyId: "k1", chain: "evm", address: "0xabc", name: "e1", path: "m/44'/60'/0'/0/0", addressType: null },
          { keyId: "k2", chain: "btc", address: "bc1qabc", name: "b1", path: "m/84'/0'/0'/0/0", addressType: "p2wpkh" },
        ],
        warnings: [],
      };
    },
  };

  await task.run(createCtx({ action: "wallet.deriveConfigured" }, wallet));

  const plain = await task.run(createCtx({ action: "wallet.status" }, wallet));
  assert.equal(plain.counts.keys, 2);
  assert.equal(plain.counts.addresses, 2);

  await task.run(createCtx({
    action: "wallet.inputs.set",
    scope: "wallet",
    data: {
      chain: "evm",
    },
  }, wallet));

  const filtered = await task.run(createCtx({ action: "wallet.status", useInputs: true }, wallet));
  assert.equal(filtered.counts.keys, 1);
  assert.equal(filtered.counts.addresses, 1);
  assert.equal(filtered.addresses[0].chain, "evm");
  assert.equal(filtered.inputScope, "wallet");
  assert.equal(filtered.inputResolved.chain, "evm");
});
