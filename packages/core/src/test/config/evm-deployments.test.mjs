import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  loadEvmDeployment,
  getEvmDeployedAddress,
  resolveEvmDeploymentDirs,
} from "../../apps/evm/index.mjs";

test("evm deployments: 默认可读取 legacy deployment 文件", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "evm-deployment-"));
  const deploymentFile = path.join(tmp, "56.json");
  await fs.writeFile(
    deploymentFile,
    JSON.stringify({
      chainId: 56,
      contracts: {
        Router: {
          address: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
        },
      },
      tokens: {},
    }),
    "utf8",
  );

  const res = await loadEvmDeployment({ chainId: 56, deploymentDirs: [tmp] });
  assert.equal(res.found, true);
  assert.equal(res.deployment.chainId, 56);
  assert.equal(typeof res.filePath, "string");
});

test("evm deployments: 可读取指定 key 地址", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "evm-deployment-"));
  const deploymentFile = path.join(tmp, "56.json");
  await fs.writeFile(
    deploymentFile,
    JSON.stringify({
      chainId: 56,
      contracts: {
        Router: {
          address: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
        },
      },
      tokens: {},
    }),
    "utf8",
  );

  const router = await getEvmDeployedAddress({
    chainId: 56,
    key: "Router",
    deploymentDirs: [tmp],
  });
  assert.equal(typeof router, "string");
  assert.ok(router.startsWith("0x"));
});

test("evm deployments: resolveEvmDeploymentDirs 包含 legacy 目录兜底", async () => {
  const dirs = resolveEvmDeploymentDirs();
  assert.ok(Array.isArray(dirs));
  assert.ok(dirs.length > 0);
  assert.equal(dirs.some((item) => item.endsWith("packages/legacy/deployments")), false);
  assert.equal(dirs.some((item) => item.endsWith("packages/core/src/apps/evm/deployments")), true);
});
