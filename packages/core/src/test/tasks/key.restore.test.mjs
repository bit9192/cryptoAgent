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

test("key.restore --to-key: 恢复直接写入 storage/key/", async () => {
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

  // 清空 key 目录，模拟新机器
  await fs.rm(path.join(storageRoot, "key"), { recursive: true, force: true });
  await fs.mkdir(path.join(storageRoot, "key"), { recursive: true });

  const restore = await keyRestore({
    backupPath: backup.destinationPath,
    storageRoot,
    toKey: true,
  });

  assert.equal(restore.outputPath, path.join(path.relative(process.cwd(), storageRoot), "key"));
  assert.ok(restore.restoredFileCount >= 2);
  assert.deepEqual(restore.skippedFiles, []);

  const keyDir = path.join(storageRoot, "key");
  const files = await fs.readdir(keyDir);
  assert.ok(files.some((f) => f === "wallet-a.enc.json"));
  assert.ok(files.some((f) => f === "wallet-b.enc.json"));
});

test("key.restore --to-key: 已存在同名文件时跳过", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  await keyCreate({ name: "wallet-a", password: "strong-pass-123", storageRoot });

  const backup = await keyBackup({
    sourceType: "directory",
    sourcePath: path.join(storageRoot, "key"),
    threshold: 2,
    sharesCount: 3,
    storageRoot,
  });

  // wallet-a.enc.json 已存在，不应被覆盖
  const restore = await keyRestore({
    backupPath: backup.destinationPath,
    storageRoot,
    toKey: true,
  });

  assert.equal(restore.restoredFileCount, 0);
  assert.equal(restore.skippedFiles.length, 1);
  assert.ok(restore.skippedFiles[0].includes("wallet-a.enc.json"));
});
