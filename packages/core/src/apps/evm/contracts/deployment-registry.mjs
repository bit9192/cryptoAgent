import fs from "node:fs/promises";
import path from "node:path";

import { resolveEvmDeploymentDirs, loadEvmDeployment } from "../configs/deployments.js";

const SCHEMA_VERSION = 1;

function ensureChainId(chainId) {
  const normalized = Number(chainId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error("chainId 必须是正整数");
  }
  return normalized;
}

function createEmptyDeployment(chainId, networkName = null) {
  return {
    schemaVersion: SCHEMA_VERSION,
    chainId,
    network: networkName ?? null,
    contracts: {},
    proxies: {},
    tokens: {},
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDeployment(deployment, chainId, networkName = null) {
  const normalized = (deployment && typeof deployment === "object") ? { ...deployment } : {};
  normalized.schemaVersion = Number(normalized.schemaVersion ?? SCHEMA_VERSION);
  normalized.chainId = chainId;
  normalized.network = normalized.network ?? networkName ?? null;
  normalized.contracts = normalized.contracts ?? {};
  normalized.proxies = normalized.proxies ?? {};
  normalized.tokens = normalized.tokens ?? {};
  normalized.updatedAt = normalized.updatedAt ?? new Date().toISOString();
  return normalized;
}

function resolveTargetFilePath(chainId, options = {}) {
  const dirs = resolveEvmDeploymentDirs(options);
  const targetDir = dirs[0];
  if (!targetDir) {
    throw new Error("没有可用 deployment 目录");
  }
  return path.join(targetDir, `${chainId}.json`);
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempFilePath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tempFilePath, payload, "utf8");
  await fs.rename(tempFilePath, filePath);
}

export async function loadDeploymentRegistry(input = {}) {
  const chainId = ensureChainId(input.chainId);
  const loaded = await loadEvmDeployment({ ...input, chainId });

  if (!loaded.found) {
    return {
      found: false,
      chainId,
      filePath: resolveTargetFilePath(chainId, input),
      deployment: createEmptyDeployment(chainId, input.networkName ?? input.network ?? null),
    };
  }

  return {
    found: true,
    chainId,
    filePath: loaded.filePath,
    deployment: normalizeDeployment(
      loaded.deployment,
      chainId,
      input.networkName ?? input.network ?? null,
    ),
  };
}

export async function saveDeploymentRegistry(input = {}) {
  const chainId = ensureChainId(input.chainId);
  const deployment = normalizeDeployment(
    input.deployment,
    chainId,
    input.networkName ?? input.network ?? null,
  );

  const filePath = resolveTargetFilePath(chainId, input);
  deployment.updatedAt = new Date().toISOString();
  await writeJsonAtomic(filePath, deployment);

  return {
    chainId,
    filePath,
    deployment,
  };
}

export async function upsertDeploymentRecord(input = {}) {
  const kind = String(input.kind ?? "contracts").trim();
  if (!["contracts", "proxies", "tokens"].includes(kind)) {
    throw new Error("kind 仅支持 contracts/proxies/tokens");
  }

  const deploymentKey = String(input.deploymentKey ?? "").trim();
  if (!deploymentKey) {
    throw new Error("deploymentKey 不能为空");
  }

  const chainId = ensureChainId(input.chainId);
  const loaded = await loadDeploymentRegistry({
    chainId,
    deploymentDirs: input.deploymentDirs,
    networkName: input.networkName,
    network: input.network,
  });

  const nextDeployment = normalizeDeployment(
    loaded.deployment,
    chainId,
    input.networkName ?? input.network ?? null,
  );

  const nowIso = new Date().toISOString();
  nextDeployment[kind][deploymentKey] = {
    ...(nextDeployment[kind][deploymentKey] ?? {}),
    ...(input.record ?? {}),
    deploymentKey,
    updatedAt: nowIso,
    createdAt: nextDeployment[kind][deploymentKey]?.createdAt ?? nowIso,
  };

  const saved = await saveDeploymentRegistry({
    chainId,
    deployment: nextDeployment,
    deploymentDirs: input.deploymentDirs,
    networkName: input.networkName,
    network: input.network,
  });

  return {
    ...saved,
    record: saved.deployment[kind][deploymentKey],
    kind,
    deploymentKey,
  };
}

export async function getDeploymentRecord(input = {}) {
  const kind = String(input.kind ?? "contracts").trim();
  if (!["contracts", "proxies", "tokens"].includes(kind)) {
    throw new Error("kind 仅支持 contracts/proxies/tokens");
  }

  const deploymentKey = String(input.deploymentKey ?? "").trim();
  if (!deploymentKey) {
    throw new Error("deploymentKey 不能为空");
  }

  const loaded = await loadDeploymentRegistry(input);
  const record = loaded.deployment?.[kind]?.[deploymentKey] ?? null;

  return {
    ...loaded,
    kind,
    deploymentKey,
    foundRecord: Boolean(record),
    record,
  };
}

export async function listDeploymentRecords(input = {}) {
  const kind = String(input.kind ?? "contracts").trim();
  if (!["contracts", "proxies", "tokens"].includes(kind)) {
    throw new Error("kind 仅支持 contracts/proxies/tokens");
  }

  const loaded = await loadDeploymentRegistry(input);
  const table = loaded.deployment?.[kind] ?? {};

  return {
    ...loaded,
    kind,
    items: Object.entries(table).map(([deploymentKey, record]) => ({
      deploymentKey,
      ...(record ?? {}),
    })),
  };
}

export async function removeDeploymentRecord(input = {}) {
  const kind = String(input.kind ?? "contracts").trim();
  if (!["contracts", "proxies", "tokens"].includes(kind)) {
    throw new Error("kind 仅支持 contracts/proxies/tokens");
  }

  const deploymentKey = String(input.deploymentKey ?? "").trim();
  if (!deploymentKey) {
    throw new Error("deploymentKey 不能为空");
  }

  const chainId = ensureChainId(input.chainId);
  const loaded = await loadDeploymentRegistry({
    chainId,
    deploymentDirs: input.deploymentDirs,
    networkName: input.networkName,
    network: input.network,
  });

  const nextDeployment = normalizeDeployment(
    loaded.deployment,
    chainId,
    input.networkName ?? input.network ?? null,
  );

  if (!nextDeployment[kind][deploymentKey]) {
    return {
      ...loaded,
      kind,
      deploymentKey,
      removed: false,
    };
  }

  delete nextDeployment[kind][deploymentKey];
  const saved = await saveDeploymentRegistry({
    chainId,
    deployment: nextDeployment,
    deploymentDirs: input.deploymentDirs,
    networkName: input.networkName,
    network: input.network,
  });

  return {
    ...saved,
    kind,
    deploymentKey,
    removed: true,
  };
}
