import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

const PACK_SCHEMA_VERSION = "key-pack-v1";
const ENCRYPTED_SCHEMA_VERSION = "key-enc-v1";

const SCRYPT_PARAMS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 32,
});

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertPassword(password) {
  if (!password || String(password).length < 8) {
    throw new Error("password 至少 8 位");
  }
}

async function deriveKey(password, salt) {
  const key = await scryptAsync(String(password), salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return Buffer.from(key);
}

async function encryptBuffer(plaintext, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(password, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    kdf: {
      name: "scrypt",
      saltBase64: salt.toString("base64"),
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      keyLength: SCRYPT_PARAMS.keyLength,
    },
    encryption: {
      algorithm: "aes-256-gcm",
      ivBase64: iv.toString("base64"),
      tagBase64: tag.toString("base64"),
    },
  };
}

async function decryptBuffer(encryptedPayload, password) {
  const kdf = encryptedPayload?.kdf ?? {};
  const encryption = encryptedPayload?.encryption ?? {};

  if (kdf.name !== "scrypt") {
    throw new Error("不支持的 KDF");
  }
  if (encryption.algorithm !== "aes-256-gcm") {
    throw new Error("不支持的加密算法");
  }

  const salt = Buffer.from(String(kdf.saltBase64 ?? ""), "base64");
  const iv = Buffer.from(String(encryption.ivBase64 ?? ""), "base64");
  const tag = Buffer.from(String(encryption.tagBase64 ?? ""), "base64");
  const ciphertext = Buffer.from(String(encryptedPayload?.ciphertextBase64 ?? ""), "base64");

  const key = await deriveKey(password, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("解密失败：密码错误或密文损坏");
  }
}

async function collectFiles(rootPath) {
  const stat = await fs.stat(rootPath);
  const rootName = path.basename(rootPath);

  if (stat.isFile()) {
    const content = await fs.readFile(rootPath);
    return {
      sourceType: "file",
      sourceName: rootName,
      files: [
        {
          relativePath: rootName,
          size: content.byteLength,
          sha256: sha256Hex(content),
          contentBase64: content.toString("base64"),
        },
      ],
    };
  }

  if (!stat.isDirectory()) {
    throw new Error("仅支持文件或目录加密");
  }

  const files = [];

  async function walk(dirPath, prefix = "") {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const abs = path.join(dirPath, entry.name);
      const rel = prefix ? path.posix.join(prefix, entry.name) : entry.name;

      if (entry.isDirectory()) {
        await walk(abs, rel);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const content = await fs.readFile(abs);
      files.push({
        relativePath: rel,
        size: content.byteLength,
        sha256: sha256Hex(content),
        contentBase64: content.toString("base64"),
      });
    }
  }

  await walk(rootPath);
  return {
    sourceType: "directory",
    sourceName: rootName,
    files,
  };
}

function buildPackPayload(sourcePath, collected) {
  return {
    version: PACK_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    sourcePath: path.resolve(sourcePath),
    sourceType: collected.sourceType,
    sourceName: collected.sourceName,
    files: collected.files,
  };
}

/**
 * 将指定文件或目录打包后加密为单一 json 文件。
 *
 * @param {Object} options
 * @param {string} options.inputPath - 输入文件或目录路径
 * @param {string} options.password - 加密密码（>=8位）
 * @param {string} [options.outputFile] - 输出文件路径，默认在 cwd 生成
 * @returns {Promise<{outputFile:string, fileCount:number, sourceType:string, sourceName:string}>}
 */
export async function encryptPathToFile(options = {}) {
  const { inputPath, password, outputFile } = options;
  if (!inputPath) {
    throw new Error("inputPath 不能为空");
  }
  assertPassword(password);

  const resolvedInput = path.resolve(process.cwd(), String(inputPath));
  const collected = await collectFiles(resolvedInput);
  const packPayload = buildPackPayload(resolvedInput, collected);
  const plaintext = Buffer.from(JSON.stringify(packPayload), "utf8");

  const encrypted = await encryptBuffer(plaintext, password);
  const envelope = {
    version: ENCRYPTED_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    payloadFormat: PACK_SCHEMA_VERSION,
    sourceType: collected.sourceType,
    sourceName: collected.sourceName,
    fileCount: collected.files.length,
    plaintextSha256: sha256Hex(plaintext),
    plaintextSize: plaintext.byteLength,
    kdf: encrypted.kdf,
    encryption: encrypted.encryption,
    ciphertextBase64: encrypted.ciphertext.toString("base64"),
  };

  const defaultName = `${collected.sourceName}.enc.json`;
  const target = path.resolve(process.cwd(), outputFile ? String(outputFile) : defaultName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  return {
    outputFile: target,
    fileCount: collected.files.length,
    sourceType: collected.sourceType,
    sourceName: collected.sourceName,
  };
}

/**
 * 解密加密包，并恢复到指定目录。
 *
 * @param {Object} options
 * @param {string} options.encryptedFile - encryptPathToFile 产物
 * @param {string} options.password - 解密密码
 * @param {string} options.outputDir - 恢复目录
 * @returns {Promise<{outputDir:string, fileCount:number, sourceType:string, sourceName:string}>}
 */
export async function decryptPathFromFile(options = {}) {
  const { encryptedFile, password, outputDir } = options;
  if (!encryptedFile) {
    throw new Error("encryptedFile 不能为空");
  }
  if (!outputDir) {
    throw new Error("outputDir 不能为空");
  }
  assertPassword(password);

  const source = path.resolve(process.cwd(), String(encryptedFile));
  const outputRoot = path.resolve(process.cwd(), String(outputDir));
  const envelope = JSON.parse(await fs.readFile(source, "utf8"));

  if (envelope?.version !== ENCRYPTED_SCHEMA_VERSION) {
    throw new Error("不支持的加密文件版本");
  }

  const plaintext = await decryptBuffer(envelope, password);
  if (sha256Hex(plaintext) !== envelope.plaintextSha256) {
    throw new Error("解密完成但内容校验失败");
  }

  const pack = JSON.parse(plaintext.toString("utf8"));
  if (pack?.version !== PACK_SCHEMA_VERSION || !Array.isArray(pack?.files)) {
    throw new Error("打包内容格式非法");
  }

  for (const item of pack.files) {
    const relativePath = String(item?.relativePath ?? "");
    if (!relativePath || relativePath.includes("..")) {
      throw new Error("打包内容包含非法路径");
    }

    const raw = Buffer.from(String(item?.contentBase64 ?? ""), "base64");
    if (sha256Hex(raw) !== item?.sha256) {
      throw new Error(`文件校验失败: ${relativePath}`);
    }

    const target = path.join(outputRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, raw);
  }

  return {
    outputDir: outputRoot,
    fileCount: pack.files.length,
    sourceType: pack.sourceType,
    sourceName: pack.sourceName,
  };
}
