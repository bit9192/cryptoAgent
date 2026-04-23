import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { decryptPathFromFile, encryptPathToFile } from "../../../modules/key/encrypt.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-encrypt-"));
}

test("单文件加密：生成 enc json", async () => {
  const tmp = await mkTmpDir();
  const file = path.join(tmp, "a.txt");
  const out = path.join(tmp, "a.enc.json");
  await fs.writeFile(file, "hello-key", "utf8");

  const res = await encryptPathToFile({
    inputPath: file,
    password: "strong-pass-123",
    outputFile: out,
  });

  assert.equal(res.fileCount, 1);
  const payload = JSON.parse(await fs.readFile(out, "utf8"));
  assert.equal(payload.version, "key-enc-v1");
  assert.equal(payload.sourceType, "file");
  assert.equal(payload.sourceName, "a.txt");
});

test("目录加密：递归打包所有文件", async () => {
  const tmp = await mkTmpDir();
  const dir = path.join(tmp, "input-dir");
  const nested = path.join(dir, "nested");
  const out = path.join(tmp, "dir.enc.json");

  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(dir, "a.txt"), "A", "utf8");
  await fs.writeFile(path.join(nested, "b.txt"), "B", "utf8");

  const res = await encryptPathToFile({
    inputPath: dir,
    password: "strong-pass-123",
    outputFile: out,
  });

  assert.equal(res.fileCount, 2);
  const payload = JSON.parse(await fs.readFile(out, "utf8"));
  assert.equal(payload.sourceType, "directory");
  assert.equal(payload.fileCount, 2);
});

test("加密+解密：内容可完整恢复", async () => {
  const tmp = await mkTmpDir();
  const dir = path.join(tmp, "seed");
  const nested = path.join(dir, "x", "y");
  const out = path.join(tmp, "seed.enc.json");
  const restore = path.join(tmp, "restored");

  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(dir, "root.txt"), "root-content", "utf8");
  await fs.writeFile(path.join(nested, "deep.txt"), "deep-content", "utf8");

  await encryptPathToFile({
    inputPath: dir,
    password: "strong-pass-123",
    outputFile: out,
  });

  const restored = await decryptPathFromFile({
    encryptedFile: out,
    password: "strong-pass-123",
    outputDir: restore,
  });

  assert.equal(restored.fileCount, 2);
  assert.equal(await fs.readFile(path.join(restore, "root.txt"), "utf8"), "root-content");
  assert.equal(
    await fs.readFile(path.join(restore, "x", "y", "deep.txt"), "utf8"),
    "deep-content",
  );
});
