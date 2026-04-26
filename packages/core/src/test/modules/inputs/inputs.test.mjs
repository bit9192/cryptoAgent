import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearInputs,
  setInputs,
  showInputs,
  patchInputs,
  resolveInputs,
} from "../../../modules/inputs/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTDATA_PATH = path.join(__dirname, "testdata.md");

test("inputs testdata: 覆盖四类样本标题", async () => {
  const content = await fs.readFile(TESTDATA_PATH, "utf8");
  assert.match(content, /^# Happy Cases/m);
  assert.match(content, /^# Edge Cases/m);
  assert.match(content, /^# Invalid Cases/m);
  assert.match(content, /^# Security Cases/m);
});

test("inputs: set + show 可写入并读取 scope 数据", () => {
  clearInputs("t-inputs-1");
  const setRes = setInputs("t-inputs-1", {
    scope: "wallet",
    data: {
      keyId: "k1",
      chain: "evm",
      address: "0xabc",
    },
  });

  assert.equal(setRes.ok, true);
  const showRes = showInputs("t-inputs-1", { scope: "wallet" });
  assert.equal(showRes.count, 1);
  assert.equal(showRes.items[0].data.keyId, "k1");
  assert.equal(showRes.items[0].data.chain, "evm");
});

test("inputs: 同 scope set 会整体覆盖旧值", () => {
  clearInputs("t-inputs-2");
  setInputs("t-inputs-2", {
    scope: "wallet",
    data: {
      keyId: "k1",
      chain: "evm",
      address: "0xabc",
    },
  });

  setInputs("t-inputs-2", {
    scope: "wallet",
    data: {
      keyId: "k2",
      chain: "btc",
    },
  });

  const showRes = showInputs("t-inputs-2", { scope: "wallet" });
  assert.equal(showRes.count, 1);
  assert.equal(showRes.items[0].data.keyId, "k2");
  assert.equal(showRes.items[0].data.chain, "btc");
  assert.equal("address" in showRes.items[0].data, false);
});

test("inputs: ttlMs 过期后 show 返回空", async () => {
  clearInputs("t-inputs-3");
  setInputs("t-inputs-3", {
    scope: "wallet",
    ttlMs: 20,
    data: {
      keyId: "k1",
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  const showRes = showInputs("t-inputs-3", { scope: "wallet" });
  assert.equal(showRes.count, 0);
  assert.deepEqual(showRes.items, []);
});

test("inputs: clear 可按 scope 或全量清空", () => {
  clearInputs("t-inputs-4");
  setInputs("t-inputs-4", { scope: "wallet", data: { keyId: "k1" } });
  setInputs("t-inputs-4", { scope: "search", data: { query: "usdt" } });

  const partial = clearInputs("t-inputs-4", { scope: "wallet" });
  assert.equal(partial.removed, 1);
  assert.equal(showInputs("t-inputs-4", {}).count, 1);

  const all = clearInputs("t-inputs-4", {});
  assert.equal(all.removed, 1);
  assert.equal(showInputs("t-inputs-4", {}).count, 0);
});

test("inputs: patch 仅更新局部字段", () => {
  clearInputs("t-inputs-7");
  setInputs("t-inputs-7", {
    scope: "wallet",
    data: {
      keyId: "k1",
      chain: "evm",
      amount: "1",
      token: {
        symbol: "USDT",
        address: "0x111",
      },
    },
  });

  const patchRes = patchInputs("t-inputs-7", {
    scope: "wallet",
    data: {
      amount: "2",
      token: {
        address: "0x222",
      },
    },
  });

  assert.equal(patchRes.ok, true);
  const showRes = showInputs("t-inputs-7", { scope: "wallet" });
  assert.equal(showRes.items[0].data.keyId, "k1");
  assert.equal(showRes.items[0].data.amount, "2");
  assert.equal(showRes.items[0].data.token.symbol, "USDT");
  assert.equal(showRes.items[0].data.token.address, "0x222");
});

test("inputs: resolve 按 args > inputs > defaults 合并", () => {
  clearInputs("t-inputs-8");
  setInputs("t-inputs-8", {
    scope: "wallet",
    data: {
      chain: "evm",
      address: "0xabc",
      amount: "1",
    },
  });

  const resolved = resolveInputs("t-inputs-8", {
    scope: "wallet",
    defaults: {
      chain: "btc",
      symbol: "USDT",
      amount: "0",
    },
    args: {
      amount: "3",
    },
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.resolvedArgs.chain, "evm");
  assert.equal(resolved.resolvedArgs.symbol, "USDT");
  assert.equal(resolved.resolvedArgs.address, "0xabc");
  assert.equal(resolved.resolvedArgs.amount, "3");
});

test("inputs: resolve 支持 allowFields 裁剪", () => {
  clearInputs("t-inputs-9");
  setInputs("t-inputs-9", {
    scope: "wallet",
    data: {
      keyId: "k1",
      chain: "evm",
      address: "0xabc",
    },
  });

  const resolved = resolveInputs("t-inputs-9", {
    scope: "wallet",
    args: { amount: "1" },
    allowFields: ["chain", "address"],
  });

  assert.deepEqual(resolved.resolvedArgs, {
    chain: "evm",
    address: "0xabc",
  });
});

test("inputs: show 输出不包含敏感字段", () => {
  clearInputs("t-inputs-5");
  setInputs("t-inputs-5", {
    scope: "wallet",
    data: {
      keyId: "k1",
      privateKey: "0xsecret",
      mnemonic: "word1 word2",
      password: "123456",
      nested: {
        privateKey: "0xinner",
      },
    },
  });

  const showRes = showInputs("t-inputs-5", { scope: "wallet" });
  const payload = JSON.stringify(showRes);
  assert.equal(payload.includes("privateKey"), false);
  assert.equal(payload.includes("mnemonic"), false);
  assert.equal(payload.includes("password"), false);
});

test("inputs: 无效入参抛错", () => {
  assert.throws(() => setInputs("t-inputs-6", { data: {} }), /scope 不能为空/);
  assert.throws(() => setInputs("t-inputs-6", { scope: "wallet", ttlMs: -1, data: {} }), /ttlMs 必须是正数/);
  assert.throws(() => setInputs("t-inputs-6", { scope: "wallet", data: [] }), /data 必须是对象/);
  assert.throws(() => patchInputs("t-inputs-6", { scope: "wallet", data: {} }), /scope 不存在/);
  assert.throws(() => resolveInputs("t-inputs-6", { scope: "" }), /scope 不能为空/);
});
