import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { buildKeyDocEditorTemplate } from "../modules/key/preprocess.mjs";

function isHexPrivateKey(s) {
  return /^(0x)?[a-fA-F0-9]{64}$/.test(String(s ?? "").trim());
}

function isWifPrivateKey(s) {
  return /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(String(s ?? "").trim());
}

function isMnemonic(s) {
  const normalized = String(s ?? "")
    .trim()
    .replace(/\s+/gu, " ");
  if (!normalized) return false;
  const words = normalized.split(" ").filter((w) => /^[a-zA-Z]+$/.test(w));
  return [12, 15, 18, 21, 24].includes(words.length);
}

function detectSecretType(secret) {
  const normalized = String(secret ?? "").trim();
  if (isHexPrivateKey(normalized) || isWifPrivateKey(normalized)) return "privateKey";
  if (isMnemonic(normalized)) return "mnemonic";
  return "unknown";
}

function normalizeSingleLine(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${fieldName} 不能为空`);
  }
  if (/[\r\n]/.test(text)) {
    throw new Error(`${fieldName} 不能包含换行`);
  }
  return text;
}

function buildScanImportContent({ walletName, secret, passphrase = "" }) {
  const name = normalizeSingleLine(walletName, "walletName");
  const normalizedSecret = String(secret ?? "").trim().replace(/\s+/gu, " ");
  const secretType = detectSecretType(normalizedSecret);
  if (secretType === "unknown") {
    throw new Error("扫码结果不是可识别的私钥/助记词格式");
  }

  const suffix = String(passphrase ?? "").trim();
  if (!suffix) {
    return {
      sourceType: "scan",
      secretType,
      inputPath: "",
      inputContent: `${name}\n${normalizedSecret}\n`,
    };
  }

  return {
    sourceType: "scan",
    secretType,
    inputPath: "",
    inputContent: `${name}\n${normalizedSecret}\n${suffix}\n`,
  };
}

async function runScanCommand(commandText) {
  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(commandText, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk ?? "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk ?? "");
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`扫码命令执行失败（exit=${code ?? 1}）: ${stderr.trim() || "unknown"}`));
    });
  });
}

function normalizeScanOutput(rawOutput) {
  const text = String(rawOutput ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) {
    throw new Error("扫码结果为空");
  }

  const lines = text
    .split("\n")
    .map((line) => String(line ?? "").trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error("扫码结果为空");
  }

  for (const line of lines) {
    const matched = line.match(/^[A-Za-z0-9_\-.]+:(.+)$/);
    if (matched && matched[1]) {
      return matched[1].trim();
    }
  }

  return lines[0];
}

function commandExists(command, args = ["--version"]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
    });
    child.on("error", () => resolve(false));
    child.on("exit", () => resolve(true));
  });
}

function makeTempImagePath(ext = "png") {
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join(os.tmpdir(), `key-scan-${Date.now()}-${rand}.${ext}`);
}

function runChildProcess(command, args, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? 0);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let timer = null;
    if (timeout > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill("SIGTERM"); } catch { /* ignore */ }
        reject(new Error(`${command} 执行超时（${timeout}ms）`));
      }, timeout);
    }

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk ?? "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk ?? "");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function shellQuote(input) {
  const text = String(input ?? "");
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function runEditorProcess(editorCommand, targetFile) {
  return new Promise((resolve, reject) => {
    const command = `${editorCommand} ${shellQuote(targetFile)}`;
    const child = spawn(command, {
      shell: true,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", (error) => {
      reject(new Error(`启动编辑器失败: ${error?.message ?? String(error)}`));
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`编辑器异常退出（exit=${code ?? 1}）`));
    });
  });
}

async function resolveEditorSource(args) {
  const editorCommand = String(args.editor ?? process.env.VISUAL ?? process.env.EDITOR ?? "vim").trim();
  if (!editorCommand) {
    throw new Error("未检测到可用编辑器，请设置 --editor 或环境变量 EDITOR/VISUAL");
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "key-doc-edit-"));
  const tmpFile = path.join(tmpDir, "key-doc.md");

  try {
    await fs.writeFile(tmpFile, buildKeyDocEditorTemplate(), "utf8");
    await fs.chmod(tmpFile, 0o600).catch(() => {});

    await runEditorProcess(editorCommand, tmpFile);

    const content = await fs.readFile(tmpFile, "utf8");
    if (!String(content).trim()) {
      throw new Error("编辑内容为空，已取消导入");
    }

    return {
      sourceType: "content",
      inputPath: "",
      inputContent: String(content),
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function readByZbarimg(imagePath) {
  const result = await runChildProcess("zbarimg", ["--quiet", "--raw", imagePath], { timeoutMs: 20_000 });
  if (result.code !== 0) {
    throw new Error(`zbarimg 识别失败（exit=${result.code ?? 1}）: ${result.stderr.trim() || "unknown"}`);
  }
  return normalizeScanOutput(result.stdout);
}

async function runScanWithImagesnap(timeoutMs) {
  const imagePath = makeTempImagePath("jpg");
  try {
    const capture = await runChildProcess("imagesnap", ["-q", "-w", "2", imagePath], { timeoutMs });
    if (capture.code !== 0) {
      throw new Error(`imagesnap 抓图失败（exit=${capture.code ?? 1}）: ${capture.stderr.trim() || "unknown"}`);
    }
    return await readByZbarimg(imagePath);
  } finally {
    await fs.rm(imagePath, { force: true }).catch(() => {});
  }
}

async function runScanWithFfmpeg(timeoutMs) {
  const imagePath = makeTempImagePath("png");
  try {
    const capture = await runChildProcess(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-framerate", "30", "-i", "0", "-frames:v", "1", "-y", imagePath],
      { timeoutMs },
    );
    if (capture.code !== 0) {
      throw new Error(`ffmpeg 抓图失败（exit=${capture.code ?? 1}）: ${capture.stderr.trim() || "unknown"}`);
    }
    return await readByZbarimg(imagePath);
  } finally {
    await fs.rm(imagePath, { force: true }).catch(() => {});
  }
}

async function runScanWithZbarcam(timeoutMs) {
  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn("zbarcam", ["--raw", "--prescale=320x240"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      reject(new Error(`摄像头扫码超时（${timeoutMs}ms）`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk ?? "");
      const normalized = String(stdout).replace(/\r\n/g, "\n");
      const firstLine = normalized.split("\n").map((line) => line.trim()).find(Boolean);
      if (!firstLine || settled) return;

      settled = true;
      clearTimeout(timer);
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      try {
        resolve(normalizeScanOutput(firstLine));
      } catch (error) {
        reject(error);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk ?? "");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (String(stdout).trim()) {
        try {
          resolve(normalizeScanOutput(stdout));
        } catch (error) {
          reject(error);
        }
        return;
      }
      reject(new Error(`摄像头扫码失败（exit=${code ?? 1}）: ${stderr.trim() || "unknown"}`));
    });
  });
}

async function runScanCamera(options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? 60_000);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000;

  const hasZbarcam = await commandExists("zbarcam", ["--version"]);
  if (hasZbarcam) {
    return await runScanWithZbarcam(timeout);
  }

  const hasZbarimg = await commandExists("zbarimg", ["--version"]);
  const hasImagesnap = await commandExists("imagesnap", ["-h"]);
  const hasFfmpeg = await commandExists("ffmpeg", ["-version"]);

  if (hasZbarimg && hasImagesnap) {
    return await runScanWithImagesnap(timeout);
  }

  if (hasZbarimg && hasFfmpeg) {
    return await runScanWithFfmpeg(timeout);
  }

  const hints = [];
  if (hasZbarimg && !hasImagesnap && !hasFfmpeg) {
    hints.push("已检测到 zbarimg，但缺少摄像头抓图工具（imagesnap 或 ffmpeg）");
    hints.push("可执行：brew install imagesnap  或  brew install ffmpeg");
  } else if (!hasZbarimg) {
    hints.push("未检测到 zbarimg/zbarcam，请先安装 zbar：brew install zbar");
  }
  hints.push("也可改用 --scanCommand（例如先拍照，再用 zbarimg 识别）");
  throw new Error(`未找到可用的摄像头扫码后端。${hints.join("；")}`);
}

async function resolveScanSecret(args, ui) {
  if (args.scanValue) {
    return String(args.scanValue).trim();
  }

  if (Object.prototype.hasOwnProperty.call(args, "scanCamera")) {
    return await runScanCamera({ timeoutMs: args.scanTimeoutMs ?? args.scanTimeout });
  }

  if (args.scanFile) {
    const abs = String(args.scanFile);
    const text = await fs.readFile(abs, "utf8");
    return String(text).trim();
  }

  if (args.scanCommand) {
    return await runScanCommand(String(args.scanCommand));
  }

  const mode = await ui.askSelect(
    "请选择扫码来源",
    [
      { title: "使用本地摄像头扫码（自动探测后端）", value: "camera" },
      { title: "手动粘贴扫码结果", value: "manual" },
      { title: "从文件读取扫码结果", value: "file" },
      { title: "执行外部扫码命令", value: "command" },
    ],
    { initial: 1 },
  );

  if (mode === "camera") {
    return await runScanCamera({ timeoutMs: args.scanTimeoutMs ?? args.scanTimeout });
  }

  if (mode === "file") {
    const filePath = await ui.askText("请输入扫码结果文件路径", { required: true });
    const text = await fs.readFile(String(filePath), "utf8");
    return String(text).trim();
  }

  if (mode === "command") {
    const commandText = await ui.askText("请输入扫码命令（例如 zbarimg <img>）", { required: true });
    return await runScanCommand(commandText);
  }

  return await ui.askText("请粘贴扫码得到的私钥或助记词", { required: true });
}

async function resolveScanSource(args, ui) {
  const secret = await resolveScanSecret(args, ui);
  const walletName = args.walletName
    ? String(args.walletName)
    : await ui.askText("请输入钱包名称（必填）", { required: true });

  let passphrase = "";
  const guessedType = detectSecretType(secret);
  if (guessedType === "mnemonic") {
    if (Object.prototype.hasOwnProperty.call(args, "mnemonicPassphrase")) {
      passphrase = String(args.mnemonicPassphrase ?? "");
    } else {
      const usePassphrase = await ui.askConfirm("该助记词是否有 passphrase？", { initial: false });
      if (usePassphrase) {
        passphrase = await ui.askText("请输入助记词 passphrase", { required: true });
      }
    }
  }

  return buildScanImportContent({
    walletName,
    secret,
    passphrase,
  });
}

export async function resolveImportSource(args, ui) {
  const source = String(args.source ?? "").trim().toLowerCase();
  const readSecureInput = async (title, initial = "") => {
    if (typeof ui.readTuiDocumentInput === "function") {
      return await ui.readTuiDocumentInput({
        title,
        initial,
        maskSecretLines: true,
      });
    }
    return await ui.readMultilineInput({ title: `${title}（降级为多行输入）` });
  };

  if (source === "page" || Boolean(args.pageImport)) {
    throw new Error("页面录入已拆分为独立命令，请使用 pnpm key page-import");
  }

  if (source === "scan" || args.scanValue || args.scanFile || args.scanCommand || Object.prototype.hasOwnProperty.call(args, "scanCamera")) {
    return await resolveScanSource(args, ui);
  }

  if (source === "tui" || Boolean(args.tui)) {
    const content = await readSecureInput(
      "安全文档输入（仅内存编辑，不落盘）",
      buildKeyDocEditorTemplate(),
    );
    if (!String(content).trim()) {
      throw new Error("未输入任何文档内容");
    }
    return {
      sourceType: "content",
      inputPath: "",
      inputContent: content,
    };
  }

  if (source === "edit" || Boolean(args.edit)) {
    return await resolveEditorSource(args);
  }

  const rawInput = args.input
    ? String(args.input)
    : (Array.isArray(args._) && args._[0] ? String(args._[0]) : "");

  let inputPath = rawInput;
  let inputContent = args.content ? String(args.content) : "";

  if (!inputPath && !inputContent) {
    const mode = await ui.askSelect(
      "请选择导入方式",
      [
        { title: "从文件路径导入", value: "file" },
        { title: "安全 TUI 输入（推荐，不落盘）", value: "tui" },
        { title: "直接输入文档内容（旧模式）", value: "content" },
        { title: "打开本地编辑器编写（含语法模板注释）", value: "edit" },
        { title: "扫码导入（私钥/助记词）", value: "scan" },
      ],
      { initial: 1 },
    );

    if (mode === "file") {
      inputPath = await ui.askText("请输入导入文件路径", { required: true });
    } else if (mode === "tui") {
      const content = await readSecureInput(
        "安全文档输入（仅内存编辑，不落盘）",
        buildKeyDocEditorTemplate(),
      );
      if (!String(content).trim()) {
        throw new Error("未输入任何文档内容");
      }
      return {
        sourceType: "content",
        inputPath: "",
        inputContent: content,
      };
    } else if (mode === "edit") {
      return await resolveEditorSource(args);
    } else if (mode === "scan") {
      return await resolveScanSource(args, ui);
    } else {
      inputContent = await readSecureInput("文档输入", buildKeyDocEditorTemplate());
      if (!inputContent) {
        throw new Error("未输入任何文档内容");
      }
    }
  }

  return {
    sourceType: inputPath ? "file" : "content",
    inputPath,
    inputContent,
  };
}
