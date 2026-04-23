import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { keyDeriveConfig } from "../../tasks/key/derive-config.mjs";

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "key-derive-config-task-"));
}

test("key.derive-config: 从文档导出地址配置结果", async () => {
  const tmp = await mkTmpDir();
  const input = path.join(tmp, "source.md");
  const output = path.join(tmp, "source.addresses.json");

  await fs.writeFile(
    input,
    [
      "wallet-a",
      "test test test test test test test test test test test junk",
      "@address-config chain=btc type=p2wpkh path=m/84'/0'/0'/0/[0,1] name=main",
      "",
      "wallet-b",
      "d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9",
      "@address-config chain=btc path=m/84'/0'/0'/0/1 name=all-types",
    ].join("\n"),
    "utf8",
  );

  const result = await keyDeriveConfig({
    inputPath: input,
    outputPath: output,
    password: "strong-pass-123",
    strict: false,
  });

  assert.equal(result.keysTotal >= 2, true);
  assert.equal(result.keysWithConfig >= 1, true);

  const exported = JSON.parse(await fs.readFile(output, "utf8"));
  assert.equal(exported.sourceFile.endsWith("source.md"), true);
  assert.equal(Array.isArray(exported.results), true);
  assert.ok(exported.results.some((item) => item.derivedCount > 0));

  const walletA = exported.results.find((item) => item.keyName === "wallet-a");
  assert.ok(walletA, "应存在 wallet-a 导出项");
  assert.ok(walletA.items.some((item) => item.name === "main-0"));
});
