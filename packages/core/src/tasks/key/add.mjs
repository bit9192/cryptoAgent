import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { encryptPathToFile } from "../../modules/key/encrypt.mjs";
import { parseKeyFile } from "../../modules/key/parse.mjs";
import { preprocessKeyDocument } from "../../modules/key/preprocess.mjs";
import { loadKeyQueueFromStoredFile } from "../../modules/key/store.mjs";

function normalizeSecretKey(entry) {
  const type = String(entry?.type ?? "unknown").toLowerCase();
  const secret = String(entry?.secret ?? "").trim();

  if (type === "privatekey") {
    return `privateKey:${secret.replace(/^0x/i, "").toLowerCase()}`;
  }

  return `${type}:${secret.toLowerCase().replace(/\s+/g, " ")}`;
}

function buildCanonicalDoc(entries) {
  return `${entries
    .map((entry) => `${entry.name}\n${entry.secret}`)
    .join("\n\n")}\n`;
}

/**
 * key.add: 在已有加密 key 文件中追加密钥条目（去重后写回）。
 *
 * @param {Object} options
 * @param {string} options.keyFile
 * @param {string} [options.inputPath]
 * @param {string} [options.inputContent]
 * @param {string} options.password
 * @returns {Promise<{keyFile:string,addedCount:number,skippedCount:number,totalCount:number,warnings:string[]}>}
 */
export async function keyAdd(options = {}) {
  const {
    keyFile,
    inputPath,
    inputContent,
    password,
  } = options;

  if (!keyFile) {
    throw new Error("keyFile 不能为空");
  }
  if (!password || String(password).length < 8) {
    throw new Error("password 至少 8 位");
  }

  const hasPath = Boolean(String(inputPath ?? "").trim());
  const hasContent = Boolean(String(inputContent ?? "").trim());
  if (!hasPath && !hasContent) {
    throw new Error("inputPath 与 inputContent 至少提供一个");
  }

  const resolvedKeyFile = path.resolve(process.cwd(), String(keyFile));
  const existing = await loadKeyQueueFromStoredFile({
    storedFile: resolvedKeyFile,
    password,
  });

  const sourceText = hasPath
    ? await fs.readFile(path.resolve(process.cwd(), String(inputPath)), "utf8")
    : String(inputContent).replace(/\\n/g, "\n");

  const preprocessed = preprocessKeyDocument({ sourceText });
  const parsed = parseKeyFile(preprocessed.content);

  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    throw new Error(`新增失败：${parsed.errors.join("；")}`);
  }

  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error("新增失败：未解析到有效密钥条目");
  }

  const existingKeys = new Set(existing.entries.map((entry) => normalizeSecretKey(entry)));
  const warnings = [
    ...(Array.isArray(preprocessed.warnings) ? preprocessed.warnings : []),
  ];
  const nextEntries = [...existing.entries];
  let skippedCount = 0;

  for (const entry of parsed.entries) {
    const secretKey = normalizeSecretKey(entry);
    if (existingKeys.has(secretKey)) {
      skippedCount += 1;
      warnings.push(`跳过重复密钥: ${entry.name}`);
      continue;
    }
    existingKeys.add(secretKey);
    nextEntries.push(entry);
  }

  const addedCount = nextEntries.length - existing.entries.length;
  if (addedCount === 0) {
    return {
      keyFile: path.relative(process.cwd(), resolvedKeyFile),
      addedCount,
      skippedCount,
      totalCount: nextEntries.length,
      generatedCount: preprocessed.generated.length,
      warnings,
    };
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "key-add-"));
  const tmpFile = path.join(tmpDir, "merged.md");

  try {
    await fs.writeFile(tmpFile, buildCanonicalDoc(nextEntries), "utf8");
    await encryptPathToFile({
      inputPath: tmpFile,
      password,
      outputFile: resolvedKeyFile,
    });

    return {
      keyFile: path.relative(process.cwd(), resolvedKeyFile),
      addedCount,
      skippedCount,
      totalCount: nextEntries.length,
      generatedCount: preprocessed.generated.length,
      warnings,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
