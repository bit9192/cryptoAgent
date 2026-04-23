import fs from "node:fs/promises";
import path from "node:path";

import { validateRuleSpec } from "./index.mjs";

function nowIso() {
  return new Date().toISOString();
}

function makeVersion() {
  return nowIso().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function sanitizeName(name, label) {
  const raw = String(name ?? "").trim();
  if (!raw) {
    throw new TypeError(`${label} 不能为空`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(raw)) {
    throw new TypeError(`${label} 包含非法字符，仅允许字母数字._-`);
  }
  return raw;
}

function resolveRegistryDir(options = {}) {
  const storageRoot = path.resolve(process.cwd(), String(options.storageRoot ?? "storage"));
  const namespace = sanitizeName(options.namespace ?? "default", "namespace");
  return path.join(storageRoot, "apps", "data-engine", "rules", namespace);
}

function ruleManifestPath(registryDir, ruleName) {
  return path.join(registryDir, `${ruleName}.manifest.json`);
}

function ruleVersionPath(registryDir, ruleName, version) {
  return path.join(registryDir, `${ruleName}.v${version}.json`);
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(temp, filePath);
}

async function readJson(filePath, fallback = null) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

function newManifest(ruleName) {
  return {
    ruleName,
    activeVersion: null,
    versions: [],
    updatedAt: nowIso(),
  };
}

function getVersionEntry(manifest, version) {
  return manifest.versions.find((v) => v.version === version) ?? null;
}

export async function saveRuleSpec(options = {}) {
  const ruleName = sanitizeName(options.ruleName, "ruleName");
  const version = sanitizeName(options.version ?? makeVersion(), "version");
  const note = options.note ? String(options.note) : "";
  const spec = validateRuleSpec(options.spec ?? {});

  const registryDir = resolveRegistryDir(options);
  const manifestFile = ruleManifestPath(registryDir, ruleName);
  const versionFile = ruleVersionPath(registryDir, ruleName, version);

  const manifest = await readJson(manifestFile, newManifest(ruleName));
  if (getVersionEntry(manifest, version)) {
    throw new Error(`规则 ${ruleName} 版本 ${version} 已存在`);
  }

  const record = {
    ruleName,
    version,
    createdAt: nowIso(),
    note,
    spec,
  };

  await writeJsonAtomic(versionFile, record);

  manifest.versions.push({
    version,
    file: path.basename(versionFile),
    createdAt: record.createdAt,
    note,
  });

  if (!manifest.activeVersion) {
    manifest.activeVersion = version;
  }
  manifest.updatedAt = nowIso();
  await writeJsonAtomic(manifestFile, manifest);

  return {
    ruleName,
    version,
    activeVersion: manifest.activeVersion,
    file: versionFile,
  };
}

export async function listRuleVersions(options = {}) {
  const ruleName = sanitizeName(options.ruleName, "ruleName");
  const registryDir = resolveRegistryDir(options);
  const manifestFile = ruleManifestPath(registryDir, ruleName);
  const manifest = await readJson(manifestFile, newManifest(ruleName));
  return {
    ruleName,
    activeVersion: manifest.activeVersion,
    versions: manifest.versions,
  };
}

export async function activateRuleVersion(options = {}) {
  const ruleName = sanitizeName(options.ruleName, "ruleName");
  const version = sanitizeName(options.version, "version");

  const registryDir = resolveRegistryDir(options);
  const manifestFile = ruleManifestPath(registryDir, ruleName);
  const manifest = await readJson(manifestFile, null);

  if (!manifest) {
    throw new Error(`规则 ${ruleName} 不存在`);
  }

  const entry = getVersionEntry(manifest, version);
  if (!entry) {
    throw new Error(`规则 ${ruleName} 不存在版本 ${version}`);
  }

  manifest.activeVersion = version;
  manifest.updatedAt = nowIso();
  await writeJsonAtomic(manifestFile, manifest);

  return {
    ruleName,
    activeVersion: version,
  };
}

export async function getRuleSpec(options = {}) {
  const ruleName = sanitizeName(options.ruleName, "ruleName");
  const registryDir = resolveRegistryDir(options);
  const manifestFile = ruleManifestPath(registryDir, ruleName);
  const manifest = await readJson(manifestFile, null);

  if (!manifest) {
    throw new Error(`规则 ${ruleName} 不存在`);
  }

  const wantedVersion = options.version
    ? sanitizeName(options.version, "version")
    : manifest.activeVersion;

  if (!wantedVersion) {
    throw new Error(`规则 ${ruleName} 尚无活跃版本`);
  }

  const versionFile = ruleVersionPath(registryDir, ruleName, wantedVersion);
  const data = await readJson(versionFile, null);

  if (!data) {
    throw new Error(`规则 ${ruleName} 版本 ${wantedVersion} 文件不存在`);
  }

  return data;
}

export async function rollbackRuleVersion(options = {}) {
  const ruleName = sanitizeName(options.ruleName, "ruleName");
  const steps = Number(options.steps ?? 1);

  if (!Number.isInteger(steps) || steps <= 0) {
    throw new TypeError("steps 必须是正整数");
  }

  const registryDir = resolveRegistryDir(options);
  const manifestFile = ruleManifestPath(registryDir, ruleName);
  const manifest = await readJson(manifestFile, null);

  if (!manifest || manifest.versions.length === 0) {
    throw new Error(`规则 ${ruleName} 不存在可回滚版本`);
  }

  const idx = manifest.versions.findIndex((v) => v.version === manifest.activeVersion);
  if (idx < 0) {
    throw new Error(`规则 ${ruleName} 活跃版本状态损坏`);
  }

  const targetIdx = idx - steps;
  if (targetIdx < 0) {
    throw new Error(`规则 ${ruleName} 回滚步数超出范围`);
  }

  const target = manifest.versions[targetIdx];
  manifest.activeVersion = target.version;
  manifest.updatedAt = nowIso();
  await writeJsonAtomic(manifestFile, manifest);

  return {
    ruleName,
    activeVersion: target.version,
    rolledBackFrom: manifest.versions[idx].version,
  };
}

export function createRuleRegistry(options = {}) {
  return {
    save: (args) => saveRuleSpec({ ...options, ...args }),
    listVersions: (args) => listRuleVersions({ ...options, ...args }),
    activate: (args) => activateRuleVersion({ ...options, ...args }),
    get: (args) => getRuleSpec({ ...options, ...args }),
    rollback: (args) => rollbackRuleVersion({ ...options, ...args }),
  };
}

export default {
  createRuleRegistry,
  saveRuleSpec,
  listRuleVersions,
  activateRuleVersion,
  getRuleSpec,
  rollbackRuleVersion,
};
