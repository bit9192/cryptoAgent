import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  loadKeyQueueFromStoredFile,
  readEncryptedPath,
  storeEncryptedPath,
  verifyStoredFilePassword,
} from "../../../modules/key/store.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-store-"));
}

test("加密存储分类：common 写入 storage/key", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const file = path.join(tmp, "seed.txt");

  await fs.writeFile(file, "hello-common", "utf8");
  const res = await storeEncryptedPath({
    inputPath: file,
    password: "strong-pass-123",
    bucket: "common",
    storageRoot,
  });

  assert.equal(res.bucket, "key");
  assert.ok(res.storedFile.includes(path.join("storage", "key")));
});

test("加密存储分类：backup 写入 storage/backup", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const file = path.join(tmp, "seed.txt");

  await fs.writeFile(file, "hello-backup", "utf8");
  const res = await storeEncryptedPath({
    inputPath: file,
    password: "strong-pass-123",
    bucket: "backup",
    storageRoot,
  });

  assert.equal(res.bucket, "backup");
  assert.ok(res.storedFile.includes(path.join("storage", "backup")));
});

test("读取已存储加密文件：可恢复到目标目录", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const inputDir = path.join(tmp, "input");
  const restoreDir = path.join(tmp, "restore");

  await fs.mkdir(path.join(inputDir, "nested"), { recursive: true });
  await fs.writeFile(path.join(inputDir, "a.txt"), "A", "utf8");
  await fs.writeFile(path.join(inputDir, "nested", "b.txt"), "B", "utf8");

  const stored = await storeEncryptedPath({
    inputPath: inputDir,
    password: "strong-pass-123",
    bucket: "common",
    storageRoot,
  });

  const restored = await readEncryptedPath({
    storedFile: stored.storedFile,
    password: "strong-pass-123",
    outputDir: restoreDir,
  });

  assert.equal(restored.fileCount, 2);
  assert.equal(await fs.readFile(path.join(restoreDir, "a.txt"), "utf8"), "A");
  assert.equal(await fs.readFile(path.join(restoreDir, "nested", "b.txt"), "utf8"), "B");
});

test("从已存储加密文件读取密钥队列", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const source = path.join(tmp, "keys.md");

  await fs.writeFile(
    source,
    [
      "wallet-main",
      "d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9",
      "",
      "wallet-b",
      "5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c",
    ].join("\n"),
    "utf8",
  );

  const stored = await storeEncryptedPath({
    inputPath: source,
    password: "strong-pass-123",
    bucket: "common",
    storageRoot,
  });

  const parsed = await loadKeyQueueFromStoredFile({
    storedFile: stored.storedFile,
    password: "strong-pass-123",
  });

  assert.equal(parsed.entries.length, 2);
  assert.ok(parsed.entries.some((x) => x.name === "wallet-main"));
  assert.ok(parsed.entries.some((x) => x.name === "wallet-b"));
});

test("校验密码：错误密码应立即失败", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");
  const file = path.join(tmp, "seed.txt");

  await fs.writeFile(file, "hello-verify", "utf8");
  const stored = await storeEncryptedPath({
    inputPath: file,
    password: "strong-pass-123",
    bucket: "common",
    storageRoot,
  });

  const ok = await verifyStoredFilePassword({
    storedFile: stored.storedFile,
    password: "strong-pass-123",
  });
  assert.equal(ok.ok, true);

  const bad = await verifyStoredFilePassword({
    storedFile: stored.storedFile,
    password: "wrong-pass-123",
  });
  assert.equal(bad.ok, false);
});
