import { createDecipheriv, generateKeyPairSync, privateDecrypt, randomBytes } from "node:crypto";

function decodeBase64(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${fieldName} 不能为空`);
  }
  try {
    return Buffer.from(text, "base64");
  } catch {
    throw new Error(`${fieldName} 不是合法的 base64`);
  }
}

function decryptAesGcm(ciphertext, key, iv) {
  if (ciphertext.length < 17) {
    throw new Error("ciphertext 长度非法");
  }

  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function normalizeSingleLine(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${fieldName} 不能为空`);
  }
  if (/\r|\n/.test(text)) {
    throw new Error(`${fieldName} 不能包含换行`);
  }
  return text;
}

function normalizeSecret(value) {
  const text = String(value ?? "").trim().replace(/\s+/gu, " ");
  if (!text) {
    throw new Error("secret 不能为空");
  }
  return text;
}

function normalizePassphrase(value) {
  const text = String(value ?? "").trim();
  if (/\r|\n/.test(text)) {
    throw new Error("passphrase 不能包含换行");
  }
  return text;
}

function decryptPayload(payload, privateKeyPem) {
  const encryptedKey = decodeBase64(payload?.encryptedKey, "encryptedKey");
  const iv = decodeBase64(payload?.iv, "iv");
  const ciphertext = decodeBase64(payload?.ciphertext, "ciphertext");

  const aesKey = privateDecrypt(
    {
      key: privateKeyPem,
      oaepHash: "sha256",
    },
    encryptedKey,
  );

  const plain = decryptAesGcm(ciphertext, aesKey, iv).toString("utf8");
  let parsed = null;
  try {
    parsed = JSON.parse(plain);
  } catch {
    throw new Error("页面提交内容不是合法 JSON");
  }

  return {
    walletName: normalizeSingleLine(parsed?.walletName, "walletName"),
    secret: normalizeSecret(parsed?.secret),
    passphrase: normalizePassphrase(parsed?.passphrase),
  };
}

export function buildPageImportContent({ walletName, secret, passphrase = "" }) {
  const lines = [normalizeSingleLine(walletName, "walletName"), normalizeSecret(secret)];
  const normalizedPassphrase = normalizePassphrase(passphrase);
  if (normalizedPassphrase) {
    lines.push(`@passphrase ${normalizedPassphrase}`);
  }
  return `${lines.join("\n")}\n`;
}

export function createPageImportSession(options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? 300_000);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300_000;
  const token = randomBytes(12).toString("base64url");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const publicKeyDerBase64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const expiresAt = Date.now() + timeout;

  let settled = false;
  let resolvePromise = null;
  let rejectPromise = null;
  const submission = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    rejectPromise(new Error("页面导入会话已超时"));
  }, timeout);

  return {
    token,
    expiresAt,
    publicKeyPem: publicKey,
    publicKeyDerBase64,
    waitForSubmission: async () => await submission,
    acceptEncryptedPayload(payload) {
      if (settled) {
        throw new Error("页面导入会话已结束");
      }
      const data = decryptPayload(payload, privateKey);
      settled = true;
      clearTimeout(timer);
      resolvePromise(data);
      return data;
    },
    close(reason = "页面导入会话已关闭") {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new Error(reason));
    },
  };
}