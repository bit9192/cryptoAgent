import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseKeyFile } from "../../modules/key/parse.mjs";
import { preprocessKeyDocument } from "../../modules/key/preprocess.mjs";
import { createSssShareBundle } from "../../modules/key/sss.mjs";
import { storeEncryptedPath } from "../../modules/key/store.mjs";
import {
  assertKeyFileNotExists,
  maskSecret,
  normalizeName,
  writeSssBackupFiles,
} from "./shared.mjs";

function randomPrivateKeyHex() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * key.create: 创建新私钥，写入常用加密存储，并可选输出 SSS 备份。
 *
 * @param {Object} options
 * @param {string} [options.name]
 * @param {string} options.password
 * @param {boolean} [options.backup=false]
 * @param {number} [options.threshold=2]
 * @param {number} [options.sharesCount=3]
 * @param {string} [options.storageRoot='storage']
 * @returns {Promise<{name:string, keyFile:string, backup?:Object}>}
 */
export async function keyCreate(options = {}) {
  const {
    name,
    password,
    backup = false,
    threshold = 2,
    sharesCount = 3,
    storageRoot = "storage",
  } = options;

  if (!password || String(password).length < 8) {
    throw new Error("password 至少 8 位");
  }

  const normalizedName = normalizeName(name);
  await assertKeyFileNotExists({ storageRoot, name: normalizedName });

  const privateKeyHex = randomPrivateKeyHex();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "key-create-"));
  const seedDoc = path.join(tmpDir, `${normalizedName}.md`);
  const sourceText = `${normalizedName}\n${privateKeyHex}\n`;
  const preprocessed = preprocessKeyDocument({ sourceText });
  const parsed = parseKeyFile(preprocessed.content);
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error("create 失败：生成的密钥文档无效");
  }

  await fs.writeFile(seedDoc, preprocessed.content, "utf8");

  try {
    const stored = await storeEncryptedPath({
      inputPath: seedDoc,
      password,
      bucket: "common",
      storageRoot,
      fileName: `${normalizedName}.enc.json`,
    });

    if (!backup) {
      return {
        name: normalizedName,
        keyFile: path.relative(process.cwd(), stored.storedFile),
        privateKeyMasked: maskSecret(privateKeyHex),
      };
    }

    const bundle = createSssShareBundle({
      secretHex: privateKeyHex,
      threshold,
      sharesCount,
      label: normalizedName,
    });

    const backupFiles = await writeSssBackupFiles({
      storageRoot,
      bundle,
    });

    return {
      name: normalizedName,
      keyFile: path.relative(process.cwd(), stored.storedFile),
      privateKeyMasked: maskSecret(privateKeyHex),
      backup: {
        groupId: bundle.groupId,
        threshold: bundle.threshold,
        sharesCount: bundle.sharesCount,
        fingerprint: bundle.fingerprint,
        groupDir: backupFiles.groupDir,
        metaFile: backupFiles.metaFile,
        shareFiles: backupFiles.shareFiles,
      },
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
