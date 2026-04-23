import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function dedupeDirs(dirs) {
  const result = [];
  const seen = new Set();
  for (const dir of dirs) {
    const normalized = path.resolve(String(dir || ""));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function resolveEvmDeploymentDirs(input = {}) {
  const fromInput = Array.isArray(input.deploymentDirs) ? input.deploymentDirs : [];
  const fromEnv = process.env.EVM_DEPLOYMENTS_DIR ? [process.env.EVM_DEPLOYMENTS_DIR] : [];

  const defaults = [
    path.resolve(MODULE_DIR, "../deployments"),
    path.resolve(process.cwd(), "packages/core/src/apps/evm/deployments"),
  ];

  return dedupeDirs([...fromInput, ...fromEnv, ...defaults]);
}

async function readJsonIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return null;
    }
    throw error;
  }
}

export async function loadEvmDeployment(input = {}) {
  const chainId = Number(input.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("chainId 必须是正整数");
  }

  const dirs = resolveEvmDeploymentDirs(input);
  const fileName = `${chainId}.json`;

  for (const dir of dirs) {
    const fullPath = path.join(dir, fileName);
    const deployment = await readJsonIfExists(fullPath);
    if (!deployment) continue;
    return {
      found: true,
      chainId,
      filePath: fullPath,
      deployment,
    };
  }

  return {
    found: false,
    chainId,
    filePath: null,
    deployment: null,
  };
}

export async function getEvmDeployedAddress(input = {}) {
  const deploymentRes = await loadEvmDeployment(input);
  if (!deploymentRes.found) {
    throw new Error(`未找到 chainId=${input.chainId} 的 deployment`);
  }

  const key = String(input.key ?? "").trim();
  if (!key) {
    throw new Error("key 不能为空");
  }

  const contracts = deploymentRes.deployment?.contracts || {};
  const tokens = deploymentRes.deployment?.tokens || {};
  const contractEntry = contracts[key] || tokens[key];

  if (!contractEntry?.address) {
    throw new Error(`deployment 中未找到地址: ${key}`);
  }

  return String(contractEntry.address);
}
