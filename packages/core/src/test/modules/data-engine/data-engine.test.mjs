import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  extractData,
  computeData,
  sanitizeForChannel,
  validateRuleSpec,
} from "../../../modules/data-engine/index.mjs";

const FIXTURES = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "fixtures",
);

async function loadFixture(name) {
  const full = path.join(FIXTURES, name);
  const text = await fs.readFile(full, "utf8");
  return JSON.parse(text);
}

test("data-engine extract: 提取 active 且 amount>0 的 token", async () => {
  const input = await loadFixture("collect-balances.happy.input.json");

  const rows = extractData({
    input,
    sourcePath: "accounts[*].tokens[*]",
    filters: [
      { field: "status", op: "eq", value: "active" },
      { field: "amount", op: "gt", value: 0 },
    ],
    select: {
      symbol: "symbol",
      amount: "amount",
      status: "status",
    },
  });

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((x) => x.symbol).sort(), ["TRX", "USDT", "USDT"]);
});

test("data-engine compute: 统计 active token 总量", async () => {
  const input = await loadFixture("collect-balances.happy.input.json");

  const total = computeData({
    input,
    sourcePath: "accounts[*].tokens[*]",
    filters: [
      { field: "status", op: "eq", value: "active" },
      { field: "amount", op: "gt", value: 0 },
    ],
    aggregate: { type: "sum", field: "amount" },
  });

  assert.equal(total, 508.7);
});

test("data-engine compute: groupBy symbol 汇总", async () => {
  const input = await loadFixture("collect-balances.happy.input.json");

  const grouped = computeData({
    input,
    sourcePath: "accounts[*].tokens[*]",
    filters: [
      { field: "status", op: "eq", value: "active" },
      { field: "amount", op: "gt", value: 0 },
    ],
    aggregate: {
      type: "groupBy",
      by: "symbol",
      metric: { type: "sum", field: "amount" },
    },
  });

  assert.equal(grouped.USDT, 208.7);
  assert.equal(grouped.TRX, 300);
});

test("data-engine security: ai 通道应屏蔽 private 和 secret 字段", async () => {
  const input = await loadFixture("collect-balances.security.input.json");

  const safe = sanitizeForChannel({
    data: input,
    channel: "ai",
    fieldLevels: {
      address: "public",
      publicNote: "public",
      privateKey: "private",
      secretNote: "secret",
      "meta.tag": "public",
      "meta.password": "secret",
      "meta.mnemonic": "secret",
    },
  });

  assert.equal(safe.address, "0x2222222222222222222222222222222222222222");
  assert.equal(safe.privateKey, "[REDACTED]");
  assert.equal(safe.secretNote, "[REDACTED]");
  assert.equal(safe.meta.password, "[REDACTED]");
  assert.equal(safe.meta.mnemonic, "[REDACTED]");
  assert.equal(safe.meta.tag, "safe-tag");
});

test("data-engine invalid: 非法过滤操作符应抛错", async () => {
  const input = await loadFixture("collect-balances.happy.input.json");

  assert.throws(() => {
    extractData({
      input,
      sourcePath: "accounts[*].tokens[*]",
      filters: [{ field: "amount", op: "regexx", value: "1" }],
    });
  }, /不支持的过滤操作符/);
});

test("data-engine rule spec: 规则版本和结构校验", async () => {
  const valid = validateRuleSpec({
    version: "1.0",
    sourcePath: "accounts[*].tokens[*]",
    filters: [{ field: "status", op: "eq", value: "active" }],
    aggregate: { type: "sum", field: "amount" },
  });

  assert.equal(valid.version, "1.0");

  assert.throws(() => validateRuleSpec({ version: "2.0" }), /不支持的规则版本/);
  assert.throws(
    () => validateRuleSpec({ filters: [{ field: "x", op: "bad-op", value: 1 }] }),
    /不支持的过滤操作符/
  );
  assert.throws(
    () => validateRuleSpec({ aggregate: { type: "sum", field: "amount", numericMode: "foo" } }),
    /不支持的数字模式/
  );
});

test("data-engine compute: decimal-string 模式避免浮点误差", () => {
  const input = {
    rows: [
      { amount: "0.1" },
      { amount: "0.2" },
      { amount: "0.3" },
    ],
  };

  const sum = computeData({
    input,
    sourcePath: "rows[*]",
    aggregate: {
      type: "sum",
      field: "amount",
      numericMode: "decimal-string",
    },
  });

  assert.equal(sum, "0.6");
});

test("data-engine compute: bigint 模式 sum/min/max/avg", () => {
  const input = {
    rows: [
      { amount: "1000000000000000001" },
      { amount: "1000000000000000002" },
      { amount: "1000000000000000004" },
    ],
  };

  const sum = computeData({
    input,
    sourcePath: "rows[*]",
    aggregate: { type: "sum", field: "amount", numericMode: "bigint" },
  });
  const min = computeData({
    input,
    sourcePath: "rows[*]",
    aggregate: { type: "min", field: "amount", numericMode: "bigint" },
  });
  const max = computeData({
    input,
    sourcePath: "rows[*]",
    aggregate: { type: "max", field: "amount", numericMode: "bigint" },
  });
  const avg = computeData({
    input,
    sourcePath: "rows[*]",
    aggregate: { type: "avg", field: "amount", numericMode: "bigint" },
  });

  assert.equal(sum, 3000000000000000007n);
  assert.equal(min, 1000000000000000001n);
  assert.equal(max, 1000000000000000004n);
  assert.equal(avg, 1000000000000000002n);
});

test("data-engine compute: bigint 模式 groupBy 聚合", () => {
  const input = {
    rows: [
      { symbol: "USDT", amount: "1000000" },
      { symbol: "USDT", amount: "2000000" },
      { symbol: "TRX", amount: "500000" },
    ],
  };

  const grouped = computeData({
    input,
    sourcePath: "rows[*]",
    aggregate: {
      type: "groupBy",
      by: "symbol",
      metric: { type: "sum", field: "amount", numericMode: "bigint" },
    },
  });

  assert.equal(grouped.USDT, 3000000n);
  assert.equal(grouped.TRX, 500000n);
});
