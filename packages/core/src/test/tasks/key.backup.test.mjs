import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { keyBackup } from "../../tasks/key/backup.mjs";
import { keyCreate } from "../../tasks/key/create.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-backup-task-"));
}

test("key.backup: 备份整个 key 文件夹", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  await keyCreate({ name: "wallet-a", password: "strong-pass-123", storageRoot });
  await keyCreate({ name: "wallet-b", password: "strong-pass-123", storageRoot });

  const result = await keyBackup({
    sourceType: "directory",
    sourcePath: path.join(storageRoot, "key"),
    threshold: 2,
    sharesCount: 3,
    storageRoot,
  });

  assert.equal(result.sourceType, "directory");
  assert.ok(result.fileCount >= 2);
  assert.equal(result.threshold, 2);
  assert.equal(result.sharesCount, 3);
  assert.equal(result.shareCount, 3);
  const destAbs = path.resolve(process.cwd(), result.destinationPath);
  const st = await fs.stat(destAbs);
  assert.ok(st.isDirectory());

  const manifestAbs = path.resolve(process.cwd(), result.manifestFile);
  const manifest = JSON.parse(await fs.readFile(manifestAbs, "utf8"));
  assert.equal(manifest.version, "key-sss-backup-manifest-v1");

  for (const shareRel of result.shareFiles) {
    const shareAbs = path.resolve(process.cwd(), shareRel);
    const shareStat = await fs.stat(shareAbs);
    assert.ok(shareStat.isFile());
  }
});

test("key.backup: 备份单个 key 文件到手动位置", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const created = await keyCreate({ name: "wallet-a", password: "strong-pass-123", storageRoot });

  const result = await keyBackup({
    sourceType: "file",
    sourcePath: created.keyFile,
    destinationPath: path.join(tmp, "manual-backup"),
    threshold: 2,
    sharesCount: 3,
    storageRoot,
  });

  assert.equal(result.sourceType, "file");
  assert.equal(result.fileCount, 1);
  assert.equal(result.shareCount, 3);
  const destAbs = path.resolve(process.cwd(), result.destinationPath);
  const st = await fs.stat(destAbs);
  assert.ok(st.isDirectory());
});

test("key.backup: 可选启用 passphrase 保护", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const created = await keyCreate({ name: "wallet-a", password: "strong-pass-123", storageRoot });

  const result = await keyBackup({
    sourceType: "file",
    sourcePath: created.keyFile,
    threshold: 2,
    sharesCount: 3,
    passphrase: "backup-pass-123",
    storageRoot,
  });

  const manifestAbs = path.resolve(process.cwd(), result.manifestFile);
  const manifest = JSON.parse(await fs.readFile(manifestAbs, "utf8"));
  assert.equal(result.passphraseEnabled, true);
  assert.equal(manifest.passphraseEnabled, true);
  assert.equal(manifest.encryption.enabled, true);
});
