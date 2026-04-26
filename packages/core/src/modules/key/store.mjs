import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { decryptPathFromFile, encryptPathToFile } from "./encrypt.mjs";
import { parseKeyFileFromPath } from "./parse.mjs";

function resolveStorageRoot(storageRoot) {
  return path.resolve(process.cwd(), String(storageRoot ?? "storage"));
}

function resolveBucketName(bucket) {
  if (bucket === "backup") {
    return "backup";
  }
  return "key";
}

async function ensureBucketDir(options = {}) {
  const root = resolveStorageRoot(options.storageRoot);
  const bucket = resolveBucketName(options.bucket);
  const bucketDir = path.join(root, bucket);
  await fs.mkdir(bucketDir, { recursive: true });
  return { root, bucket, bucketDir };
}

function buildStoredFileName(inputPath, fileName) {
  if (fileName) {
    return String(fileName).endsWith(".enc.json")
      ? String(fileName)
      : `${String(fileName)}.enc.json`;
  }

  const base = path.basename(String(inputPath));
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${base}.${stamp}.enc.json`;
}

/**
 * 直接将已加密的 envelope 对象写入存储（用于 page-import 等场景）。
 *
 * @param {Object} options
 * @param {Object} options.envelope   - 已加密的 JSON 对象
 * @param {'common'|'backup'} [options.bucket='common']
 * @param {string} [options.storageRoot='storage']
 * @param {string} [options.fileName]
 * @returns {Promise<{storedFile:string,bucket:string,fileCount:number,sourceType:string,sourceName:string}>}
 */
export async function storeEncryptedEnvelope(options = {}) {
  const {
    envelope,
    bucket = "common",
    storageRoot = "storage",
    fileName = `page-import-${Date.now()}.enc.json`,
  } = options;

  if (!envelope || typeof envelope !== "object") {
    throw new Error("envelope 不能为空");
  }

  const { bucket: normalizedBucket, bucketDir } = await ensureBucketDir({ bucket, storageRoot });
  const targetName = String(fileName).endsWith(".enc.json") ? String(fileName) : `${String(fileName)}.enc.json`;
  const targetFile = path.join(bucketDir, targetName);

  await fs.writeFile(targetFile, JSON.stringify(envelope, null, 2), "utf8");

  return {
    storedFile: targetFile,
    bucket: normalizedBucket,
    fileCount: 1,
    sourceType: "envelope",
    sourceName: targetName,
  };
}

/**
 * 按分类（常用 key / 备份 backup）存储加密包。
 *
 * @param {Object} options
 * @param {string} options.inputPath
 * @param {string} options.password
 * @param {'common'|'backup'} [options.bucket='common']
 * @param {string} [options.storageRoot='storage']
 * @param {string} [options.fileName]
 * @returns {Promise<{storedFile:string,bucket:string,fileCount:number,sourceType:string,sourceName:string}>}
 */
export async function storeEncryptedPath(options = {}) {
  const {
    inputPath,
    password,
    bucket = "common",
    storageRoot = "storage",
    fileName,
  } = options;

  if (!inputPath) {
    throw new Error("inputPath 不能为空");
  }

  const { bucket: normalizedBucket, bucketDir } = await ensureBucketDir({ bucket, storageRoot });
  const targetName = buildStoredFileName(inputPath, fileName);
  const targetFile = path.join(bucketDir, targetName);

  const result = await encryptPathToFile({
    inputPath,
    password,
    outputFile: targetFile,
  });

  return {
    storedFile: result.outputFile,
    bucket: normalizedBucket,
    fileCount: result.fileCount,
    sourceType: result.sourceType,
    sourceName: result.sourceName,
  };
}

/**
 * 从存储的加密包解密读取到指定目录。
 *
 * @param {Object} options
 * @param {string} options.storedFile
 * @param {string} options.password
 * @param {string} options.outputDir
 * @returns {Promise<{outputDir:string,fileCount:number,sourceType:string,sourceName:string}>}
 */
export async function readEncryptedPath(options = {}) {
  const { storedFile, password, outputDir } = options;

  if (!storedFile) {
    throw new Error("storedFile 不能为空");
  }

  return await decryptPathFromFile({
    encryptedFile: storedFile,
    password,
    outputDir,
  });
}

/**
 * 校验加密文件密码是否正确（不返回明文内容）。
 *
 * @param {Object} options
 * @param {string} options.storedFile
 * @param {string} options.password
 * @returns {Promise<{ok:boolean,message?:string}>}
 */
export async function verifyStoredFilePassword(options = {}) {
  const { storedFile, password } = options;
  if (!storedFile) {
    return { ok: false, message: "storedFile 不能为空" };
  }
  if (!password) {
    return { ok: false, message: "password 不能为空" };
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "key-store-verify-"));
  try {
    await readEncryptedPath({
      storedFile,
      password,
      outputDir: workDir,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error?.message ?? "解锁失败",
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function findFirstKeyLikeFile(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const abs = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstKeyLikeFile(abs);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const lower = entry.name.toLowerCase();
    if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".key")) {
      return abs;
    }
  }

  return null;
}

/**
 * 从加密包直接读取密钥队列（内部先解密到临时目录，再执行 parse）。
 *
 * @param {Object} options
 * @param {string} options.storedFile
 * @param {string} options.password
 * @param {string} [options.tempDir]
 * @param {boolean} [options.keepTemp=false]
 * @returns {Promise<{entries:Array,errors:string[],parsedFile:string}>}
 */
export async function loadKeyQueueFromStoredFile(options = {}) {
  const {
    storedFile,
    password,
    tempDir,
    keepTemp = false,
  } = options;

  if (!storedFile) {
    throw new Error("storedFile 不能为空");
  }

  const workDir = tempDir
    ? path.resolve(process.cwd(), String(tempDir))
    : await fs.mkdtemp(path.join(os.tmpdir(), "key-store-read-"));

  try {
    await readEncryptedPath({
      storedFile,
      password,
      outputDir: workDir,
    });

    const keyFile = await findFirstKeyLikeFile(workDir);
    if (!keyFile) {
      throw new Error("解密成功，但未找到可解析的密钥文件（.md/.txt/.key）");
    }

    const parsed = await parseKeyFileFromPath(keyFile);
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      throw new Error(`密钥文档格式错误：${parsed.errors.join("；")}`);
    }
    return {
      ...parsed,
      parsedFile: keyFile,
    };
  } finally {
    if (!keepTemp && !tempDir) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
}

/**
 * 解锁后读取加密 key 文件中的原始文档内容。
 *
 * @param {Object} options
 * @param {string} options.storedFile
 * @param {string} options.password
 * @returns {Promise<{content:string,parsedFile:string}>}
 */
export async function revealStoredFileContent(options = {}) {
  const {
    storedFile,
    password,
  } = options;

  if (!storedFile) {
    throw new Error("storedFile 不能为空");
  }
  if (!password) {
    throw new Error("password 不能为空");
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "key-store-reveal-"));
  try {
    await readEncryptedPath({
      storedFile,
      password,
      outputDir: workDir,
    });

    const keyFile = await findFirstKeyLikeFile(workDir);
    if (!keyFile) {
      throw new Error("解密成功，但未找到可读取的密钥文档");
    }

    const content = await fs.readFile(keyFile, "utf8");
    return {
      content,
      parsedFile: keyFile,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
