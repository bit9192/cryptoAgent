import test from "node:test";
import assert from "node:assert/strict";

import { execute } from "../../execute/execute.mjs";
import { defineTask } from "../../execute/define-task.mjs";

function createStubRegistry(taskDef) {
  return {
    get(id) {
      return id === taskDef.id ? taskDef : null;
    },
  };
}

test("execute output channel: ai 通道应脱敏 private/secret", async () => {
  const task = defineTask({
    id: "test:output.security",
    title: "output security",
    run: async () => ({
      address: "0x3333333333333333333333333333333333333333",
      privateKey: "PRIVATE_KEY_PLACEHOLDER",
      nested: {
        password: "PASSWORD_PLACEHOLDER",
        note: "visible",
      },
    }),
  });

  const res = await execute(
    {
      task: "test:output.security",
      args: {},
      source: "test",
    },
    {
      registry: createStubRegistry(task),
      outputChannel: "ai",
      outputFieldLevels: {
        address: "public",
        privateKey: "private",
        "nested.password": "secret",
        "nested.note": "public",
      },
    }
  );

  assert.equal(res.ok, true);
  assert.equal(res.data.address, "0x3333333333333333333333333333333333333333");
  assert.equal(res.data.privateKey, "[REDACTED]");
  assert.equal(res.data.nested.password, "[REDACTED]");
  assert.equal(res.data.nested.note, "visible");
});

test("execute output channel: 未设置 outputChannel 时保持原始输出", async () => {
  const task = defineTask({
    id: "test:output.raw",
    title: "output raw",
    run: async () => ({
      privateKey: "PRIVATE_KEY_PLACEHOLDER",
      value: 1,
    }),
  });

  const res = await execute(
    {
      task: "test:output.raw",
      args: {},
      source: "test",
    },
    {
      registry: createStubRegistry(task),
    }
  );

  assert.equal(res.ok, true);
  assert.equal(res.data.privateKey, "PRIVATE_KEY_PLACEHOLDER");
  assert.equal(res.data.value, 1);
});
