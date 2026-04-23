import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseKeyFile } from "../../modules/key/parse.mjs";
import { preprocessKeyDocument } from "../../modules/key/preprocess.mjs";
import { createSssShareBundle } from "../../modules/key/sss.mjs";
import { storeEncryptedPath } from "../../modules/key/store.mjs";
import { assertKeyFileNotExists, normalizeName, writeSssBackupFiles } from "./shared.mjs";

function stripHexPrefix(secret) {
  return String(secret ?? "").replace(/^0x/i, "").trim();
}

function buildStoredDoc(sourceText) {
  const normalized = String(sourceText ?? "").replace(/\r\n/g, "\n");
  if (!normalized) return "";
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

/**
 * key.import: 导入密钥文件，转规范内容后加密存储，并可选生成 SSS 备份。
 *
 * @param {Object} options
 * @param {string} [options.inputPath]
 * @param {string} [options.inputContent]
 * @param {string} options.password
 * @param {string} [options.name]
 * @param {boolean} [options.backup=false]
 * @param {number} [options.threshold=2]
 * @param {number} [options.sharesCount=3]
 * @param {string} [options.storageRoot='storage']
 * @returns {Promise<{name:string,inputPath:string|null,sourceType:string,keyFile:string,entryCount:number,warnings:string[],backupGroups:Array}>}
 */
export async function keyImport(options = {}) {
  const {
    inputPath,
    inputContent,
    password,
    name,
    backup = false,
    threshold = 2,
    sharesCount = 3,
    storageRoot = "storage",
  } = options;

  const hasPath = Boolean(String(inputPath ?? "").trim());
  const hasContent = Boolean(String(inputContent ?? "").trim());
  if (!hasPath && !hasContent) {
    throw new Error("inputPath 与 inputContent 至少提供一个");
  }

  if (!password || String(password).length < 8) {
    throw new Error("password 至少 8 位");
  }

  const resolvedInput = hasPath ? path.resolve(process.cwd(), String(inputPath)) : null;
  const inlineContent = hasContent
    ? String(inputContent).replace(/\\n/g, "\n")
    : null;
  const sourceText = resolvedInput
    ? await fs.readFile(resolvedInput, "utf8")
    : inlineContent;

  const preprocessed = preprocessKeyDocument({ sourceText });
  const parsed = parseKeyFile(preprocessed.content);

  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error("导入失败：未解析到有效密钥条目");
  }

  const fallbackName = resolvedInput ? path.parse(resolvedInput).name : "inline";
  const normalizedName = normalizeName(name ?? fallbackName, "import");
  await assertKeyFileNotExists({ storageRoot, name: normalizedName });

  const storedDoc = buildStoredDoc(preprocessed.content);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "key-import-"));
  const tmpFile = path.join(tmpDir, `${normalizedName}.md`);
  await fs.writeFile(tmpFile, storedDoc, "utf8");

  try {
    const stored = await storeEncryptedPath({
      inputPath: tmpFile,
      password,
      bucket: "common",
      storageRoot,
      fileName: `${normalizedName}.enc.json`,
    });

    const backupGroups = [];
    const warnings = [
      ...(Array.isArray(preprocessed.warnings) ? preprocessed.warnings : []),
      ...(Array.isArray(parsed.errors) ? parsed.errors : []),
    ];

    if (backup) {
      const privateKeyEntries = parsed.entries.filter((entry) => entry.type === "privateKey");

      for (const entry of privateKeyEntries) {
        const secretHex = stripHexPrefix(entry.secret);
        const bundle = createSssShareBundle({
          secretHex,
          threshold,
          sharesCount,
          label: entry.name,
        });
        const backupFiles = await writeSssBackupFiles({ storageRoot, bundle });
        backupGroups.push({
          name: entry.name,
          groupId: bundle.groupId,
          threshold: bundle.threshold,
          sharesCount: bundle.sharesCount,
          fingerprint: bundle.fingerprint,
          groupDir: backupFiles.groupDir,
          metaFile: backupFiles.metaFile,
          shareFiles: backupFiles.shareFiles,
        });
      }

      const skipped = parsed.entries.length - privateKeyEntries.length;
      if (skipped > 0) {
        warnings.push(`已跳过 ${skipped} 条非 privateKey 条目，未生成 SSS 备份`);
      }
    }

    return {
      name: normalizedName,
      inputPath: resolvedInput ? path.relative(process.cwd(), resolvedInput) : null,
      sourceType: resolvedInput ? "file" : "content",
      keyFile: path.relative(process.cwd(), stored.storedFile),
      entryCount: parsed.entries.length,
      generatedCount: preprocessed.generated.length,
      warnings,
      backupGroups,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
