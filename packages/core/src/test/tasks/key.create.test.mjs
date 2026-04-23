import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { keyCreate } from "../../tasks/key/create.mjs";
import { loadKeyQueueFromStoredFile } from "../../modules/key/store.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-create-task-"));
}

test("key.create: 创建常用加密文件", async () => {
  const tmp = await mkTmpDir();
  const result = await keyCreate({
    name: "wallet-main",
    password: "strong-pass-123",
    storageRoot: path.join(tmp, "storage"),
  });

  assert.equal(result.name, "wallet-main");
  assert.ok(result.keyFile.endsWith("wallet-main.enc.json"));
  assert.ok(!result.backup);

  const parsed = await loadKeyQueueFromStoredFile({
    storedFile: result.keyFile,
    password: "strong-pass-123",
  });
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].name, "wallet-main");
  assert.equal(parsed.entries[0].type, "privateKey");
});

test("key.create --backup: 生成 SSS 备份文件", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const result = await keyCreate({
    name: "wallet-backup",
    password: "strong-pass-123",
    backup: true,
    threshold: 2,
    sharesCount: 3,
    storageRoot,
  });

  assert.ok(result.backup);
  assert.equal(result.backup.threshold, 2);
  assert.equal(result.backup.sharesCount, 3);
  assert.equal(result.backup.shareFiles.length, 3);

  const metaStat = await fs.stat(result.backup.metaFile);
  assert.ok(metaStat.isFile());

  for (const shareFile of result.backup.shareFiles) {
    const st = await fs.stat(shareFile);
    assert.ok(st.isFile());
  }
});

test("key.create: 同名文件已存在时应拒绝覆盖", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  await keyCreate({
    name: "same-name",
    password: "strong-pass-123",
    storageRoot,
  });

  await assert.rejects(
    () => keyCreate({
      name: "same-name",
      password: "strong-pass-123",
      storageRoot,
    }),
    /请换名字/,
  );
});
