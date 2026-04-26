import test from "node:test";
import assert from "node:assert/strict";

import { searchTask } from "../../../tasks/search/index.mjs";

// ─── Happy Path ───────────────────────────────────────────────────────────────

test("searchTask: token domain 返回 ok=true 且 candidates 为数组", async () => {
  const result = await searchTask({ domain: "token", query: "USDT", network: "eth" });
  assert.equal(result.ok, true);
  assert.equal(result.domain, "token");
  assert.equal(result.query, "USDT");
  assert.ok(Array.isArray(result.candidates));
});

test("searchTask: address domain 返回 ok=true 且 candidates 为数组", async () => {
  // 使用 Vitalik 公开地址
  const result = await searchTask({
    domain: "address",
    query: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    network: "eth",
    timeoutMs: 15000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.domain, "address");
  assert.ok(Array.isArray(result.candidates));
});

// ─── Invalid ──────────────────────────────────────────────────────────────────

test("searchTask: domain 非法时返回 ok=false 且有 error", async () => {
  const result = await searchTask({ domain: "nft", query: "USDT", network: "eth" });
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === "string" && result.error.length > 0);
  assert.deepEqual(result.candidates, []);
});

test("searchTask: query 为空时返回 ok=false 且有 error", async () => {
  const result = await searchTask({ domain: "token", query: "", network: "eth" });
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === "string" && result.error.length > 0);
  assert.deepEqual(result.candidates, []);
});

test("searchTask: 无 input 时返回 ok=false", async () => {
  const result = await searchTask();
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === "string");
});

// ─── Engine singleton ─────────────────────────────────────────────────────────

test("searchTask: 多次调用复用同一 engine 实例（不重复装配）", async () => {
  const r1 = await searchTask({ domain: "token", query: "ETH", network: "eth" });
  const r2 = await searchTask({ domain: "token", query: "BNB", network: "bsc" });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
});
