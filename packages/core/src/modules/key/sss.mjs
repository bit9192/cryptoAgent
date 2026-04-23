import crypto from "node:crypto";
import sss from "shamirs-secret-sharing";

const SHARE_SCHEMA_VERSION = "sss-share-v1";

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeSecretHex(secretHex) {
  const normalized = String(secretHex ?? "")
    .trim()
    .replace(/^0x/i, "")
    .toLowerCase();

  if (!normalized || !/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("secretHex 必须是偶数长度十六进制字符串");
  }

  return normalized;
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

/**
 * 生成 SSS 分片包。
 *
 * @param {Object} options
 * @param {string} options.secretHex - 十六进制 secret
 * @param {number} [options.threshold=2]
 * @param {number} [options.sharesCount=3]
 * @param {string} [options.label=""]
 * @returns {{version:string,groupId:string,threshold:number,sharesCount:number,fingerprint:string,shares:Array<{index:number,shareHex:string}>,createdAt:string,label:string}}
 */
export function createSssShareBundle(options = {}) {
  const {
    secretHex,
    threshold = 2,
    sharesCount = 3,
    label = "",
  } = options;

  const normalizedSecretHex = normalizeSecretHex(secretHex);
  const normalizedThreshold = normalizeThreshold(threshold);
  const normalizedSharesCount = normalizeSharesCount(sharesCount);

  if (normalizedThreshold > normalizedSharesCount) {
    throw new Error("threshold 不能大于 sharesCount");
  }

  const secretBuffer = Buffer.from(normalizedSecretHex, "hex");
  const shareBuffers = sss.split(secretBuffer, {
    shares: normalizedSharesCount,
    threshold: normalizedThreshold,
  });

  const groupId = crypto.randomBytes(8).toString("hex");
  return {
    version: SHARE_SCHEMA_VERSION,
    groupId,
    threshold: normalizedThreshold,
    sharesCount: normalizedSharesCount,
    fingerprint: sha256Hex(secretBuffer),
    createdAt: new Date().toISOString(),
    label: String(label ?? "").trim(),
    shares: shareBuffers.map((buf, idx) => ({
      index: idx + 1,
      shareHex: Buffer.from(buf).toString("hex"),
    })),
  };
}

/**
 * 从 SSS 分片包恢复 secret。
 *
 * @param {Object} options
 * @param {Object} options.bundle - createSssShareBundle 的结果
 * @param {string[]} options.shareHexList - 参与恢复的分片列表
 * @returns {{secretHex:string,fingerprint:string,groupId:string}}
 */
export function recoverSecretFromSssShares(options = {}) {
  const { bundle, shareHexList } = options;

  if (!bundle || bundle.version !== SHARE_SCHEMA_VERSION) {
    throw new Error("非法的 SSS bundle");
  }

  if (!Array.isArray(shareHexList) || shareHexList.length === 0) {
    throw new Error("shareHexList 不能为空");
  }

  if (shareHexList.length < Number(bundle.threshold)) {
    throw new Error(`至少需要 ${bundle.threshold} 份分片`);
  }

  const shareBuffers = shareHexList.map((hex) => Buffer.from(normalizeSecretHex(hex), "hex"));
  const secret = sss.combine(shareBuffers);
  const secretHex = Buffer.from(secret).toString("hex");
  const fingerprint = sha256Hex(Buffer.from(secret));

  if (fingerprint !== bundle.fingerprint) {
    throw new Error("分片恢复校验失败：fingerprint 不匹配");
  }

  return {
    secretHex,
    fingerprint,
    groupId: bundle.groupId,
  };
}

export { SHARE_SCHEMA_VERSION };
