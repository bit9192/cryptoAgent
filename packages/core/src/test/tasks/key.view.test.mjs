import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { keyCreate } from "../../tasks/key/create.mjs";
import { keyView } from "../../tasks/key/view.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-view-task-"));
}

test("key.view: 解锁后可查看文档内容", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const created = await keyCreate({
    name: "wallet-main",
    password: "strong-pass-123",
    storageRoot,
  });

  const viewed = await keyView({
    keyFile: created.keyFile,
    password: "strong-pass-123",
  });

  assert.equal(viewed.keyFile, created.keyFile);
  assert.ok(viewed.content.includes("wallet-main"));
  assert.ok(viewed.content.includes("\n"));
});

test("key.view: 密码错误应失败", async () => {
  const tmp = await mkTmpDir();
  const storageRoot = path.join(tmp, "storage");

  const created = await keyCreate({
    name: "wallet-main",
    password: "strong-pass-123",
    storageRoot,
  });

  await assert.rejects(
    () => keyView({
      keyFile: created.keyFile,
      password: "wrong-pass-123",
    }),
    /解密失败|密码错误/,
  );
});
