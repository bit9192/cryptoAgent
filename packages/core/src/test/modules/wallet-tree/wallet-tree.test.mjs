import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWalletTree } from "../../../modules/wallet-tree/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTDATA_PATH = path.join(__dirname, "testdata.md");

test("wallet-tree testdata: 覆盖四类样本标题", async () => {
  const content = await fs.readFile(TESTDATA_PATH, "utf8");
  assert.match(content, /^# Happy Cases/m);
  assert.match(content, /^# Edge Cases/m);
  assert.match(content, /^# Invalid Cases/m);
  assert.match(content, /^# Security Cases/m);
});

test("wallet-tree: 空会话返回空树", () => {
  const result = buildWalletTree({ keys: [], addresses: [] });
  assert.equal(result.ok, true);
  assert.equal(result.counts.accounts, 0);
  assert.equal(result.counts.chains, 0);
  assert.equal(result.counts.addresses, 0);
  assert.equal(result.tree.length, 0);
});

test("wallet-tree: 单账户可生成 account/chain/address 结构", () => {
  const result = buildWalletTree({
    keys: [
      { keyId: "k1", keyName: "main", privateKey: "secret-never-output" },
    ],
    addresses: [
      { keyId: "k1", chain: "evm", address: "0xabc", path: "m/44", name: "a1" },
      { keyId: "k1", chain: "btc", address: "bc1qxxx", path: "m/84", name: "b1" },
    ],
  });

  assert.equal(result.counts.accounts, 1);
  assert.equal(result.counts.chains, 2);
  assert.equal(result.counts.addresses, 2);
  assert.equal(result.tree[0].keyId, "k1");
  assert.equal(result.tree[0].chains[0].chain, "btc");
  assert.equal(result.tree[0].chains[1].chain, "evm");
});

test("wallet-tree: 多账户按 keyName 稳定排序，同名仍有唯一 id", () => {
  const result = buildWalletTree({
    keys: [
      { keyId: "k2", keyName: "beta" },
      { keyId: "k1", keyName: "alpha" },
      { keyId: "k3", keyName: "alpha" },
    ],
    addresses: [
      { keyId: "k1", chain: "evm", address: "0x111" },
      { keyId: "k2", chain: "evm", address: "0x222" },
      { keyId: "k3", chain: "evm", address: "0x333" },
    ],
  });

  assert.deepEqual(result.tree.map((item) => item.keyId), ["k1", "k3", "k2"]);
  assert.equal(new Set(result.tree.map((item) => item.id)).size, 3);
});

test("wallet-tree: 无效地址条目被跳过并给出 warning", () => {
  const result = buildWalletTree({
    keys: [{ keyId: "k1", keyName: "main" }],
    addresses: [
      { keyId: "k1", chain: "evm", address: "0xabc" },
      { keyId: "k1", chain: "", address: "0xdef" },
    ],
  });

  assert.equal(result.counts.addresses, 1);
  assert.ok(result.warnings.length >= 1);
});

test("wallet-tree: 非法输入抛错", () => {
  assert.throws(() => buildWalletTree(null), /输入不能为空/);
  assert.throws(() => buildWalletTree({ addresses: [] }), /缺少 keys 数组/);
  assert.throws(() => buildWalletTree({ keys: [] }), /缺少 addresses 数组/);
});

test("wallet-tree: 输出不包含密钥敏感字段", () => {
  const result = buildWalletTree({
    keys: [
      {
        keyId: "k1",
        keyName: "main",
        privateKey: "0xsecret",
        mnemonic: "secret words",
        password: "12345678",
      },
    ],
    addresses: [{ keyId: "k1", chain: "evm", address: "0xabc" }],
  });

  const payload = JSON.stringify(result);
  assert.equal(payload.includes("privateKey"), false);
  assert.equal(payload.includes("mnemonic"), false);
  assert.equal(payload.includes("password"), false);
});
