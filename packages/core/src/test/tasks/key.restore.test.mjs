import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { keyBackup } from "../../tasks/key/backup.mjs";
import { keyCreate } from "../../tasks/key/create.mjs";
import { keyRestore } from "../../tasks/key/restore.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-restore-task-"));
}

test("key.restore: 恢复整个 key 目录备份", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  await keyCreate({ name: "wallet-a", password: "strong-pass-123", storageRoot });
  await keyCreate({ name: "wallet-b", password: "strong-pass-123", storageRoot });

  const backup = await keyBackup({
    sourceType: "directory",
    sourcePath: path.join(storageRoot, "key"),
    threshold: 2,
    sharesCount: 3,
    storageRoot,
  });

  const restore = await keyRestore({
    backupPath: backup.destinationPath,
    outputPath: path.join(tmp, "restore-output"),
    storageRoot,
  });

  assert.equal(restore.sourceType, "directory");
  assert.ok(restore.restoredFileCount >= 2);
  const outAbs = path.resolve(process.cwd(), restore.outputPath);
  const outStat = await fs.stat(outAbs);
  assert.ok(outStat.isDirectory());
});

test("key.restore: 恢复单文件备份", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const created = await keyCreate({ name: "wallet-a", password: "strong-pass-123", storageRoot });

  const backup = await keyBackup({
    sourceType: "file",
    sourcePath: created.keyFile,
    threshold: 2,
    sharesCount: 3,
    storageRoot,
  });

  const restore = await keyRestore({
    backupPath: backup.destinationPath,
    outputPath: path.join(tmp, "restore-file-output"),
    storageRoot,
  });

  assert.equal(restore.sourceType, "file");
  assert.equal(restore.restoredFileCount, 1);
  const outAbs = path.resolve(process.cwd(), restore.outputPath);
  const files = await fs.readdir(outAbs);
  assert.equal(files.length, 1);
  assert.ok(files[0].endsWith(".enc.json"));
});

test("key.restore: 启用 passphrase 的备份需要正确密码", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const created = await keyCreate({ name: "wallet-a", password: "strong-pass-123", storageRoot });

  const backup = await keyBackup({
    sourceType: "file",
    sourcePath: created.keyFile,
    threshold: 2,
    sharesCount: 3,
    passphrase: "backup-pass-123",
    storageRoot,
  });

  await assert.rejects(
    () => keyRestore({
      backupPath: backup.destinationPath,
      outputPath: path.join(tmp, "restore-missing-pass"),
      storageRoot,
    }),
    /需要输入密码|passphrase/,
  );

  const restored = await keyRestore({
    backupPath: backup.destinationPath,
    outputPath: path.join(tmp, "restore-with-pass"),
    passphrase: "backup-pass-123",
    storageRoot,
  });

  assert.equal(restored.restoredFileCount, 1);
});
