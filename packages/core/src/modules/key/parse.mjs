/**
 * modules/key/parse.mjs
 *
 * 文件预处理：将宽松格式的密钥文档（.md 或纯文本）解析为结构化的条目队列。
 *
 * 输入格式（宽松，任意一种均可）：
 *   名称
 *   <助记词或私钥>
 *
 * 输出格式：
 *   Array<{ name: string, secret: string, type: 'mnemonic' | 'privateKey' }>
 *
 * 规则：
 *   - 空行、以 # 开头的注释行忽略
 *   - 以密钥行为锚点，向上找最近的非密钥行作为名称
 *   - 名称缺失时用 unnamed_<密钥前8字符> 补位
 *   - 不支持路径行（path 解析属于更上层的关注点）
 */

// ── 密钥类型判断 ──────────────────────────────────────────────

function isHexPrivateKey(s) {
  return /^(0x)?[a-fA-F0-9]{64}$/.test(s.trim());
}

function isWifPrivateKey(s) {
  return /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(s.trim());
}

function isMnemonic(s) {
  const words = s.trim().split(/\s+/).filter((w) => /^[a-zA-Z]+$/.test(w));
  return words.length >= 12 && words.length <= 24;
}

// ── 常见噪声前缀清理（用于检测前的预处理）─────────────────────

function stripNoisePrefixes(line) {
  // 去掉 Markdown 引用标记 "> " 及多重引用 ">> "
  return line.replace(/^(>\s*)+/, "").trim();
}

function looksLikeSecret(line) {
  const s = stripNoisePrefixes(line).trim();
  if (!s) return false;
  return isHexPrivateKey(s) || isWifPrivateKey(s) || isMnemonic(s);
}

// ── 密钥清理（去掉引用标记等噪声字符）────────────────────────

function sanitizeSecret(raw) {
  const s = String(raw ?? "").trim();

  const hexMatch = s.match(/(0x)?([a-fA-F0-9]{64})/);
  if (hexMatch) {
    return hexMatch[1] === "0x" ? `0x${hexMatch[2]}` : hexMatch[2];
  }

  const wifMatch = s.match(/([5KL][1-9A-HJ-NP-Za-km-z]{50,51})/);
  if (wifMatch) return wifMatch[1];

  const words = s.split(/\s+/).filter((w) => /^[a-zA-Z]+$/.test(w));
  if (words.length >= 12 && words.length <= 24) {
    return words.join(" ");
  }

  return s.replace(/^[^a-zA-Z0-9]+/, "").replace(/[^a-zA-Z0-9\s]+$/, "").trim();
}

function detectType(secret) {
  if (isHexPrivateKey(secret) || isWifPrivateKey(secret)) return "privateKey";
  if (isMnemonic(secret)) return "mnemonic";
  return "unknown";
}

// ── 主解析函数 ────────────────────────────────────────────────

/**
 * 将宽松格式文本解析为密钥条目队列。
 *
 * @param {string} text - 原始文本内容
 * @returns {{ entries: Array<{name:string, secret:string, type:string}>, errors: string[] }}
 */
export function parseKeyFile(text) {
  const rawLines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const lines = rawLines.map((raw, idx) => ({
    idx,
    raw,
    trimmed: raw.trim(),
    isComment: raw.trim().startsWith("#"),
    isBlank: raw.trim() === "",
  }));

  // 找出所有密钥行的位置
  const secretIndices = lines
    .filter((l) => !l.isComment && !l.isBlank && looksLikeSecret(l.trimmed))
    .map((l) => l.idx);

  const entries = [];
  const errors = [];
  const usedIndices = new Set();

  for (const secretIdx of secretIndices) {
    if (usedIndices.has(secretIdx)) continue;

    const rawSecret = lines[secretIdx].trimmed;
    const secret = sanitizeSecret(rawSecret);
    usedIndices.add(secretIdx);

    // 向上找最近的非空、非注释、非密钥行作为名称
    let name = null;
    for (let i = secretIdx - 1; i >= 0; i--) {
      const l = lines[i];
      if (usedIndices.has(i)) continue;
      if (l.isBlank || l.isComment) continue;
      if (looksLikeSecret(l.trimmed)) break; // 遇到另一个密钥行，停止
      name = l.trimmed;
      usedIndices.add(i);
      break;
    }

    if (!name) {
      name = `unnamed_${secret.replace(/\s+/g, "").slice(0, 8)}`;
      errors.push(`第 ${secretIdx + 1} 行的密钥未找到名称，已自动命名为 "${name}"`);
    }

    entries.push({
      name,
      secret,
      type: detectType(secret),
    });
  }

  if (entries.length === 0) {
    errors.push("未找到任何有效密钥（支持格式：64位hex私钥、WIF私钥、12-24个英文助记词）");
  }

  return { entries, errors };
}

/**
 * 从文件路径读取并解析。
 *
 * @param {string} filePath
 * @returns {Promise<{ entries: Array<{name:string, secret:string, type:string}>, errors: string[] }>}
 */
export async function parseKeyFileFromPath(filePath) {
  const fs = await import("node:fs/promises");
  const text = await fs.readFile(filePath, "utf8");
  return parseKeyFile(text);
}
