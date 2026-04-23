import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { keyImports } from "../../tasks/key/imports.mjs";
import { loadKeyQueueFromStoredFile } from "../../modules/key/store.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-imports-task-"));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "../modules/keys/imports");

test("key.imports: 递归导入目录下明文 key 文件", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const result = await keyImports({
    inputDir: FIXTURE_DIR,
    password: "strong-pass-123",
    storageRoot,
    recursive: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.scanned, 2);
  assert.equal(result.matched, 2);
  assert.equal(result.imported, 2);
  assert.equal(result.failed, 0);

  const importedItems = result.results.filter((item) => item.status === "imported");
  assert.equal(importedItems.length, 2);

  for (const item of importedItems) {
    const loaded = await loadKeyQueueFromStoredFile({
      storedFile: item.outputFile,
      password: "strong-pass-123",
    });
    assert.ok(loaded.entries.length >= 1);
  }
});

test("key.imports: dryRun 仅预检，不写加密文件", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const result = await keyImports({
    inputDir: FIXTURE_DIR,
    password: "strong-pass-123",
    storageRoot,
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.imported, 2);

  const imported = result.results.find((item) => item.status === "imported");
  assert.ok(imported);

  const outAbs = path.resolve(process.cwd(), imported.outputFile);
  const exists = await fs.stat(outAbs).then(() => true).catch(() => false);
  assert.equal(exists, false);
});

test("key.imports: 重复文件默认自动重命名", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const first = await keyImports({
    inputDir: FIXTURE_DIR,
    password: "strong-pass-123",
    storageRoot,
  });
  const second = await keyImports({
    inputDir: FIXTURE_DIR,
    password: "strong-pass-123",
    storageRoot,
    onConflict: "rename",
  });

  assert.equal(first.imported, 2);
  assert.equal(second.imported, 2);
  assert.equal(second.failed, 0);

  const renamed = second.results.filter((item) => item.status === "imported");
  assert.equal(renamed.length, 2);
  assert.ok(renamed.every((item) => item.conflictAction === "rename"));
  assert.ok(renamed.some((item) => /\.1\.json$/.test(item.outputFile)));
});

test("key.imports: 支持占位符自动生成", async () => {
  const tmp = await mkTmpDir();
  const sourceDir = path.join(tmp, "inputs");
  const storageRoot = path.join(tmp, "storage");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(
    path.join(sourceDir, "auto.md"),
    [
      "wallet-auto",
      "PRIVATE_KEY_PLACEHOLDER",
      "",
      "wallet-auto-mn",
      "MNEMONIC_PLACEHOLDER",
    ].join("\n"),
    "utf8",
  );

  const result = await keyImports({
    inputDir: sourceDir,
    password: "strong-pass-123",
    storageRoot,
  });

  assert.equal(result.imported, 1);
  assert.equal(result.failed, 0);

  const imported = result.results.find((item) => item.status === "imported");
  assert.ok(imported);
  assert.equal(imported.generatedCount, 2);

  const loaded = await loadKeyQueueFromStoredFile({
    storedFile: imported.outputFile,
    password: "strong-pass-123",
  });
  assert.equal(loaded.entries.length, 2);
  assert.ok(loaded.entries.some((entry) => entry.type === "privateKey"));
  assert.ok(loaded.entries.some((entry) => entry.type === "mnemonic"));
});
