import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { upsertDeploymentRecord } from "../../../../apps/evm/contracts/deployment-registry.mjs";
import { getContract } from "../../../../apps/evm/contracts/deploy.mjs";

async function mkTmpDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("getContract: 未传 deploymentKey 时默认解析到 TEST11111#4 最新地址", async () => {
  const deploymentDir = await mkTmpDir("evm-deploy-key-auto-");
  const chainId = 313371;

  await upsertDeploymentRecord({
    chainId,
    networkName: "fork",
    deploymentDirs: [deploymentDir],
    kind: "contracts",
    deploymentKey: "TEST11111",
    record: {
      contractName: "TEST11111",
      address: "0x1111111111111111111111111111111111111111",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  });

  await upsertDeploymentRecord({
    chainId,
    networkName: "fork",
    deploymentDirs: [deploymentDir],
    kind: "contracts",
    deploymentKey: "TEST11111#2",
    record: {
      contractName: "TEST11111",
      address: "0x2222222222222222222222222222222222222222",
      updatedAt: "2026-02-01T00:00:00.000Z",
      createdAt: "2026-02-01T00:00:00.000Z",
    },
  });

  await upsertDeploymentRecord({
    chainId,
    networkName: "fork",
    deploymentDirs: [deploymentDir],
    kind: "contracts",
    deploymentKey: "TEST11111#3",
    record: {
      contractName: "TEST11111",
      address: "0x3333333333333333333333333333333333333333",
      updatedAt: "2026-03-01T00:00:00.000Z",
      createdAt: "2026-03-01T00:00:00.000Z",
    },
  });

  await upsertDeploymentRecord({
    chainId,
    networkName: "fork",
    deploymentDirs: [deploymentDir],
    kind: "contracts",
    deploymentKey: "TEST11111#4",
    record: {
      contractName: "TEST11111",
      address: "0xaBfb666BB4b2588D3259D8744e6971d74Aa55e9f",
      updatedAt: "2026-04-05T08:24:56.967Z",
      createdAt: "2026-04-05T08:24:56.967Z",
    },
  });

  const c = await getContract("TEST11111", null, {
    networkName: "fork",
    chainId,
    deploymentDirs: [deploymentDir],
    // runner/provider 仅用于构造实例，本用例只验证地址解析
    runner: {
      getBlockNumber: async () => 0,
      getNetwork: async () => ({ chainId: BigInt(chainId) }),
      call: async () => "0x",
      estimateGas: async () => 21000n,
      resolveName: async () => null,
      provider: null,
    },
    autoCompile: true,
  });

  assert.equal(String(c.target).toLowerCase(), "0xabfb666bb4b2588d3259d8744e6971d74aa55e9f");
});
