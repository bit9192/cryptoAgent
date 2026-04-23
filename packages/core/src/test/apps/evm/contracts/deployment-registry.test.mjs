import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  upsertDeploymentRecord,
  loadDeploymentRegistry,
  getDeploymentRecord,
  listDeploymentRecords,
  removeDeploymentRecord,
} from "../../../../apps/evm/contracts/deployment-registry.mjs";

async function mkTmpDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("deployment registry: 按 chainId 存取合约记录", async () => {
  const deploymentDir = await mkTmpDir("evm-registry-");
  const chainId = 313372;

  const saved = await upsertDeploymentRecord({
    chainId,
    networkName: "fork",
    deploymentDirs: [deploymentDir],
    kind: "contracts",
    deploymentKey: "TEST_TOKEN",
    record: {
      contractName: "TEST11111",
      address: "0x1111111111111111111111111111111111111111",
      txHash: "0xabc",
    },
  });

  assert.equal(saved.chainId, chainId);
  assert.ok(saved.filePath.endsWith(`${chainId}.json`));
  assert.equal(saved.record.contractName, "TEST11111");

  const loaded = await loadDeploymentRegistry({ chainId, deploymentDirs: [deploymentDir] });
  assert.equal(loaded.found, true);
  assert.equal(loaded.deployment.chainId, chainId);
  assert.equal(loaded.deployment.network, "fork");

  const got = await getDeploymentRecord({
    chainId,
    deploymentDirs: [deploymentDir],
    kind: "contracts",
    deploymentKey: "TEST_TOKEN",
  });
  assert.equal(got.foundRecord, true);
  assert.equal(got.record.address, "0x1111111111111111111111111111111111111111");

  const listed = await listDeploymentRecords({
    chainId,
    deploymentDirs: [deploymentDir],
    kind: "contracts",
  });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].deploymentKey, "TEST_TOKEN");

  const removed = await removeDeploymentRecord({
    chainId,
    deploymentDirs: [deploymentDir],
    kind: "contracts",
    deploymentKey: "TEST_TOKEN",
  });
  assert.equal(removed.removed, true);

  const gotAfterRemove = await getDeploymentRecord({
    chainId,
    deploymentDirs: [deploymentDir],
    kind: "contracts",
    deploymentKey: "TEST_TOKEN",
  });
  assert.equal(gotAfterRemove.foundRecord, false);
});
