import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import sss from "shamirs-secret-sharing";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

function toStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function ensureNotExists(targetPath) {
  try {
    await fs.access(targetPath);
    throw new Error(`目标已存在，请更换路径: ${path.relative(process.cwd(), targetPath)}`);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeThreshold(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 2) {
    throw new Error("threshold 必须是 >= 2 的整数");
  }
  return n;
}

function normalizeSharesCount(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 2) {
    throw new Error("sharesCount 必须是 >= 2 的整数");
  }
  return n;
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

async function encryptPayload(buffer, passphrase) {
  if (!passphrase) {
    return {
      payloadBytes: buffer,
      encryption: {
        enabled: false,
      },
    };
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await scryptAsync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    payloadBytes: encrypted,
    encryption: {
      enabled: true,
      algorithm: "aes-256-gcm",
      kdf: "scrypt",
      saltBase64: salt.toString("base64"),
      ivBase64: iv.toString("base64"),
      tagBase64: tag.toString("base64"),
    },
  };
}

async function countFiles(rootPath) {
  const stat = await fs.stat(rootPath);
  if (stat.isFile()) {
    return 1;
  }

  let count = 0;
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(abs);
      continue;
    }
    if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

async function collectFileEntries(sourceType, resolvedSource) {
  if (sourceType === "file") {
    const content = await fs.readFile(resolvedSource);
    return [{
      relativePath: path.basename(resolvedSource),
      size: content.byteLength,
      sha256: sha256Hex(content),
      contentBase64: content.toString("base64"),
    }];
  }

  const entries = [];
  async function walk(dirPath, prefix = "") {
    const children = await fs.readdir(dirPath, { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const abs = path.join(dirPath, child.name);
      const rel = prefix ? path.posix.join(prefix, child.name) : child.name;
      if (child.isDirectory()) {
        await walk(abs, rel);
        continue;
      }
      if (!child.isFile()) {
        continue;
      }
      const content = await fs.readFile(abs);
      entries.push({
        relativePath: rel,
        size: content.byteLength,
        sha256: sha256Hex(content),
        contentBase64: content.toString("base64"),
      });
    }
  }

  await walk(resolvedSource);
  return entries;
}

/**
 * key.backup: 备份整个 key 目录或单个 key 文件。
 *
 * @param {Object} options
 * @param {'directory'|'file'} options.sourceType
 * @param {string} options.sourcePath
 * @param {string} [options.destinationPath]
 * @param {number} [options.threshold=2]
 * @param {number} [options.sharesCount=3]
 * @param {string} [options.passphrase]
 * @param {string} [options.storageRoot='storage']
 * @returns {Promise<{sourceType:string,sourcePath:string,destinationPath:string,fileCount:number,threshold:number,sharesCount:number,shareCount:number,manifestFile:string,shareFiles:string[],passphraseEnabled:boolean}>}
 */
export async function keyBackup(options = {}) {
  const {
    sourceType,
    sourcePath,
    destinationPath,
    threshold = 2,
    sharesCount = 3,
    passphrase = "",
    storageRoot = "storage",
  } = options;

  const normalizedType = String(sourceType ?? "").trim();
  if (normalizedType !== "directory" && normalizedType !== "file") {
    throw new Error("sourceType 必须是 directory 或 file");
  }

  if (!sourcePath) {
    throw new Error("sourcePath 不能为空");
  }

  const normalizedThreshold = normalizeThreshold(threshold);
  const normalizedSharesCount = normalizeSharesCount(sharesCount);
  const normalizedPassphrase = normalizeOptionalPassphrase(passphrase);
  if (normalizedThreshold > normalizedSharesCount) {
    throw new Error("threshold 不能大于 sharesCount");
  }

  const resolvedSource = path.resolve(process.cwd(), String(sourcePath));
  const sourceStat = await fs.stat(resolvedSource).catch(() => null);
  if (!sourceStat) {
    throw new Error(`源路径不存在: ${path.relative(process.cwd(), resolvedSource)}`);
  }

  if (normalizedType === "file" && !sourceStat.isFile()) {
    throw new Error("sourceType=file 但 sourcePath 不是文件");
  }
  if (normalizedType === "directory" && !sourceStat.isDirectory()) {
    throw new Error("sourceType=directory 但 sourcePath 不是目录");
  }

  const defaultDestRoot = path.resolve(
    process.cwd(),
    storageRoot,
    "backup",
    `key-sss-backup-${toStamp()}`,
  );

  const resolvedDestination = destinationPath
    ? path.resolve(process.cwd(), String(destinationPath))
    : defaultDestRoot;
  await ensureNotExists(resolvedDestination);
  await fs.mkdir(resolvedDestination, { recursive: true });

  const files = await collectFileEntries(normalizedType, resolvedSource);
  const bundle = {
    version: "key-sss-backup-bundle-v1",
    createdAt: new Date().toISOString(),
    sourceType: normalizedType,
    sourcePath: path.relative(process.cwd(), resolvedSource),
    fileCount: files.length,
    files,
  };

  const bundleBytes = Buffer.from(JSON.stringify(bundle), "utf8");
  const encryptedPayload = await encryptPayload(bundleBytes, normalizedPassphrase);
  const payloadBytes = encryptedPayload.payloadBytes;
  const shareBuffers = sss.split(payloadBytes, {
    shares: normalizedSharesCount,
    threshold: normalizedThreshold,
  });

  const bundleSha256 = sha256Hex(bundleBytes);
  const payloadSha256 = sha256Hex(payloadBytes);
  const manifest = {
    version: "key-sss-backup-manifest-v1",
    createdAt: new Date().toISOString(),
    sourceType: normalizedType,
    sourcePath: bundle.sourcePath,
    fileCount: files.length,
    threshold: normalizedThreshold,
    sharesCount: normalizedSharesCount,
    passphraseEnabled: Boolean(normalizedPassphrase),
    bundleSha256,
    payloadSha256,
    bundleSize: bundleBytes.byteLength,
    payloadSize: payloadBytes.byteLength,
    encryption: encryptedPayload.encryption,
    shares: shareBuffers.map((_, idx) => ({ index: idx + 1 })),
  };

  const manifestFile = path.join(resolvedDestination, "manifest.json");
  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const shareFiles = [];
  for (let i = 0; i < shareBuffers.length; i += 1) {
    const idx = i + 1;
    const sharePath = path.join(resolvedDestination, `share.${idx}.json`);
    const payload = {
      version: "key-sss-share-v1",
      index: idx,
      threshold: normalizedThreshold,
      sharesCount: normalizedSharesCount,
      payloadSha256,
      shareHex: Buffer.from(shareBuffers[i]).toString("hex"),
    };
    await fs.writeFile(sharePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    shareFiles.push(path.relative(process.cwd(), sharePath));
  }

  return {
    sourceType: normalizedType,
    sourcePath: bundle.sourcePath,
    destinationPath: path.relative(process.cwd(), resolvedDestination),
    fileCount: files.length,
    threshold: normalizedThreshold,
    sharesCount: normalizedSharesCount,
    shareCount: shareFiles.length,
    manifestFile: path.relative(process.cwd(), manifestFile),
    shareFiles,
    passphraseEnabled: Boolean(normalizedPassphrase),
  };
}
