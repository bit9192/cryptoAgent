import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { encryptPathToFile } from "../../modules/key/encrypt.mjs";
import { parseKeyFile } from "../../modules/key/parse.mjs";
import { revealStoredFileContent } from "../../modules/key/store.mjs";

function isHexPrivateKey(s) {
  return /^(0x)?[a-fA-F0-9]{64}$/.test(String(s ?? "").trim());
}

function isWifPrivateKey(s) {
  return /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(String(s ?? "").trim());
}

function isMnemonic(s) {
  const normalized = String(s ?? "").trim().replace(/\s+/gu, " ");
  if (!normalized) return false;
  const words = normalized.split(" ").filter((w) => /^[a-zA-Z]+$/.test(w));
  return [12, 15, 18, 21, 24].includes(words.length);
}

function detectSecretType(secret) {
  if (isHexPrivateKey(secret) || isWifPrivateKey(secret)) {
    return "privateKey";
  }
  if (isMnemonic(secret)) {
    return "mnemonic";
  }
  return "unknown";
}

function normalizeSecret(secret) {
  const type = detectSecretType(secret);
  const text = String(secret ?? "").trim();
  if (type === "privateKey") {
    return `privateKey:${text.replace(/^0x/i, "").toLowerCase()}`;
  }
  if (type === "mnemonic") {
    return `mnemonic:${text.toLowerCase().replace(/\s+/g, " ")}`;
  }
  return `unknown:${text}`;
}

function escapeRegExp(text) {
  return String(text ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPlaceholder(entry, index) {
  const prefix = entry.type === "mnemonic"
    ? "MNEMONIC_PROTECTED"
    : "PRIVATE_KEY_PROTECTED";
  return `${prefix}_${index + 1}`;
}

function buildSecretProtection(content) {
  const parsed = parseKeyFile(content);
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error("编辑失败：未解析到有效密钥条目");
  }

  let editableContent = String(content ?? "");
  const placeholders = [];

  for (let i = 0; i < parsed.entries.length; i += 1) {
    const entry = parsed.entries[i];
    const placeholder = buildPlaceholder(entry, i);
    const rawSecret = String(entry.secret ?? "");
    const escaped = escapeRegExp(rawSecret);
    const regex = new RegExp(`(^|\\n)${escaped}(?=\\n|$)`, "m");
    if (!regex.test(editableContent)) {
      throw new Error(`编辑保护生成失败：无法定位密钥行 ${entry.name}`);
    }
    editableContent = editableContent.replace(regex, `$1${placeholder}`);
    placeholders.push({
      index: i,
      name: entry.name,
      type: entry.type,
      secret: rawSecret,
      placeholder,
    });
  }

  return {
    editableContent,
    placeholders,
    originalEntryCount: parsed.entries.length,
    originalSecrets: parsed.entries.map((entry) => normalizeSecret(entry.secret)),
  };
}

function applySecretProtectionCommit(editedContent, protection) {
  let finalContent = String(editedContent ?? "");
  const placeholders = Array.isArray(protection?.placeholders) ? protection.placeholders : [];

  for (const item of placeholders) {
    const placeholder = String(item.placeholder ?? "");
    const secret = String(item.secret ?? "");
    if (!placeholder) continue;

    const escaped = escapeRegExp(placeholder);
    const regex = new RegExp(`(^|\\n)${escaped}(?=\\n|$)`, "g");
    const matches = finalContent.match(regex) ?? [];
    if (matches.length !== 1) {
      throw new Error(`编辑提交失败：占位符缺失或重复（${placeholder}）`);
    }
    finalContent = finalContent.replace(regex, `$1${secret}`);
  }

  return finalContent;
}

function validateFinalContent(finalContent, protection) {
  const parsed = parseKeyFile(finalContent);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

  const expectedCount = Number(protection?.originalEntryCount ?? 0);
  if (entries.length !== expectedCount) {
    throw new Error(`编辑提交失败：不允许新增/删除密钥条目（期望 ${expectedCount}，实际 ${entries.length}）`);
  }

  const expected = Array.isArray(protection?.originalSecrets)
    ? [...protection.originalSecrets].sort()
    : [];
  const current = entries.map((entry) => normalizeSecret(entry.secret)).sort();

  if (expected.length !== current.length) {
    throw new Error("编辑提交失败：密钥条目数量不一致");
  }

  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i] !== current[i]) {
      throw new Error("编辑提交失败：检测到密钥内容被修改");
    }
  }

  return {
    entryCount: entries.length,
    warnings: Array.isArray(parsed.errors) ? parsed.errors : [],
  };
}

export async function keyEditPrepare(options = {}) {
  const keyFile = String(options.keyFile ?? "").trim();
  const password = String(options.password ?? "");

  if (!keyFile) {
    throw new Error("keyFile 不能为空");
  }
  if (!password) {
    throw new Error("password 不能为空");
  }

  const resolved = path.resolve(process.cwd(), keyFile);
  const revealed = await revealStoredFileContent({
    storedFile: resolved,
    password,
  });

  const protection = buildSecretProtection(revealed.content);

  return {
    keyFile: path.relative(process.cwd(), resolved),
    editableContent: protection.editableContent,
    protection,
  };
}

export async function keyEditCommit(options = {}) {
  const keyFile = String(options.keyFile ?? "").trim();
  const password = String(options.password ?? "");
  const editedContent = String(options.editedContent ?? "");
  const protection = options.protection ?? null;

  if (!keyFile) {
    throw new Error("keyFile 不能为空");
  }
  if (!password) {
    throw new Error("password 不能为空");
  }
  if (!protection || typeof protection !== "object") {
    throw new Error("protection 不能为空");
  }

  const resolved = path.resolve(process.cwd(), keyFile);
  const finalContent = applySecretProtectionCommit(editedContent, protection);
  const validation = validateFinalContent(finalContent, protection);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "key-edit-"));
  const tmpFile = path.join(tmpDir, "edited.md");

  try {
    await fs.writeFile(tmpFile, finalContent.endsWith("\n") ? finalContent : `${finalContent}\n`, "utf8");
    await encryptPathToFile({
      inputPath: tmpFile,
      password,
      outputFile: resolved,
    });

    return {
      keyFile: path.relative(process.cwd(), resolved),
      entryCount: validation.entryCount,
      warnings: validation.warnings,
      updated: true,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
