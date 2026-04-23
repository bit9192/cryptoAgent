import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { keyImport } from "../../tasks/key/import.mjs";
import { keyEditPrepare, keyEditCommit } from "../../tasks/key/edit.mjs";
import { loadKeyQueueFromStoredFile, revealStoredFileContent } from "../../modules/key/store.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-edit-task-"));
}

test("key.edit: 可编辑非密钥内容并提交", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const imported = await keyImport({
    inputContent: [
      "# 备注",
      "wallet-main",
      "PRIVATE_KEY_PLACEHOLDER",
      "# @address-config chain=evm path=m/44'/60'/0'/0/0",
    ].join("\n"),
    password: "strong-pass-123",
    storageRoot,
  });

  const prepared = await keyEditPrepare({
    keyFile: imported.keyFile,
    password: "strong-pass-123",
  });

  assert.ok(prepared.editableContent.includes("PRIVATE_KEY_PROTECTED_1"));
  assert.equal(prepared.editableContent.includes("PRIVATE_KEY_PLACEHOLDER"), false);

  const edited = prepared.editableContent.replace("wallet-main", "wallet-main-renamed");
  const committed = await keyEditCommit({
    keyFile: imported.keyFile,
    password: "strong-pass-123",
    protection: prepared.protection,
    editedContent: edited,
  });

  assert.equal(committed.updated, true);

  const loaded = await loadKeyQueueFromStoredFile({
    storedFile: imported.keyFile,
    password: "strong-pass-123",
  });
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].name, "wallet-main-renamed");

  const revealed = await revealStoredFileContent({
    storedFile: imported.keyFile,
    password: "strong-pass-123",
  });
  assert.equal(revealed.content.includes("PRIVATE_KEY_PROTECTED_1"), false);
});

test("key.edit: 删除占位符应拒绝提交", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const imported = await keyImport({
    inputContent: [
      "wallet-main",
      "PRIVATE_KEY_PLACEHOLDER",
    ].join("\n"),
    password: "strong-pass-123",
    storageRoot,
  });

  const prepared = await keyEditPrepare({
    keyFile: imported.keyFile,
    password: "strong-pass-123",
  });

  const broken = prepared.editableContent.replace("PRIVATE_KEY_PROTECTED_1", "");

  await assert.rejects(
    () => keyEditCommit({
      keyFile: imported.keyFile,
      password: "strong-pass-123",
      protection: prepared.protection,
      editedContent: broken,
    }),
    /占位符缺失或重复/,
  );
});
