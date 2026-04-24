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
