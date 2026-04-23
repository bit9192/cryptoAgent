import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { keyAdd } from "../../tasks/key/add.mjs";
import { keyCreate } from "../../tasks/key/create.mjs";
import { loadKeyQueueFromStoredFile } from "../../modules/key/store.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-add-task-"));
}

test("key.add: 向已有文件追加密钥", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const created = await keyCreate({
    name: "wallet-main",
    password: "strong-pass-123",
    storageRoot,
  });

  const addResult = await keyAdd({
    keyFile: created.keyFile,
    password: "strong-pass-123",
    inputContent: [
      "wallet-new",
      "5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c",
    ].join("\n"),
  });

  assert.equal(addResult.addedCount, 1);
  assert.equal(addResult.skippedCount, 0);

  const loaded = await loadKeyQueueFromStoredFile({
    storedFile: addResult.keyFile,
    password: "strong-pass-123",
  });
  assert.equal(loaded.entries.length, 2);
  assert.ok(loaded.entries.some((x) => x.name === "wallet-new"));
});

test("key.add: 重复密钥应跳过", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const created = await keyCreate({
    name: "wallet-main",
    password: "strong-pass-123",
    storageRoot,
  });

  const first = await loadKeyQueueFromStoredFile({
    storedFile: created.keyFile,
    password: "strong-pass-123",
  });

  const addResult = await keyAdd({
    keyFile: created.keyFile,
    password: "strong-pass-123",
    inputContent: [
      "duplicate-key",
      first.entries[0].secret,
    ].join("\n"),
  });

  assert.equal(addResult.addedCount, 0);
  assert.equal(addResult.skippedCount, 1);
  assert.ok(addResult.warnings.length > 0);
});

test("key.add: 支持 PRIVATE_KEY_PLACEHOLDER 自动生成", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const created = await keyCreate({
    name: "wallet-main",
    password: "strong-pass-123",
    storageRoot,
  });

  const addResult = await keyAdd({
    keyFile: created.keyFile,
    password: "strong-pass-123",
    inputContent: [
      "wallet-auto",
      "PRIVATE_KEY_PLACEHOLDER",
    ].join("\n"),
  });

  assert.equal(addResult.addedCount, 1);
  assert.equal(addResult.generatedCount, 1);

  const loaded = await loadKeyQueueFromStoredFile({
    storedFile: addResult.keyFile,
    password: "strong-pass-123",
  });
  const added = loaded.entries.find((item) => item.name === "wallet-auto");
  assert.ok(added);
  assert.equal(added.type, "privateKey");
  assert.match(String(added.secret), /^(0x)?[a-f0-9]{64}$/i);
});
