import http from "node:http";
import os from "node:os";
import path from "node:path";

import QRCode from "qrcode";

import { buildPageImportContent, createPageImportSession } from "../modules/page-import/session.mjs";

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const found = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry || entry.internal || entry.family !== "IPv4") {
        continue;
      }
      found.push(entry.address);
    }
  }

  return [...new Set(found)];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPageHtml({ title, submitPath, token, publicKeyDerBase64, expiresAt }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5efe6;
      --panel: rgba(255, 252, 247, 0.92);
      --ink: #1f2937;
      --muted: #6b7280;
      --accent: #0f766e;
      --line: rgba(15, 118, 110, 0.16);
      --warn: #b45309;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.14), transparent 30%),
        radial-gradient(circle at bottom right, rgba(180,83,9,0.12), transparent 28%),
        linear-gradient(160deg, #f8f4ee, var(--bg));
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding: 20px;
    }
    .card {
      width: min(100%, 720px);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: 0 20px 50px rgba(31, 41, 55, 0.08);
      padding: 24px 20px 28px;
      backdrop-filter: blur(10px);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 32px;
      line-height: 1.1;
    }
    p {
      margin: 0 0 16px;
      color: var(--muted);
      line-height: 1.55;
    }
    .meta {
      font-size: 14px;
      color: var(--warn);
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      margin: 16px 0 8px;
    }
    input, textarea, button {
      width: 100%;
      font: inherit;
    }
    input, textarea {
      border: 1px solid rgba(31, 41, 55, 0.12);
      border-radius: 16px;
      padding: 14px 16px;
      background: rgba(255,255,255,0.86);
      color: var(--ink);
    }
    textarea {
      min-height: 180px;
      resize: vertical;
    }
    button {
      margin-top: 20px;
      border: 0;
      border-radius: 999px;
      padding: 14px 18px;
      color: white;
      background: linear-gradient(135deg, #0f766e, #155e75);
      font-weight: 700;
    }
    .status {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 14px;
      font-size: 14px;
      display: none;
    }
    .status.show { display: block; }
    .status.error { background: rgba(220, 38, 38, 0.08); color: #991b1b; }
    .status.success { background: rgba(15, 118, 110, 0.10); color: #115e59; }
    .tips {
      margin-top: 20px;
      font-size: 13px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>手机导入密钥</h1>
    <p>本页面只在当前局域网导入会话中有效。提交前会在浏览器里做一次公钥加密，服务端收到的不是明文表单。</p>
    <div class="meta">会话 token: ${escapeHtml(token)}<br>过期时间: ${escapeHtml(new Date(expiresAt).toLocaleString("zh-CN", { hour12: false }))}</div>
    <form id="import-form">
      <label for="walletName">钱包名称</label>
      <input id="walletName" name="walletName" maxlength="120" autocomplete="off" required>

      <label for="secret">私钥或助记词</label>
      <textarea id="secret" name="secret" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" required></textarea>

      <label for="passphrase">助记词 passphrase（可选）</label>
      <input id="passphrase" name="passphrase" autocomplete="off">

      <button id="submit-btn" type="submit">加密并提交</button>
    </form>
    <div id="status" class="status"></div>
    <div class="tips">提交后电脑端会继续执行现有的导入和存储流程。</div>
  </main>
  <script>
    const submitPath = ${JSON.stringify(submitPath)};
    const publicKeyDerBase64 = ${JSON.stringify(publicKeyDerBase64)};

    function base64ToBytes(base64) {
      const bin = atob(base64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
      return out;
    }

    function bytesToBase64(bytes) {
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    }

    async function importRsaKey() {
      return await crypto.subtle.importKey(
        "spki",
        base64ToBytes(publicKeyDerBase64),
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"],
      );
    }

    async function encryptPayload(payload) {
      const encoder = new TextEncoder();
      const plaintext = encoder.encode(JSON.stringify(payload));
      const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext));
      const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", aesKey));
      const rsaKey = await importRsaKey();
      const encryptedKey = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, rawKey));
      return {
        encryptedKey: bytesToBase64(encryptedKey),
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(ciphertext),
      };
    }

    function setStatus(message, kind) {
      const el = document.getElementById("status");
      el.className = "status show " + kind;
      el.textContent = message;
    }

    document.getElementById("import-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const btn = document.getElementById("submit-btn");
      btn.disabled = true;
      const walletName = document.getElementById("walletName").value.trim();
      const secret = document.getElementById("secret").value.trim();
      const passphrase = document.getElementById("passphrase").value.trim();

      try {
        if (!walletName || !secret) {
          throw new Error("钱包名称和私钥/助记词不能为空");
        }
        const encrypted = await encryptPayload({ walletName, secret, passphrase });
        const response = await fetch(submitPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(encrypted),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(result.message || "提交失败");
        }
        document.getElementById("secret").value = "";
        document.getElementById("passphrase").value = "";
        setStatus("提交成功，电脑端正在继续导入。", "success");
      } catch (error) {
        setStatus(error?.message || String(error), "error");
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

async function readJsonBody(req, maxBytes = 64 * 1024) {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
  });
}

function writeJson(res, statusCode, data) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

async function listen(server, host, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(() => resolve()));
}

async function writeQrPngFile(token, url) {
  const filePath = path.join(os.tmpdir(), `key-page-import-${token}.png`);
  await QRCode.toFile(filePath, url, {
    type: "png",
    width: 960,
    margin: 4,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#FFFFFFFF",
    },
  });
  return filePath;
}

async function renderTerminalQr(url) {
  return await QRCode.toString(url, {
    type: "terminal",
    small: false,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}

export async function resolvePageImportSource(options = {}) {
  const title = String(options.title ?? "手机页面导入");
  const host = String(options.host ?? "0.0.0.0");
  const port = Number(options.port ?? 0);
  const timeoutMs = Number(options.timeoutMs ?? 300_000);
  const log = typeof options.log === "function" ? options.log : console.log;

  const session = createPageImportSession({ timeoutMs });
  const submitPath = `/api/page-import/${session.token}/submit`;
  const pagePath = `/page-import/${session.token}`;

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        writeJson(res, 404, { ok: false, message: "未找到请求路径" });
        return;
      }

      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === pagePath) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(renderPageHtml({
          title,
          submitPath,
          token: session.token,
          publicKeyDerBase64: session.publicKeyDerBase64,
          expiresAt: session.expiresAt,
        }));
        return;
      }

      if (req.method === "POST" && url.pathname === submitPath) {
        const payload = await readJsonBody(req);
        const decrypted = session.acceptEncryptedPayload(payload);
        writeJson(res, 200, { ok: true, walletName: decrypted.walletName });
        return;
      }

      writeJson(res, 404, { ok: false, message: "未找到请求路径" });
    } catch (error) {
      writeJson(res, 400, { ok: false, message: error?.message ?? String(error) });
    }
  });

  try {
    await listen(server, host, port);
    const addressInfo = server.address();
    const actualPort = typeof addressInfo === "object" && addressInfo ? addressInfo.port : port;
    const lanAddresses = getLanAddresses();
    const lanUrls = lanAddresses.map((ip) => `http://${ip}:${actualPort}${pagePath}`);
    const isWildcardHost = host === "0.0.0.0" || host === "::";
    const boundHostUrl = `http://${host === "::" ? "127.0.0.1" : host}:${actualPort}${pagePath}`;
    const primaryUrl = isWildcardHost ? (lanUrls[0] ?? boundHostUrl) : boundHostUrl;
    const qr = await renderTerminalQr(primaryUrl);
    const qrPngFile = await writeQrPngFile(session.token, primaryUrl);

    log("请选择手机扫码打开页面，提交后会继续执行导入流程：");
    log(primaryUrl);
    if (lanUrls.length > 1) {
      log(`可用局域网地址: ${lanUrls.join("  ")}`);
    }
    log(`二维码 PNG: ${qrPngFile}`);
    log("如果终端里的二维码扫不出来，直接打开这张 PNG 再扫。");
    log(qr);

    const submitted = await session.waitForSubmission();
    return {
      sourceType: "page",
      inputPath: "",
      inputContent: buildPageImportContent(submitted),
    };
  } finally {
    session.close("页面导入会话已关闭");
    await closeServer(server);
  }
}