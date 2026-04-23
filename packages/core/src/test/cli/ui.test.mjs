import test from "node:test";
import assert from "node:assert/strict";

import { parseCliCommand } from "../../cli/ui.mjs";

test("parseCliCommand: 输出 { com, args }", () => {
  const parsed = parseCliCommand([
    "create",
    "--name",
    "wallet-main",
    "--password",
    "abc123456",
    "--backup",
    "--threshold",
    "2",
    "--shares",
    "3",
  ]);

  assert.equal(parsed.com, "create");
  assert.deepEqual(parsed.args, {
    name: "wallet-main",
    password: "abc123456",
    backup: true,
    threshold: 2,
    shares: 3,
  });
});

test("parseCliCommand: 支持横杠参数转 camelCase", () => {
  const parsed = parseCliCommand([
    "create",
    "--storage-root",
    "storage-custom",
    "--shares-count",
    "5",
  ]);

  assert.equal(parsed.com, "create");
  assert.deepEqual(parsed.args, {
    storageRoot: "storage-custom",
    sharesCount: 5,
  });
});

test("parseCliCommand: 保留位置参数用于 import 回退路径", () => {
  const parsed = parseCliCommand([
    "import",
    "./keys.md",
    "--password",
    "abc123456",
  ]);

  assert.equal(parsed.com, "import");
  assert.equal(parsed.args.password, "abc123456");
  assert.deepEqual(parsed.args._, ["./keys.md"]);
});
