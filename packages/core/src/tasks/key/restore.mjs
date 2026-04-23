import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import sss from "shamirs-secret-sharing";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

function toStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function resolveManifestPath(backupPath) {
  const abs = path.resolve(process.cwd(), String(backupPath));
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) {
    throw new Error(`备份路径不存在: ${path.relative(process.cwd(), abs)}`);
  }

  if (stat.isFile()) {
    return abs;
  }

  return path.join(abs, "manifest.json");
}

async function readManifest(backupPath) {
  const manifestPath = await resolveManifestPath(backupPath);
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  if (manifest?.version !== "key-sss-backup-manifest-v1") {
    throw new Error("不支持的 backup manifest 版本");
  }
  return { manifestPath, manifest };
}

function normalizeOptionalPassphrase(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  if (raw.length < 8) {
    throw new Error("passphrase 至少 8 位");
  }
  return raw;
}

async function decryptPayload(buffer, manifest, passphrase) {
  const encryption = manifest?.encryption ?? { enabled: false };
  if (!encryption.enabled) {
    return buffer;
  }

  const normalizedPassphrase = normalizeOptionalPassphrase(passphrase);
  if (!normalizedPassphrase) {
    const error = new Error("该备份启用了 passphrase，需要输入密码后才能恢复");
    error.code = "BACKUP_PASSPHRASE_REQUIRED";
    throw error;
  }

  const salt = Buffer.from(String(encryption.saltBase64 ?? ""), "base64");
  const iv = Buffer.from(String(encryption.ivBase64 ?? ""), "base64");
  const tag = Buffer.from(String(encryption.tagBase64 ?? ""), "base64");
  const key = await scryptAsync(normalizedPassphrase, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key), iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(buffer), decipher.final()]);
  } catch {
    const error = new Error("passphrase 错误，无法解密备份内容");
    error.code = "BACKUP_PASSPHRASE_INVALID";
    throw error;
  }
}

export async function inspectBackupManifest(backupPath) {
  const { manifestPath, manifest } = await readManifest(backupPath);
  return {
    manifestPath: path.relative(process.cwd(), manifestPath),
    passphraseEnabled: Boolean(manifest?.encryption?.enabled),
    threshold: Number(manifest?.threshold ?? 0),
    sharesCount: Number(manifest?.sharesCount ?? 0),
    sourceType: String(manifest?.sourceType ?? ""),
    sourcePath: String(manifest?.sourcePath ?? ""),
  };
}

/**
 * key.restore: 从 SSS 备份恢复文件/目录。
 *
 * @param {Object} options
 * @param {string} options.backupPath - 备份目录或 manifest.json 路径
 * @param {string} [options.outputPath] - 恢复目标目录
 * @param {string} [options.passphrase]
 * @param {string} [options.storageRoot='storage']
 * @returns {Promise<{backupPath:string,outputPath:string,sourceType:string,sourcePath:string,restoredFileCount:number,usedShares:number,threshold:number}>}
 */
export async function keyRestore(options = {}) {
  const {
    backupPath,
    outputPath,
    passphrase = "",
    storageRoot = "storage",
  } = options;

  if (!backupPath) {
    throw new Error("backupPath 不能为空");
  }

  const { manifestPath, manifest } = await readManifest(backupPath);

  const backupDir = path.dirname(manifestPath);
  const allEntries = await fs.readdir(backupDir, { withFileTypes: true });
  const shareFiles = allEntries
    .filter((entry) => entry.isFile() && /^share\.\d+\.json$/.test(entry.name))
    .map((entry) => path.join(backupDir, entry.name))
    .sort();

  if (shareFiles.length < Number(manifest.threshold)) {
    throw new Error(`恢复失败：至少需要 ${manifest.threshold} 份分片，当前仅找到 ${shareFiles.length} 份`);
  }

  const shares = [];
  const expectedPayloadSha256 = String(manifest.payloadSha256 ?? manifest.bundleSha256 ?? "");
  for (const shareFile of shareFiles) {
    const payload = JSON.parse(await fs.readFile(shareFile, "utf8"));
    const sharePayloadSha256 = String(payload?.payloadSha256 ?? payload?.bundleSha256 ?? "");
    if (sharePayloadSha256 !== expectedPayloadSha256) {
      continue;
    }
    shares.push(Buffer.from(String(payload.shareHex ?? ""), "hex"));
  }

  if (shares.length < Number(manifest.threshold)) {
    throw new Error("恢复失败：可用分片不足（校验不通过）");
  }

  const usedShares = shares.slice(0, Number(manifest.threshold));
  const payloadBytes = Buffer.from(sss.combine(usedShares));
  if (sha256Hex(payloadBytes) !== expectedPayloadSha256) {
    throw new Error("恢复失败：分片组合校验不通过");
  }

  const bundleBytes = await decryptPayload(payloadBytes, manifest, passphrase);
  if (sha256Hex(bundleBytes) !== manifest.bundleSha256) {
    throw new Error("恢复失败：bundle 校验不通过");
  }

  const bundle = JSON.parse(bundleBytes.toString("utf8"));
  if (bundle?.version !== "key-sss-backup-bundle-v1" || !Array.isArray(bundle?.files)) {
    throw new Error("恢复失败：备份 bundle 格式非法");
  }

  const restoreRoot = outputPath
    ? path.resolve(process.cwd(), String(outputPath))
    : path.resolve(process.cwd(), storageRoot, "restore", `key-restore-${toStamp()}`);

  await fs.mkdir(restoreRoot, { recursive: true });

  for (const item of bundle.files) {
    const rel = String(item?.relativePath ?? "");
    if (!rel || rel.includes("..")) {
      throw new Error("恢复失败：检测到非法相对路径");
    }
    const raw = Buffer.from(String(item?.contentBase64 ?? ""), "base64");
    if (sha256Hex(raw) !== item?.sha256) {
      throw new Error(`恢复失败：文件校验失败 ${rel}`);
    }
    const target = path.join(restoreRoot, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, raw);
  }

  return {
    backupPath: path.relative(process.cwd(), backupDir),
    outputPath: path.relative(process.cwd(), restoreRoot),
    sourceType: bundle.sourceType,
    sourcePath: bundle.sourcePath,
    restoredFileCount: bundle.files.length,
    usedShares: usedShares.length,
    threshold: Number(manifest.threshold),
  };
}
