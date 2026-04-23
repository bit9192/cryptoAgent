import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createRuleRegistry,
  saveRuleSpec,
  listRuleVersions,
  activateRuleVersion,
  getRuleSpec,
  rollbackRuleVersion,
} from "../../../modules/data-engine/rules-registry.mjs";

async function mkTmpStorageRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "data-engine-rules-"));
}

function sampleSpec(overrides = {}) {
  return {
    version: "1.0",
    sourcePath: "rows[*]",
    filters: [{ field: "status", op: "eq", value: "active" }],
    aggregate: { type: "sum", field: "amount", numericMode: "bigint" },
    ...overrides,
  };
}

test("rules-registry: 保存后可读取活跃规则", async () => {
  const storageRoot = await mkTmpStorageRoot();

  const saved = await saveRuleSpec({
    storageRoot,
    namespace: "test",
    ruleName: "collect.tokens",
    version: "20260407120000",
    note: "v1",
    spec: sampleSpec(),
  });

  assert.equal(saved.activeVersion, "20260407120000");

  const loaded = await getRuleSpec({
    storageRoot,
    namespace: "test",
    ruleName: "collect.tokens",
  });

  assert.equal(loaded.version, "20260407120000");
  assert.equal(loaded.spec.aggregate.numericMode, "bigint");
});

test("rules-registry: 激活指定版本", async () => {
  const storageRoot = await mkTmpStorageRoot();
  const options = {
    storageRoot,
    namespace: "test",
    ruleName: "collect.tokens",
  };

  await saveRuleSpec({
    ...options,
    version: "20260407120000",
    note: "v1",
    spec: sampleSpec(),
  });

  await saveRuleSpec({
    ...options,
    version: "20260407123000",
    note: "v2",
    spec: sampleSpec({
      aggregate: { type: "sum", field: "amount", numericMode: "decimal-string" },
    }),
  });

  const activated = await activateRuleVersion({
    ...options,
    version: "20260407123000",
  });

  assert.equal(activated.activeVersion, "20260407123000");

  const loaded = await getRuleSpec(options);
  assert.equal(loaded.version, "20260407123000");
  assert.equal(loaded.spec.aggregate.numericMode, "decimal-string");
});

test("rules-registry: 回滚到上一个版本", async () => {
  const storageRoot = await mkTmpStorageRoot();
  const reg = createRuleRegistry({
    storageRoot,
    namespace: "test",
  });

  await reg.save({
    ruleName: "collect.tokens",
    version: "20260407120000",
    note: "v1",
    spec: sampleSpec({ aggregate: { type: "sum", field: "amount", numericMode: "number" } }),
  });

  await reg.save({
    ruleName: "collect.tokens",
    version: "20260407123000",
    note: "v2",
    spec: sampleSpec({ aggregate: { type: "sum", field: "amount", numericMode: "decimal-string" } }),
  });

  await reg.activate({ ruleName: "collect.tokens", version: "20260407123000" });

  const rolled = await reg.rollback({ ruleName: "collect.tokens", steps: 1 });
  assert.equal(rolled.activeVersion, "20260407120000");
  assert.equal(rolled.rolledBackFrom, "20260407123000");

  const current = await reg.get({ ruleName: "collect.tokens" });
  assert.equal(current.version, "20260407120000");
  assert.equal(current.spec.aggregate.numericMode, "number");
});

test("rules-registry: 版本列表与活跃版本一致", async () => {
  const storageRoot = await mkTmpStorageRoot();

  await saveRuleSpec({
    storageRoot,
    namespace: "test",
    ruleName: "collect.tokens",
    version: "20260407120000",
    spec: sampleSpec(),
  });

  await saveRuleSpec({
    storageRoot,
    namespace: "test",
    ruleName: "collect.tokens",
    version: "20260407123000",
    spec: sampleSpec({ aggregate: { type: "sum", field: "amount", numericMode: "number" } }),
  });

  await activateRuleVersion({
    storageRoot,
    namespace: "test",
    ruleName: "collect.tokens",
    version: "20260407123000",
  });

  const listed = await listRuleVersions({
    storageRoot,
    namespace: "test",
    ruleName: "collect.tokens",
  });

  assert.equal(listed.versions.length, 2);
  assert.equal(listed.activeVersion, "20260407123000");
});

test("rules-registry: 回滚越界应报错", async () => {
  const storageRoot = await mkTmpStorageRoot();

  await saveRuleSpec({
    storageRoot,
    namespace: "test",
    ruleName: "collect.tokens",
    version: "20260407120000",
    spec: sampleSpec(),
  });

  await assert.rejects(
    () => rollbackRuleVersion({
      storageRoot,
      namespace: "test",
      ruleName: "collect.tokens",
      steps: 2,
    }),
    /回滚步数超出范围/
  );
});
