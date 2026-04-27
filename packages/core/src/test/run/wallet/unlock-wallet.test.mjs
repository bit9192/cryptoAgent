import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { encryptPathToFile } from "../../../modules/key/encrypt.mjs";
import { createWallet } from "../../../apps/wallet/index.mjs";
import { unlockWallet } from "../../../run/wallet/unlock.mjs";

async function writeEncryptedDoc(baseDir, fileName, password, content) {
  const src = path.join(baseDir, `${fileName}.md`);
  const out = path.join(baseDir, "storage", "key", `${fileName}.enc.json`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(src, content, "utf8");
  await encryptPathToFile({
    inputPath: src,
    password,
    outputFile: out,
  });
  return out;
}

test("unlockWallet: repeated unlock should refresh key source after lockAll", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wallet-unlock-repeat-"));
  const password = "pass1234";

  const sharedSecret = "d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9";

  const fileA = await writeEncryptedDoc(
    root,
    "a",
    password,
    [
      "alice",
      sharedSecret,
      "@address-config chain=evm path=m/44'/60'/0'/0/0 name=from-a",
    ].join("\n"),
  );

  const fileB = await writeEncryptedDoc(
    root,
    "b",
    password,
    [
      "bob",
      sharedSecret,
      "@address-config chain=evm path=m/44'/60'/0'/0/1 name=from-b",
    ].join("\n"),
  );

  const wallet = createWallet({ baseDir: root });

  const first = await unlockWallet(wallet, fileA, password);
  assert.equal(first.ok, true);

  const keyId = Object.keys(first.unlocked)[0];
  assert.ok(keyId);

  const firstState = await wallet.getSessionState({ keyId });
  assert.equal(Array.isArray(firstState.tree?.tree), true);
  assert.equal(firstState.tree.tree.some((row) => row.name === "alice"), true);

  await wallet.lockAll();

  const second = await unlockWallet(wallet, fileB, password);
  assert.equal(second.ok, true);

  const secondKeyId = Object.keys(second.unlocked)[0];
  assert.ok(secondKeyId);
  assert.notEqual(secondKeyId, keyId);

  const secondState = await wallet.getSessionState({ keyId: secondKeyId });
  assert.equal(Array.isArray(secondState.tree?.tree), true);
  assert.equal(secondState.tree.tree.some((row) => row.name === "bob"), true);
  assert.equal(secondState.tree.tree.some((row) => row.name === "alice"), false);

  const listed = await wallet.listKeys();
  assert.equal(listed.items.some((item) => item.name === "bob"), true);
  assert.equal(listed.items.some((item) => item.name === "alice"), true);
  assert.equal(listed.items.filter((item) => item.sourceFile === path.join("storage", "key", "a.enc.json")).length, 1);
  assert.equal(listed.items.filter((item) => item.sourceFile === path.join("storage", "key", "b.enc.json")).length, 1);
});

test("unlockWallet: multiple key unlock should rebuild tree only once on last key", async () => {
  const unlockCalls = [];
  const walletApp = {
    async loadKeyFile() {
      return {
        ok: true,
        addedKeyIds: ["k1", "k2", "k3"],
        reloadedKeyIds: [],
        skippedKeyIds: [],
        warnings: [],
      };
    },
    async unlock(input) {
      unlockCalls.push({ keyId: input.keyId, rebuildTree: input.rebuildTree });
      return {
        ok: true,
        unlockedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T01:00:00.000Z",
        scope: {},
        tree: input.rebuildTree
          ? { ok: true, tree: [{ keyId: input.keyId }], counts: { accounts: 1, chains: 0, addresses: 0 }, warnings: [] }
          : null,
      };
    },
    async getKeyMeta({ keyId }) {
      return {
        item: {
          keyId,
          name: keyId,
          type: "privateKey",
          source: "file",
          sourceFile: "storage/key/mock.enc.json",
        },
      };
    },
  };

  const result = await unlockWallet(walletApp, "storage/key/mock.enc.json", "pass1234");
  assert.equal(result.ok, true);
  assert.equal(unlockCalls.length, 3);
  assert.deepEqual(unlockCalls.map((item) => item.rebuildTree), [false, false, true]);
  assert.equal(result.tree?.tree?.[0]?.keyId, "k3");
});
