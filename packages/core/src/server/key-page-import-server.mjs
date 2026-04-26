import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import QRCode from "qrcode";

import { keyPageImport } from "../tasks/key/page-import.mjs";

function resolvePackageDir(packageName) {
  const _require = createRequire(import.meta.url);
  // Resolve the package's main entry (always exported), then walk up to the package root
  const mainEntry = _require.resolve(packageName);
  let dir = path.dirname(mainEntry);
  while (dir !== path.dirname(dir)) {
    try {
      const pkgJson = _require(path.join(dir, "package.json"));
      if (pkgJson && pkgJson.name === packageName) return dir;
    } catch { /* not the root yet */ }
    dir = path.dirname(dir);
  }
  throw new Error(`Cannot locate package root for ${packageName}`);
}

const HASHES_ROOT = resolvePackageDir("@noble/hashes");
const CIPHERS_ROOT = resolvePackageDir("@noble/ciphers");
const KEY_PARSE_MODULE_PATH = fileURLToPath(new URL("../modules/key/parse.mjs", import.meta.url));
const VENDOR_ROOTS = Object.freeze({
  "@noble/hashes": HASHES_ROOT,
  "@noble/ciphers": CIPHERS_ROOT,
});

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

function createSession(timeoutMs = 300_000) {
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300_000;
  const token = randomBytes(12).toString("base64url");
  const expiresAt = Date.now() + timeout;
  let settled = false;
  let resolvePromise = null;
  let rejectPromise = null;
  const completion = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    rejectPromise(new Error("页面录入会话已超时"));
  }, timeout);

  return {
    token,
    expiresAt,
    wait: async () => await completion,
    succeed(result) {
      if (settled) {
        throw new Error("页面录入会话已结束");
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    },
    close(reason = "页面录入会话已关闭") {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new Error(reason));
    },
  };
}

function renderPageHtml({ title, submitPath, expiresAt }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4eee6;
      --panel: rgba(255, 251, 245, 0.94);
      --ink: #1f2937;
      --muted: #6b7280;
      --accent: #0f766e;
      --accent-2: #155e75;
      --line: rgba(15, 118, 110, 0.14);
      --error-bg: rgba(220, 38, 38, 0.08);
      --error-ink: #991b1b;
      --ok-bg: rgba(15, 118, 110, 0.10);
      --ok-ink: #115e59;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.14), transparent 32%),
        radial-gradient(circle at bottom right, rgba(180,83,9,0.10), transparent 30%),
        linear-gradient(160deg, #faf6f1, var(--bg));
      padding: 18px;
    }
    .card {
      width: min(100%, 760px);
      margin: 0 auto;
      border-radius: 24px;
      padding: 24px 20px 28px;
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: 0 24px 60px rgba(31, 41, 55, 0.08);
      backdrop-filter: blur(10px);
    }
    h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.1; }
    p { margin: 0 0 14px; color: var(--muted); line-height: 1.55; }
    .meta { font-size: 13px; color: #92400e; margin-bottom: 18px; }
    label { display: block; font-size: 14px; font-weight: 700; margin: 14px 0 8px; }
    input, textarea, button { width: 100%; font: inherit; }
    input, textarea {
      border: 1px solid rgba(31, 41, 55, 0.12);
      border-radius: 16px;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.86);
      color: var(--ink);
    }
    textarea { min-height: 180px; resize: vertical; }
    .password-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    button {
      margin-top: 20px;
      border: 0;
      border-radius: 999px;
      padding: 14px 18px;
      color: white;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      font-weight: 700;
    }
    button[disabled] { opacity: 0.7; }
    .status {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 14px;
      display: none;
      font-size: 14px;
    }
    .status.show { display: block; }
    .status.error { background: var(--error-bg); color: var(--error-ink); }
    .status.success { background: var(--ok-bg); color: var(--ok-ink); }
    .tips { margin-top: 18px; font-size: 13px; color: var(--muted); }
    .label-row { display: flex; align-items: baseline; justify-content: space-between; margin: 14px 0 8px; }
    .label-row label { margin: 0; }
    .file-upload-btn { cursor: pointer; font-size: 12px; font-weight: 400; color: var(--accent); padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,0.7); white-space: nowrap; }
    .file-hint { display: block; font-size: 12px; color: var(--muted); margin-top: 5px; min-height: 1em; }
    .parse-preview { margin-top: 8px; padding: 10px 14px; border-radius: 12px; font-size: 13px; background: rgba(15,118,110,0.06); color: var(--ink); display: none; }
    .parse-preview.show { display: block; }
    .parse-preview .entry { padding: 3px 0; border-bottom: 1px solid var(--line); }
    .parse-preview .entry:last-child { border-bottom: none; }
    .parse-error { color: var(--error-ink); font-size: 13px; margin-top: 6px; display: none; }
    .parse-error.show { display: block; }
    @media (min-width: 700px) {
      .password-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>手机页面录入密钥</h1>
    <p>本页会直接在浏览器里用你输入的密码生成现有 .enc.json 格式，服务端只负责写入文件，不接收明文密码。</p>
    <div class="meta">会话过期时间: ${escapeHtml(new Date(expiresAt).toLocaleString("zh-CN", { hour12: false }))}</div>
    <form id="page-import-form">
      <label for="walletName">钱包名称</label>
      <input id="walletName" maxlength="120" autocomplete="off" required>

      <div class="label-row">
        <label for="secret">私钥文档（支持一个钱包多个私钥）</label>
        <label class="file-upload-btn" for="secret-file">从文件读取</label>
        <input id="secret-file" type="file" accept=".md,.txt,.key" style="display:none">
      </div>
      <textarea id="secret" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" required
        placeholder="keyName&#10;私钥或12-24位助记词&#10;（可选）@passphrase your-passphrase&#10;&#10;keyName2&#10;另一个私钥或助记词"></textarea>
      <span id="file-hint" class="file-hint"></span>
      <div id="parse-preview"></div>

      <div class="password-grid">
        <div>
          <label for="password">加密密码</label>
          <input id="password" type="password" autocomplete="new-password" required>
        </div>
        <div>
          <label for="password2">确认密码</label>
          <input id="password2" type="password" autocomplete="new-password" required>
        </div>
      </div>

      <button id="submit-btn" type="submit">本地加密并保存</button>
    </form>
    <div id="status" class="status"></div>
    <div class="tips">私钥文档格式：每条占连续几行，第一行为 keyName，第二行为私钥或助记词，第三行（可选）为 @passphrase &lt;BIP39-passphrase&gt;，条目之间用空行分隔。一个钱包可包含多条记录，最终加密为一个文件。</div>
  </main>
  <script type="module">
    import { scryptAsync } from "/vendor/@noble/hashes/scrypt.js";
    import { sha256 } from "/vendor/@noble/hashes/sha2.js";
    import { gcm } from "/vendor/@noble/ciphers/aes.js";
    import { parseKeyFile } from "/shared/key-parse.mjs";

    const submitPath = ${JSON.stringify(submitPath)};
    const PACK_SCHEMA_VERSION = "key-pack-v1";
    const ENCRYPTED_SCHEMA_VERSION = "key-enc-v1";
    const SCRYPT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, keyLength: 32 });

    const encoder = new TextEncoder();

    function toBase64(bytes) {
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    }

    function toHex(bytes) {
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }

    function randomBytes(size) {
      const out = new Uint8Array(size);
      crypto.getRandomValues(out);
      return out;
    }

    function setStatus(message, kind) {
      const el = document.getElementById("status");
      el.className = "status show " + kind;
      el.textContent = message;
    }

    function updateParsePreview(text) {
      const preview = document.getElementById("parse-preview");
      if (!text.trim()) {
        preview.className = "parse-preview";
        preview.innerHTML = "";
        return;
      }
      const { entries, errors, addressConfigs } = parseKeyFile(text);
      if (entries.length === 0) {
        preview.className = "parse-preview show";
        preview.innerHTML = "<span style=\\"color:var(--error-ink)\\">" + errors.join("；") + "</span>";
        return;
      }

      const rules = Array.isArray(addressConfigs) ? addressConfigs : [];
      const keyRuleCount = new Map();
      for (const rule of rules) {
        const keyName = String(rule.keyName ?? "").trim();
        if (!keyName) continue;
        keyRuleCount.set(keyName, (keyRuleCount.get(keyName) ?? 0) + 1);
      }
      const invalidRuleWarnings = errors.filter((item) => String(item ?? "").includes("地址规则无效"));

      let html = "识别到 " + entries.length + " 条记录：";
      for (const e of entries) {
        const type = e.type === "mnemonic" ? "助记词" : "私钥";
        const pp = e.passphrase ? "（含 passphrase）" : "";
        const rc = keyRuleCount.get(e.name) ?? 0;
        html += "<div class=\\"entry\\">· " + e.name + " — " + type + pp + "，地址规则 " + rc + " 条</div>";
      }
      const configCount = Array.isArray(addressConfigs) ? addressConfigs.length : 0;
      html += "<div style=\\"margin-top:6px;color:var(--accent-2)\\">地址规则总数: " + configCount + " 条，规则告警: " + invalidRuleWarnings.length + " 条</div>";
      if (errors.length) {
        html += "<div style=\\"color:var(--muted);font-size:12px;margin-top:4px\\">" + errors.join("；") + "</div>";
      }
      preview.className = "parse-preview show";
      preview.innerHTML = html;
    }

    async function buildEnvelope(walletName, docText, password) {
      const sourceText = String(docText ?? "").replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n");
      if (!sourceText.trim()) throw new Error("私钥文档不能为空");
      const normalized = sourceText.endsWith("\\n") ? sourceText : sourceText + "\\n";
      const fileBytes = encoder.encode(normalized);
      const fileName = walletName + ".md";
      const createdAt = new Date().toISOString();
      const packPayload = {
        version: PACK_SCHEMA_VERSION,
        createdAt,
        sourcePath: "/page-import/" + fileName,
        sourceType: "file",
        sourceName: fileName,
        files: [
          {
            relativePath: fileName,
            size: fileBytes.byteLength,
            sha256: toHex(sha256(fileBytes)),
            contentBase64: toBase64(fileBytes),
          },
        ],
      };
      const plaintext = encoder.encode(JSON.stringify(packPayload));
      const salt = randomBytes(16);
      const iv = randomBytes(12);
      const key = await scryptAsync(encoder.encode(password), salt, {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        dkLen: SCRYPT_PARAMS.keyLength,
      });
      const ciphertextWithTag = gcm(key, iv).encrypt(plaintext);
      const ciphertext = ciphertextWithTag.slice(0, -16);
      const tag = ciphertextWithTag.slice(-16);
      return {
        version: ENCRYPTED_SCHEMA_VERSION,
        createdAt,
        payloadFormat: PACK_SCHEMA_VERSION,
        sourceType: "file",
        sourceName: fileName,
        fileCount: 1,
        plaintextSha256: toHex(sha256(plaintext)),
        plaintextSize: plaintext.byteLength,
        kdf: {
          name: "scrypt",
          saltBase64: toBase64(salt),
          N: SCRYPT_PARAMS.N,
          r: SCRYPT_PARAMS.r,
          p: SCRYPT_PARAMS.p,
          keyLength: SCRYPT_PARAMS.keyLength,
        },
        encryption: {
          algorithm: "aes-256-gcm",
          ivBase64: toBase64(iv),
          tagBase64: toBase64(tag),
        },
        ciphertextBase64: toBase64(ciphertext),
      };
    }

    document.getElementById("page-import-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const btn = document.getElementById("submit-btn");
      btn.disabled = true;
      try {
        const walletName = document.getElementById("walletName").value.trim();
        if (!walletName) throw new Error("钱包名称不能为空");
        const rawText = document.getElementById("secret").value;
        const password = document.getElementById("password").value;
        const password2 = document.getElementById("password2").value;
        if (password !== password2) throw new Error("两次输入的密码不一致");
        if (password.length < 8) throw new Error("加密密码至少 8 位");
        const { entries, errors } = parseKeyFile(rawText);
        if (errors.length > 0) throw new Error(errors[0] || "密钥文档格式错误");
        if (entries.length === 0) throw new Error("未找到有效密钥");
        setStatus("正在本地加密，包含 " + entries.length + " 条记录，请稍候...", "success");
        const envelope = await buildEnvelope(walletName, rawText, password);
        const response = await fetch(submitPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: walletName, envelope }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || "保存失败");
        document.getElementById("walletName").value = "";
        document.getElementById("secret").value = "";
        document.getElementById("password").value = "";
        document.getElementById("password2").value = "";
        document.getElementById("parse-preview").className = "parse-preview";
        setStatus("保存成功: " + result.keyFile, "success");
      } catch (error) {
        setStatus(error?.message || String(error), "error");
        btn.disabled = false;
      }
    });

    document.getElementById("secret").addEventListener("input", (event) => {
      updateParsePreview(event.target.value);
    });

    document.getElementById("secret-file").addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target.result ?? "").replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n").trim();
        document.getElementById("secret").value = text;
        document.getElementById("file-hint").textContent = file.name;
        updateParsePreview(text);
      };
      reader.readAsText(file, "utf-8");
    });
  </script>
</body>
</html>`;
}

async function readJsonBody(req, maxBytes = 256 * 1024) {
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
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
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
  const filePath = path.join(os.tmpdir(), `key-page-store-${token}.png`);
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

function resolveVendorFilePath(requestPath) {
  const cleanPath = String(requestPath ?? "").replace(/^\/vendor\//, "");
  if (!cleanPath.endsWith(".js")) {
    throw new Error("仅允许访问 .js 资源");
  }

  for (const [prefix, root] of Object.entries(VENDOR_ROOTS)) {
    if (!cleanPath.startsWith(`${prefix}/`)) {
      continue;
    }
    const rel = cleanPath.slice(prefix.length + 1);
    const resolved = path.resolve(root, rel);
    const allowedRoot = `${root}${path.sep}`;
    if (resolved !== root && !resolved.startsWith(allowedRoot)) {
      break;
    }
    return resolved;
  }

  throw new Error("不允许的 vendor 资源");
}

async function serveVendorFile(res, requestPath) {
  const filePath = resolveVendorFilePath(requestPath);
  const content = await fs.readFile(filePath, "utf8");
  res.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(content);
}

async function serveSharedFile(res, requestPath) {
  if (requestPath === "/shared/key-parse.mjs") {
    const content = await fs.readFile(KEY_PARSE_MODULE_PATH, "utf8");
    res.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(content);
    return;
  }

  throw new Error("不允许的 shared 资源");
}

export async function runKeyPageImportServer(options = {}) {
  const title = String(options.title ?? "手机页面录入密钥");
  const host = String(options.host ?? "0.0.0.0");
  const port = Number(options.port ?? 0);
  const timeoutMs = Number(options.timeoutMs ?? 300_000);
  const storageRoot = String(options.storageRoot ?? "storage");
  const log = typeof options.log === "function" ? options.log : console.log;

  const session = createSession(timeoutMs);
  const pagePath = `/k/${session.token}`;
  const submitPath = `/a/${session.token}`;

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        writeJson(res, 404, { ok: false, message: "未找到请求路径" });
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === pagePath) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(renderPageHtml({ title, submitPath, expiresAt: session.expiresAt }));
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/vendor/")) {
        await serveVendorFile(res, url.pathname);
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/shared/")) {
        await serveSharedFile(res, url.pathname);
        return;
      }
      if (req.method === "POST" && url.pathname === submitPath) {
        const payload = await readJsonBody(req);
        const stored = await keyPageImport({
          name: payload?.name,
          envelope: payload?.envelope,
          storageRoot,
        });
        const response = {
          ok: true,
          name: stored.name,
          keyFile: path.relative(process.cwd(), stored.keyFile),
          fileCount: stored.fileCount,
        };
        session.succeed(response);
        writeJson(res, 200, response);
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

    log("请用手机扫码打开独立页面录入流程：");
    log(primaryUrl);
    if (lanUrls.length > 1) {
      log(`可用局域网地址: ${lanUrls.join("  ")}`);
    }
    log(`二维码 PNG: ${qrPngFile}`);
    log("如果终端二维码不好扫，直接打开这张 PNG 再扫。");
    log(qr);

    return await session.wait();
  } finally {
    session.close("页面录入会话已关闭");
    await closeServer(server);
  }
}
