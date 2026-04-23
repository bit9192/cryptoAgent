import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { keyImport } from "../../tasks/key/import.mjs";
import { loadKeyQueueFromStoredFile, revealStoredFileContent } from "../../modules/key/store.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-import-task-"));
}

test("key.import: 导入文件并生成常用加密文件", async () => {
  const tmp = await mkTmpDir();
  const source = path.join(tmp, "source.md");
  const storageRoot = path.join(tmp, "storage");

  await fs.writeFile(
    source,
    [
      "wallet-a",
      "d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9",
      "",
      "wallet-b",
      "5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c",
    ].join("\n"),
    "utf8",
  );

  const result = await keyImport({
    inputPath: source,
    password: "strong-pass-123",
    storageRoot,
  });

  assert.equal(result.entryCount, 2);
  assert.ok(result.keyFile.endsWith("source.enc.json"));
  assert.equal(result.backupGroups.length, 0);

  const loaded = await loadKeyQueueFromStoredFile({
    storedFile: result.keyFile,
    password: "strong-pass-123",
  });
  assert.equal(loaded.entries.length, 2);
});

test("key.import --backup: 仅 privateKey 生成 SSS 备份", async () => {
  const tmp = await mkTmpDir();
  const source = path.join(tmp, "mix.md");
  const storageRoot = path.join(tmp, "storage");

  await fs.writeFile(
    source,
    [
      "wallet-key",
      "0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      "",
      "wallet-mnemonic",
      "wagon spoon universe remain armed hedgehog fish clarify bracket budget estate insane first swing stuff mad spring amused side sustain open fee wait stairs",
    ].join("\n"),
    "utf8",
  );

  const result = await keyImport({
    inputPath: source,
    password: "strong-pass-123",
    backup: true,
    threshold: 2,
    sharesCount: 3,
    storageRoot,
  });

  assert.equal(result.entryCount, 2);
  assert.equal(result.backupGroups.length, 1);
  assert.ok(result.warnings.some((x) => x.includes("跳过")));

  const backup = result.backupGroups[0];
  assert.equal(backup.threshold, 2);
  assert.equal(backup.sharesCount, 3);
  assert.equal(backup.shareFiles.length, 3);
});

test("key.import: 支持直接输入文档内容", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const result = await keyImport({
    inputContent: [
      "inline-a",
      "d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9",
      "",
      "inline-b",
      "5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c",
    ].join("\n"),
    password: "strong-pass-123",
    storageRoot,
  });

  assert.equal(result.sourceType, "content");
  assert.equal(result.entryCount, 2);
  assert.equal(result.backupGroups.length, 0);
});

test("key.import: 保留备注与注释，解析时不作为密钥", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const inputContent = [
    "# 文件级备注",
    "wallet-a",
    "d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9",
    "pass-note-123",
    "",
    "# 这行应被忽略，不参与解析",
    "wallet-b",
    "5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c",
  ].join("\n");

  const result = await keyImport({
    inputContent,
    password: "strong-pass-123",
    storageRoot,
  });

  assert.equal(result.entryCount, 2);

  const revealed = await revealStoredFileContent({
    storedFile: result.keyFile,
    password: "strong-pass-123",
  });

  // 备注和 passphrase 都应保留在加密文件解密后的原文中
  assert.ok(revealed.content.includes("# 文件级备注"));
  assert.ok(revealed.content.includes("# 这行应被忽略，不参与解析"));
  assert.ok(revealed.content.includes("pass-note-123"));

  // 解析结果仍然只包含两条密钥
  const loaded = await loadKeyQueueFromStoredFile({
    storedFile: result.keyFile,
    password: "strong-pass-123",
  });
  assert.equal(loaded.entries.length, 2);
});

test("key.import: 同名文件已存在时应拒绝覆盖", async () => {
  const tmp = await mkTmpDir();
  const source = path.join(tmp, "same.md");
  const storageRoot = path.join(tmp, "storage");

  await fs.writeFile(
    source,
    [
      "wallet-a",
      "d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9",
    ].join("\n"),
    "utf8",
  );

  await keyImport({
    inputPath: source,
    name: "same-name",
    password: "strong-pass-123",
    storageRoot,
  });

  await assert.rejects(
    () => keyImport({
      inputPath: source,
      name: "same-name",
      password: "strong-pass-123",
      storageRoot,
    }),
    /请换名字/,
  );
});

test("key.import: 支持 MNEMONIC_PLACEHOLDER 自动生成", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const result = await keyImport({
    inputContent: [
      "wallet-auto-mn",
      "MNEMONIC_PLACEHOLDER",
      "@passphrase test-passphrase",
    ].join("\n"),
    password: "strong-pass-123",
    storageRoot,
  });

  assert.equal(result.entryCount, 1);
  assert.equal(result.generatedCount, 1);

  const loaded = await loadKeyQueueFromStoredFile({
    storedFile: result.keyFile,
    password: "strong-pass-123",
  });
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].type, "mnemonic");
  assert.ok(String(loaded.entries[0].secret).split(/\s+/).length >= 12);
});
