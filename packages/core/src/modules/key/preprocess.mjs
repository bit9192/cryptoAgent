import crypto from "node:crypto";

import { Wallet } from "ethers";

const DIRECTIVE_PREFIXES = Object.freeze(["@address-config", "@passphrase"]);

const PRIVATE_KEY_PLACEHOLDERS = new Set([
  "private_key_placeholder",
  "privatekey_placeholder",
  "private-key-placeholder",
  "<private-key>",
  "私钥占位符",
]);

const MNEMONIC_PLACEHOLDERS = new Set([
  "mnemonic_placeholder",
  "mnemonic-placeholder",
  "<mnemonic>",
  "助记词占位符",
]);

function normalizeText(input) {
  return String(input ?? "").replace(/\r\n/g, "\n");
}

function isDirectiveLine(line) {
  const trimmed = String(line ?? "").trim().toLowerCase();
  return DIRECTIVE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function classifyPlaceholder(line) {
  const normalized = String(line ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (PRIVATE_KEY_PLACEHOLDERS.has(normalized)) return "privateKey";
  if (MNEMONIC_PLACEHOLDERS.has(normalized)) return "mnemonic";
  return null;
}

function maskSecret(secret) {
  const value = String(secret ?? "").trim();
  if (value.length < 12) return "[MASKED]";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function generatePrivateKeyHex() {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

function generateMnemonic() {
  const phrase = Wallet.createRandom()?.mnemonic?.phrase;
  if (!phrase) {
    throw new Error("助记词生成失败");
  }
  return String(phrase).trim().replace(/\s+/g, " ");
}

function splitIntoBlocks(lines) {
  const blocks = [];
  let start = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = String(lines[i] ?? "").trim();
    const isBlank = trimmed === "";

    if (!isBlank && start < 0) {
      start = i;
      continue;
    }

    if (isBlank && start >= 0) {
      blocks.push({ start, end: i - 1 });
      start = -1;
    }
  }

  if (start >= 0) {
    blocks.push({ start, end: lines.length - 1 });
  }

  return blocks;
}

function resolveBlockName(lines, indices) {
  if (!Array.isArray(indices) || indices.length === 0) {
    return "unnamed";
  }
  const line = String(lines[indices[0]] ?? "").trim();
  return line || "unnamed";
}

/**
 * 统一预处理密钥文档：
 * 1) 规范换行
 * 2) 把密钥位置占位符替换为随机私钥/助记词
 *
 * @param {Object} options
 * @param {string} options.sourceText
 * @param {boolean} [options.enablePlaceholder=true]
 * @returns {{content:string, generated:Array<{name:string,type:'privateKey'|'mnemonic',line:number,masked:string}>, warnings:string[]}}
 */
export function preprocessKeyDocument(options = {}) {
  const sourceText = normalizeText(options.sourceText);
  const enablePlaceholder = options.enablePlaceholder !== false;

  const lines = sourceText.split("\n");
  const blocks = splitIntoBlocks(lines);

  const generated = [];
  const warnings = [];

  if (enablePlaceholder) {
    for (const block of blocks) {
      const meaningful = [];
      for (let i = block.start; i <= block.end; i += 1) {
        const trimmed = String(lines[i] ?? "").trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("#")) continue;
        if (isDirectiveLine(trimmed)) continue;
        meaningful.push(i);
      }

      if (meaningful.length < 2) {
        continue;
      }

      const name = resolveBlockName(lines, meaningful);
      const secretLineIndex = meaningful[1];
      const placeholderType = classifyPlaceholder(lines[secretLineIndex]);
      if (!placeholderType) {
        continue;
      }

      const secret = placeholderType === "privateKey"
        ? generatePrivateKeyHex()
        : generateMnemonic();

      lines[secretLineIndex] = secret;
      generated.push({
        name,
        type: placeholderType,
        line: secretLineIndex + 1,
        masked: maskSecret(secret),
      });
    }
  }

  if (generated.length > 0) {
    warnings.push(`检测到并替换占位符 ${generated.length} 处，已自动生成真实密钥`);
  }

  return {
    content: lines.join("\n"),
    generated,
    warnings,
  };
}

export function buildKeyDocEditorTemplate() {
  return [
    "# 密钥文档编辑说明",
    "# 1) 每条记录至少两行：第一行 name，第二行 secret。",
    "# 2) secret 支持：hex 私钥 / WIF 私钥 / 12-24 英文助记词。",
    "# 3) 也可用占位符自动生成：PRIVATE_KEY_PLACEHOLDER 或 MNEMONIC_PLACEHOLDER。",
    "# 4) 可选扩展行：@passphrase your-bip39-passphrase",
    "# 5) 可选扩展行：@address-config chain=btc type=all path=m/84'/0'/0'/0/[0,2]",
    "#",
    "# 示例（按需取消注释或直接在下方新增）：",
    "# wallet-main",
    "# PRIVATE_KEY_PLACEHOLDER",
    "#",
    "# wallet-seed",
    "# MNEMONIC_PLACEHOLDER",
    "# @passphrase your-passphrase",
    "# @address-config chain=evm path=m/44'/60'/0'/0/[0,2]",
    "",
    "",
  ].join("\n");
}
