import fs from "node:fs/promises";
import path from "node:path";

export function normalizeName(value, prefix = "key") {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  }
  return raw;
}

export function maskSecret(secret) {
  const s = String(secret ?? "");
  if (s.length < 12) {
    return "[MASKED]";
  }
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

export function resolveKeyFilePath(options = {}) {
  const storageRoot = String(options.storageRoot ?? "storage");
  const name = String(options.name ?? "").trim();
  if (!name) {
    throw new Error("name 不能为空");
  }
  return path.resolve(process.cwd(), storageRoot, "key", `${name}.enc.json`);
}

export async function assertKeyFileNotExists(options = {}) {
  const targetPath = resolveKeyFilePath(options);

  try {
    await fs.access(targetPath);
    const error = new Error(`同名文件已存在: ${path.relative(process.cwd(), targetPath)}，请换名字`);
    error.code = "KEY_FILE_EXISTS";
    error.filePath = path.relative(process.cwd(), targetPath);
    throw error;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

export async function writeSssBackupFiles(options = {}) {
  const {
    storageRoot = "storage",
    bundle,
  } = options;

  const baseDir = path.resolve(process.cwd(), storageRoot, "backup", "sss", bundle.groupId);
  await fs.mkdir(baseDir, { recursive: true });

  const metaPath = path.join(baseDir, "bundle.json");
  await fs.writeFile(metaPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const shareFiles = [];
  for (const share of bundle.shares) {
    const sharePath = path.join(baseDir, `${bundle.groupId}.${share.index}.share.json`);
    const payload = {
      version: bundle.version,
      groupId: bundle.groupId,
      index: share.index,
      threshold: bundle.threshold,
      sharesCount: bundle.sharesCount,
      fingerprint: bundle.fingerprint,
      createdAt: bundle.createdAt,
      label: bundle.label,
      shareHex: share.shareHex,
    };
    await fs.writeFile(sharePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    shareFiles.push(sharePath);
  }

  return {
    groupDir: baseDir,
    metaFile: metaPath,
    shareFiles,
  };
}
