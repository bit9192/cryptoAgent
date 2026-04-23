import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { walletList } from "../../../run/wallet/wallet-list.mjs";

async function mkTmpProject() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wallet-list-run-"));
}

async function withCwd(tmpDir, fn) {
  const prev = process.cwd();
  process.chdir(tmpDir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

test("walletList: 返回 storage/key 下所有 .enc.json 文件", async () => {
  const tmp = await mkTmpProject();

  await fs.mkdir(path.join(tmp, "storage", "key", "team-a"), { recursive: true });
  await fs.mkdir(path.join(tmp, "storage", "key", "team-b"), { recursive: true });

  await fs.writeFile(path.join(tmp, "storage", "key", "a.enc.json"), "{}", "utf8");
  await fs.writeFile(path.join(tmp, "storage", "key", "team-a", "b.enc.json"), "{}", "utf8");
  await fs.writeFile(path.join(tmp, "storage", "key", "team-b", "ignore.txt"), "x", "utf8");

  const out = await withCwd(tmp, async () => walletList());

  assert.equal(out.ok, true);
  assert.equal(out.total, 2);
  assert.equal(out.items.length, 2);
  assert.deepEqual(out.items.map((x) => x.name).sort(), ["a.enc.json", "b.enc.json"]);
});

test("walletList: 只返回列表，不处理 query", async () => {
  const tmp = await mkTmpProject();

  await fs.mkdir(path.join(tmp, "storage", "key"), { recursive: true });
  await fs.writeFile(path.join(tmp, "storage", "key", "a.enc.json"), "123", "utf8");
  await fs.writeFile(path.join(tmp, "storage", "key", "b.enc.json"), "12345", "utf8");

  const out = await withCwd(tmp, async () => walletList());

  assert.equal(out.total, 2);
  assert.equal(out.items.length, 2);
  assert.equal("result" in out, false);
  assert.equal("aggregate" in out, false);
});

test("walletList: AI 通道输出应隐藏内部绝对路径", async () => {
  const tmp = await mkTmpProject();

  await fs.mkdir(path.join(tmp, "storage", "key"), { recursive: true });
  await fs.writeFile(path.join(tmp, "storage", "key", "a.enc.json"), "{}", "utf8");

  const out = await withCwd(tmp, async () => walletList({
    outputChannel: "ai",
  }));

  assert.equal(out.ok, true);
  assert.equal(out.keyRoot, "[REDACTED]");
  assert.equal(out.items[0].abs, "[REDACTED]");
  assert.ok(typeof out.items[0].rel === "string");
});

test("walletList: key 目录不存在时返回空结果", async () => {
  const tmp = await mkTmpProject();

  const out = await withCwd(tmp, async () => walletList());
  assert.equal(out.ok, true);
  assert.equal(out.total, 0);
  assert.deepEqual(out.items, []);
  assert.equal("result" in out, false);
});
