/**
 * test/modules/key/test.mjs
 *
 * 文件预处理测试：parseKeyFile / parseKeyFileFromPath
 *
 * 运行方式：
 *   node --test src/test/modules/key/test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKeyFile, parseKeyFileFromPath } from "../../../modules/key/parse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTDATA_PATH = path.join(__dirname, "testdata.md");

// ── 基础格式解析 ──────────────────────────────────────────────

test("助记词条目：名称+助记词解析正确", () => {
  const text = `
t43
wagon spoon universe remain armed hedgehog fish clarify bracket budget estate insane first swing stuff mad spring amused side sustain open fee wait stairs
`;
  const { entries, errors } = parseKeyFile(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "t43");
  assert.equal(entries[0].type, "mnemonic");
  assert.ok(entries[0].secret.includes("wagon"));
  assert.equal(errors.length, 0);
});

test("hex 私钥（不带0x）：名称+私钥解析正确", () => {
  const text = `
ik
d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9
`;
  const { entries, errors } = parseKeyFile(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "ik");
  assert.equal(entries[0].type, "privateKey");
  assert.equal(entries[0].secret, "d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9");
  assert.equal(errors.length, 0);
});

test("hex 私钥（带0x前缀）：解析正确", () => {
  const text = `
wallet-main
0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
`;
  const { entries } = parseKeyFile(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "wallet-main");
  assert.equal(entries[0].type, "privateKey");
  assert.ok(entries[0].secret.startsWith("0x"));
});

// ── 噪声处理 ──────────────────────────────────────────────────

test("密钥行带 '>' 引用标记：应被清理", () => {
  const text = `
哈哈
> 5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c
`;
  const { entries, errors } = parseKeyFile(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "哈哈");
  assert.equal(entries[0].secret, "5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c");
  assert.equal(errors.length, 0);
});

// ── 无名称自动补位 ────────────────────────────────────────────

test("无名称的密钥：自动生成 unnamed_xxxxxxxx", () => {
  const text = `
f3a4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2a1b2c3d4e5f6a7b8c9d0e1f2
`;
  const { entries, errors } = parseKeyFile(text);
  assert.equal(entries.length, 1);
  assert.ok(entries[0].name.startsWith("unnamed_"));
  assert.equal(errors.length, 1); // 应有警告
});

// ── 注释行忽略 ────────────────────────────────────────────────

test("注释行（以 # 开头）不作为名称或密钥", () => {
  const text = `
# 这是注释，不应被解析
test-comment-ignore
e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2a1b2c3d4e5f6a7b8c9d0
`;
  const { entries } = parseKeyFile(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "test-comment-ignore");
});

// ── 多条目 ────────────────────────────────────────────────────

test("多条目：全部被正确解析", () => {
  const text = `
alice
d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9

bob
5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c
`;
  const { entries, errors } = parseKeyFile(text);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, "alice");
  assert.equal(entries[1].name, "bob");
  assert.equal(errors.length, 0);
});

// ── 空输入 ────────────────────────────────────────────────────

test("空文本：返回空条目并有错误信息", () => {
  const { entries, errors } = parseKeyFile("");
  assert.equal(entries.length, 0);
  assert.equal(errors.length, 1);
});

test("无密钥的纯文本：返回空条目并有错误信息", () => {
  const { entries, errors } = parseKeyFile("这里没有密钥\n只有普通文字\n第三行");
  assert.equal(entries.length, 0);
  assert.equal(errors.length, 1);
});

// ── 从文件读取 ────────────────────────────────────────────────

test("从 testdata.md 读取：应解析出至少 5 条条目", async () => {
  const { entries, errors } = await parseKeyFileFromPath(TESTDATA_PATH);
  // testdata 包含 6 个场景（助记词+5个私钥），其中1个无名称
  assert.ok(entries.length >= 5, `期望至少5条，实际: ${entries.length}`);
  // 场景1 助记词
  const mnemonic = entries.find((e) => e.name === "t43");
  assert.ok(mnemonic, "应有 t43 条目");
  assert.equal(mnemonic.type, "mnemonic");
  // 场景2 hex私钥
  const ik = entries.find((e) => e.name === "ik");
  assert.ok(ik, "应有 ik 条目");
  assert.equal(ik.type, "privateKey");
  // 场景6 注释不干扰
  const commentTest = entries.find((e) => e.name === "test-comment-ignore");
  assert.ok(commentTest, "应有 test-comment-ignore 条目");
  // 无名称场景应有 unnamed 条目
  const unnamed = entries.find((e) => e.name.startsWith("unnamed_"));
  assert.ok(unnamed, "应有自动命名的 unnamed_ 条目");
  // 场景3 噪声清理
  const noisy = entries.find((e) => e.name === "哈哈");
  assert.ok(noisy, "应有 哈哈 条目");
  assert.ok(!noisy.secret.startsWith(">"), "噪声字符应被清理");
});
