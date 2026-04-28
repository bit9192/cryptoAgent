#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { verifyStoredFilePassword } from "../modules/key/store.mjs";
import { ensureStorageStructure } from "../modules/key/store.mjs";
import { keyCreate } from "../tasks/key/create.mjs";
import { keyAdd } from "../tasks/key/add.mjs";
import { keyBackup } from "../tasks/key/backup.mjs";
import { keyEditCommit, keyEditPrepare } from "../tasks/key/edit.mjs";
import { keyImport } from "../tasks/key/import.mjs";
import { keyImports } from "../tasks/key/imports.mjs";
import { keyDeriveConfig } from "../tasks/key/derive-config.mjs";
import { inspectBackupManifest, keyRestore } from "../tasks/key/restore.mjs";
import { keyView } from "../tasks/key/view.mjs";
import { runKeyPageImportServer } from "../server/key-page-import-server.mjs";
import {
  askConfirm,
  askPassword,
  askSelect,
  askText,
  parseCliCommand,
  readMultilineInput,
  readTuiDocumentInput,
} from "./ui.mjs";
import { resolveImportSource } from "./key-import-source.mjs";

function printUsage() {
  console.log("Usage:");
  console.log("  pnpm key create --name wallet-main --password <password> [--backup] [--threshold 2] [--shares 3]");
  console.log("  pnpm key import --input ./keys.md --name wallet-batch --password <password> [--backup] [--threshold 2] [--shares 3]");
  console.log("  pnpm key import --content \"wallet-a\\n<private-key>\" --password <password> [--backup]");
  console.log("  pnpm key import --source scan --walletName wallet-mobile --scanValue \"<private-key|mnemonic>\" --password <password>");
  console.log("  pnpm key import --source scan --scanCamera --walletName wallet-mobile --scanTimeoutMs 60000 --password <password>");
  console.log("  pnpm key import --source tui --password <password>   # 终端内存编辑，不落盘");
  console.log("  pnpm key import --source edit --editor vim --password <password>   # 打开编辑器，模板含注释与占位符");
  console.log("  pnpm key imports --dir ./to-import --password <password> [--storageRoot storage] [--recursive true] [--ext md,txt,key] [--onConflict rename|skip|overwrite] [--dryRun] [--failFast]");
  console.log("  pnpm key imports --dir ./to-import --ext \"\" --password <password>   # 无扩展名文件（如 btc-main、walletnew）用 --ext \"\" 匹配");
  console.log("  pnpm key page-import [--pagePort 8787] [--pageTimeoutMs 300000] [--storageRoot storage]");
  console.log("  pnpm key derive-config --input ./src/test/modules/key/testdata.md --password <password> [--out ./testdata.addresses.json] [--strict]");
  console.log("  pnpm key add --file storage/key/wallet-main.enc.json --input ./new-keys.md --password <password>");
  console.log("  pnpm key add --file storage/key/wallet-main.enc.json --content \"wallet-a\\n<private-key>\" --password <password>");
  console.log("  pnpm key add --file storage/key/wallet-main.enc.json --source scan --walletName wallet-mobile --scanValue \"<private-key|mnemonic>\" --password <password>");
  console.log("  pnpm key add --file storage/key/wallet-main.enc.json --source scan --scanCamera --walletName wallet-mobile --scanTimeoutMs 60000 --password <password>");
  console.log("  pnpm key add --file storage/key/wallet-main.enc.json --source tui --password <password>");
  console.log("  pnpm key add --file storage/key/wallet-main.enc.json --source edit --editor vim --password <password>");
  console.log("  pnpm key edit --file storage/key/wallet-main.enc.json --password <password>   # TUI 编辑非密钥内容（密钥保护）");
  console.log("  pnpm key view --file storage/key/wallet-main.enc.json --password <password>");
  console.log("  pnpm key backup --all [--dest ./my-backup-dir] [--threshold 2] [--shares 3] [--passphrase <password>]");
  console.log("  pnpm key backup --file storage/key/wallet-main.enc.json [--dest ./my-backup-dir] [--threshold 2] [--shares 3] [--passphrase <password>]");
  console.log("  pnpm key backup --all   # 交互选择 threshold/shares，并输入备份 password（可留空）");
  console.log("  pnpm key restore --backup storage/backup/key-sss-backup-20260101010101 [--out ./restore-dir] [--passphrase <password>]");
  console.log("  pnpm key import --password <password>   # 交互选择：文件路径 / 直接输入文档内容");
  console.log("提示：密钥行支持占位符 PRIVATE_KEY_PLACEHOLDER / MNEMONIC_PLACEHOLDER(12词) / MNEMONIC_24_PLACEHOLDER(24词)，导入时自动替换为随机密钥。\n");
}

async function runWithRenameRetry(executor, initialName) {
  let currentName = String(initialName ?? "").trim() || null;

  while (true) {
    try {
      return await executor(currentName);
    } catch (error) {
      if (error?.code !== "KEY_FILE_EXISTS") {
        throw error;
      }

      if (!process.stdin.isTTY) {
        throw error;
      }

      const nextName = await askText(`同名文件已存在（${error.filePath}），请输入新名称`, {
        required: true,
      });
      currentName = nextName;
    }
  }
}

async function walkEncryptedFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  for (const entry of entries) {
    const abs = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkEncryptedFiles(abs));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".enc.json")) {
      files.push(abs);
    }
  }
  return files;
}

async function resolveAddTargetFile(args) {
  const storageRoot = String(args.storageRoot ?? "storage");
  const keyDir = path.resolve(process.cwd(), storageRoot, "key");
  const fileFromArg = args.file ? String(args.file) : "";

  if (fileFromArg) {
    const abs = path.resolve(process.cwd(), fileFromArg);
    const st = await fs.stat(abs).catch(() => null);
    if (!st || !st.isFile()) {
      throw new Error(`--file 指定的目标文件不存在或不可用: ${fileFromArg}`);
    }
    return fileFromArg;
  }

  let choices = [];
  try {
    const files = await walkEncryptedFiles(keyDir);
    choices = files
      .map((abs) => path.relative(process.cwd(), abs) || abs)
      .sort()
      .map((relativePath) => ({
        title: relativePath,
        value: relativePath,
      }));
  } catch {
    choices = [];
  }

  choices.push({
    title: "手动输入文件路径",
    value: "__manual__",
  });

  if (!process.stdin.isTTY) {
    if (fileFromArg) {
      return fileFromArg;
    }
    if (choices.length > 1) {
      return choices[0].value;
    }
    throw new Error("未找到可用 key 文件，请先执行 key create 或 key import");
  }

  while (true) {
    const selected = await askSelect("请选择要修改的文件", choices, { initial: 0 });
    const filePath = selected === "__manual__"
      ? await askText("请输入目标加密文件路径（例如 storage/key/wallet-main.enc.json）", { required: true })
      : String(selected);

    const abs = path.resolve(process.cwd(), filePath);
    try {
      const st = await fs.stat(abs);
      if (!st.isFile()) {
        throw new Error("not-file");
      }
      return filePath;
    } catch {
      console.log(`文件不存在或不可用: ${filePath}`);
    }
  }
}

async function resolveBackupSource(args) {
  const storageRoot = String(args.storageRoot ?? "storage");
  const keyDir = path.join(storageRoot, "key");

  if (args.all) {
    return {
      sourceType: "directory",
      sourcePath: keyDir,
    };
  }

  if (args.file) {
    return {
      sourceType: "file",
      sourcePath: String(args.file),
    };
  }

  if (!process.stdin.isTTY) {
    return {
      sourceType: "directory",
      sourcePath: keyDir,
    };
  }

  const picked = await askSelect(
    "请选择备份范围",
    [
      { title: "备份整个 key 文件夹", value: "directory" },
      { title: "备份某个 key 文件", value: "file" },
    ],
    { initial: 0 },
  );

  if (picked === "directory") {
    return {
      sourceType: "directory",
      sourcePath: keyDir,
    };
  }

  const filePath = await resolveAddTargetFile({
    ...args,
    storageRoot,
  });

  return {
    sourceType: "file",
    sourcePath: filePath,
  };
}

async function resolveBackupDestination(args) {
  if (args.dest) {
    return String(args.dest);
  }

  if (!process.stdin.isTTY) {
    return null;
  }

  const mode = await askSelect(
    "请选择备份位置",
    [
      { title: "使用默认备份路径（storage/backup）", value: "default" },
      { title: "手动设置备份位置", value: "manual" },
    ],
    { initial: 0 },
  );

  if (mode === "default") {
    return null;
  }

  return await askText("请输入备份目标路径", { required: true });
}

function parseBackupInt(value, fieldName) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 2) {
    throw new Error(`${fieldName} 必须是 >= 2 的整数`);
  }
  return n;
}

function parseSplitPair(threshold, sharesCount) {
  const t = parseBackupInt(threshold, "threshold");
  const s = parseBackupInt(sharesCount, "shares");
  if (t > s) {
    throw new Error("threshold 不能大于 shares");
  }
  return { threshold: t, sharesCount: s };
}

async function resolveBackupSplitConfig(args) {
  const hasThreshold = Object.prototype.hasOwnProperty.call(args, "threshold");
  const hasShares = Object.prototype.hasOwnProperty.call(args, "shares")
    || Object.prototype.hasOwnProperty.call(args, "sharesCount");

  if (hasThreshold && hasShares) {
    return parseSplitPair(args.threshold, args.shares ?? args.sharesCount);
  }

  if (!process.stdin.isTTY) {
    return parseSplitPair(
      hasThreshold ? args.threshold : 2,
      hasShares ? (args.shares ?? args.sharesCount) : 3,
    );
  }

  if (hasThreshold || hasShares) {
    const threshold = hasThreshold
      ? args.threshold
      : await askText("请输入 threshold（最少分片数）", { initial: "2", required: true });
    const shares = hasShares
      ? (args.shares ?? args.sharesCount)
      : await askText("请输入 shares（总分片数）", { initial: "3", required: true });
    return parseSplitPair(threshold, shares);
  }

  const preset = await askSelect(
    "请选择分片策略（threshold / shares）",
    [
      { title: "2 / 3（推荐，平衡安全与可用性）", value: "2:3" },
      { title: "3 / 5（更高容错）", value: "3:5" },
      { title: "5 / 8（高安全，多人保管）", value: "5:8" },
      { title: "自定义", value: "custom" },
    ],
    { initial: 0 },
  );

  if (preset !== "custom") {
    const [threshold, shares] = String(preset).split(":");
    return parseSplitPair(threshold, shares);
  }

  const threshold = await askText("请输入 threshold（最少分片数）", { initial: "2", required: true });
  const shares = await askText("请输入 shares（总分片数）", { initial: "3", required: true });
  return parseSplitPair(threshold, shares);
}

async function resolveBackupPassphrase(args) {
  if (Object.prototype.hasOwnProperty.call(args, "passphrase")) {
    return String(args.passphrase ?? "");
  }

  if (!process.stdin.isTTY) {
    return "";
  }

  while (true) {
    const passphrase = await askText("请输入备份 password（可留空；留空表示不加密）", {
      required: false,
      initial: "",
    });

    if (!passphrase) {
      return "";
    }

    if (passphrase.length < 8) {
      console.log("备份 password 至少 8 位，或直接回车留空。\n");
      continue;
    }

    const confirmed = await askText("请再次输入备份 password 进行确认", {
      required: false,
      initial: "",
    });

    if (passphrase !== confirmed) {
      console.log("两次输入不一致，请重试。\n");
      continue;
    }

    return passphrase;
  }
}

async function resolveRestoreBackupPath(args) {
  if (args.backup) {
    return String(args.backup);
  }

  const storageRoot = String(args.storageRoot ?? "storage");
  const backupRoot = path.resolve(process.cwd(), storageRoot, "backup");

  let choices = [];
  try {
    const entries = await fs.readdir(backupRoot, { withFileTypes: true });
    choices = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("key-sss-backup-"))
      .map((entry) => path.join(storageRoot, "backup", entry.name))
      .sort()
      .reverse()
      .map((rel) => ({ title: rel, value: rel }));
  } catch {
    choices = [];
  }

  if (!process.stdin.isTTY) {
    if (choices.length > 0) {
      return choices[0].value;
    }
    throw new Error("未找到可恢复的 SSS 备份，请先执行 key backup");
  }

  choices.push({ title: "手动输入备份路径", value: "__manual__" });
  const selected = await askSelect("请选择要恢复的备份", choices, { initial: 0 });
  if (selected === "__manual__") {
    return await askText("请输入备份目录或 manifest.json 路径", { required: true });
  }
  return String(selected);
}

async function resolveAddPasswordAndVerify(keyFile, args) {
  if (args.password) {
    const provided = String(args.password);
    const verify = await verifyStoredFilePassword({ storedFile: keyFile, password: provided });
    if (!verify.ok) {
      throw new Error(`文件解锁失败：${verify.message}`);
    }
    return provided;
  }

  while (true) {
    const password = await askPassword({ message: "请输入目标文件密码", minLength: 8, confirm: false });
    const verify = await verifyStoredFilePassword({ storedFile: keyFile, password });
    if (verify.ok) {
      return password;
    }
    console.log(`密码错误，无法解锁 ${keyFile}，请重试。`);
  }
}

async function resolveRestorePassphraseIfNeeded(backupPath, args) {
  const info = await inspectBackupManifest(backupPath);
  if (!info.passphraseEnabled) {
    return "";
  }

  if (Object.prototype.hasOwnProperty.call(args, "passphrase")) {
    return String(args.passphrase ?? "");
  }

  if (!process.stdin.isTTY) {
    throw new Error("该备份启用了 passphrase，请使用 --passphrase 传入");
  }

  return await askPassword({
    message: "该备份已启用 passphrase，请输入恢复密码",
    minLength: 8,
    confirm: false,
  });
}

async function main() {
  const { com, args } = parseCliCommand(process.argv.slice(2));

  await ensureStorageStructure(args.storageRoot);

  if (com !== "create" && com !== "import" && com !== "imports" && com !== "add" && com !== "edit" && com !== "view" && com !== "backup" && com !== "restore" && com !== "page-import" && com !== "derive-config") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (com === "derive-config") {
    const inputPath = String(args.input ?? "").trim();
    if (!inputPath) {
      throw new Error("derive-config 需要 --input <key-doc-path>");
    }

    const password = args.password
      ? String(args.password)
      : await askPassword({ message: "请输入用于导出的临时加密密码", minLength: 8, confirm: false });

    const result = await keyDeriveConfig({
      inputPath,
      outputPath: args.out ? String(args.out) : undefined,
      password,
      strict: Boolean(args.strict),
    });

    console.log(JSON.stringify({ ok: true, action: "key.derive-config", result }, null, 2));
    return;
  }

  if (com === "imports") {
    let inputDir = String(args.dir ?? args.inputDir ?? "").trim();
    if (!inputDir) {
      if (!process.stdin.isTTY) {
        throw new Error("imports 需要 --dir <directory>");
      }
      inputDir = await askText("请输入批量导入目录路径", { required: true });
    }

    const password = args.password
      ? String(args.password)
      : await askPassword({ message: "请输入批量导入加密密码", minLength: 8, confirm: true });

    let onConflict = String(args.onConflict ?? "").trim().toLowerCase();
    if (!onConflict && process.stdin.isTTY) {
      onConflict = await askSelect(
        "发现重名文件时如何处理？",
        [
          { title: "自动重命名（推荐）", value: "rename" },
          { title: "跳过已存在文件", value: "skip" },
          { title: "覆盖已存在文件", value: "overwrite" },
        ],
        { initial: 0 },
      );
    }
    if (!onConflict) {
      onConflict = "rename";
    }

    const result = await keyImports({
      inputDir,
      password,
      storageRoot: String(args.storageRoot ?? "storage"),
      recursive: args.recursive !== false,
      extensions: args.ext ?? args.extensions,
      onConflict,
      failFast: Boolean(args.failFast),
      dryRun: Boolean(args.dryRun),
    });

    if (!result.dryRun && Number(result.imported ?? 0) === 0) {
      const firstFailure = Array.isArray(result.results)
        ? result.results.find((item) => item.status === "failed")
        : null;
      const reason = firstFailure?.reason
        ? `；首个失败原因：${firstFailure.reason}`
        : "";
      throw new Error(
        `批量导入未生成任何加密文件（matched=${result.matched}, imported=${result.imported}, skipped=${result.skipped}, failed=${result.failed}）。` +
        `当前工作目录：${result.cwd}；预期输出目录：${result.outputDirAbs}${reason}`,
      );
    }

    console.log(JSON.stringify({ ok: true, action: "key.imports", result }, null, 2));
    return;
  }

  if (com === "page-import") {
    const result = await runKeyPageImportServer({
      host: args.pageHost ?? args.host,
      port: args.pagePort ?? args.port,
      timeoutMs: args.pageTimeoutMs ?? args.pageTimeout ?? 300_000,
      storageRoot: String(args.storageRoot ?? "storage"),
      title: "手机页面录入密钥",
      log: (line) => console.log(line),
    });

    console.log(JSON.stringify({ ok: true, action: "key.page-import", result }, null, 2));
    return;
  }

  if (com === "restore") {
    const backupPath = await resolveRestoreBackupPath(args);
    const passphrase = await resolveRestorePassphraseIfNeeded(backupPath, args);
    const result = await keyRestore({
      backupPath,
      outputPath: args.out ? String(args.out) : undefined,
      passphrase,
      storageRoot: String(args.storageRoot ?? "storage"),
    });

    console.log(JSON.stringify({ ok: true, action: "key.restore", result }, null, 2));
    return;
  }

  if (com === "backup") {
    const source = await resolveBackupSource(args);
    const destinationPath = await resolveBackupDestination(args);
    const splitConfig = await resolveBackupSplitConfig(args);
    const passphrase = await resolveBackupPassphrase(args);

    const result = await keyBackup({
      sourceType: source.sourceType,
      sourcePath: source.sourcePath,
      destinationPath,
      threshold: splitConfig.threshold,
      sharesCount: splitConfig.sharesCount,
      passphrase,
      storageRoot: String(args.storageRoot ?? "storage"),
    });

    console.log(JSON.stringify({ ok: true, action: "key.backup", result }, null, 2));
    return;
  }

  if (com === "view") {
    const keyFile = await resolveAddTargetFile(args);
    const password = await resolveAddPasswordAndVerify(keyFile, args);
    const result = await keyView({
      keyFile,
      password,
    });

    // 默认按原文输出，便于人工查看；需要结构化输出时可传 --json
    if (Boolean(args.json)) {
      console.log(JSON.stringify({ ok: true, action: "key.view", result }, null, 2));
    } else {
      process.stdout.write(result.content);
      if (!result.content.endsWith("\n")) {
        process.stdout.write("\n");
      }
    }
    return;
  }

  if (com === "add") {
    const keyFile = await resolveAddTargetFile(args);
    const password = await resolveAddPasswordAndVerify(keyFile, args);

    const { inputPath, inputContent } = await resolveImportSource(args, {
      askSelect,
      askText,
      askConfirm,
      askPassword,
      readMultilineInput,
      readTuiDocumentInput,
    });
    const result = await keyAdd({
      keyFile,
      inputPath,
      inputContent,
      password,
    });

    console.log(JSON.stringify({ ok: true, action: "key.add", result }, null, 2));
    return;
  }

  if (com === "edit") {
    const keyFile = await resolveAddTargetFile(args);
    const password = await resolveAddPasswordAndVerify(keyFile, args);

    const prepared = await keyEditPrepare({
      keyFile,
      password,
    });

    const editedContent = await readTuiDocumentInput({
      title: "安全编辑模式（仅可编辑非密钥内容；密钥行为保护占位符）",
      initial: prepared.editableContent,
      maskSecretLines: true,
    });

    const result = await keyEditCommit({
      keyFile,
      password,
      protection: prepared.protection,
      editedContent,
    });

    console.log(JSON.stringify({ ok: true, action: "key.edit", result }, null, 2));
    return;
  }

  let name = args.name ? String(args.name) : "";
  if (com === "create" && !String(name).trim()) {
    if (!process.stdin.isTTY) {
      throw new Error("create 需要名称，请使用 --name 传入");
    }
    name = await askText("请输入要创建的 key 名称", { required: true });
  }

  const password = args.password
    ? String(args.password)
    : await askPassword({ message: "请输入加密密码", minLength: 8, confirm: true });

  const backup = Boolean(args.backup);
  let threshold = Number(args.threshold ?? 2);
  let sharesCount = Number(args.shares ?? args.sharesCount ?? 3);

  if (backup && !Object.prototype.hasOwnProperty.call(args, "threshold")) {
    threshold = Number.parseInt(
      await askText("请输入 threshold（最少分片数）", { initial: "2", required: true }),
      10,
    );
  }

  if (backup && !Object.prototype.hasOwnProperty.call(args, "shares") && !Object.prototype.hasOwnProperty.call(args, "sharesCount")) {
    sharesCount = Number.parseInt(
      await askText("请输入 shares（总分片数）", { initial: "3", required: true }),
      10,
    );
  }

  if (com === "create") {
    const result = await runWithRenameRetry(
      async (retryName) => await keyCreate({
        name: retryName,
        password,
        backup,
        threshold,
        sharesCount,
        storageRoot: String(args.storageRoot ?? "storage"),
      }),
      name,
    );

    console.log(JSON.stringify({ ok: true, action: "key.create", result }, null, 2));
    return;
  }

  if (com === "import") {
    const resolvedSource = await resolveImportSource(args, {
      askSelect,
      askText,
      askConfirm,
      askPassword,
      readMultilineInput,
      readTuiDocumentInput,
    });

    const scanMode = resolvedSource.sourceType === "scan";
    let targetMode = String(args.target ?? args.mode ?? "").trim().toLowerCase();
    if (!targetMode && scanMode && process.stdin.isTTY) {
      targetMode = await askSelect(
        "扫码导入目标",
        [
          { title: "create 新建加密文件", value: "create" },
          { title: "add 添加到已有加密文件", value: "add" },
        ],
        { initial: 0 },
      );
    }

    if (targetMode === "add") {
      const keyFile = await resolveAddTargetFile(args);
      const targetPassword = await resolveAddPasswordAndVerify(keyFile, args);
      const result = await keyAdd({
        keyFile,
        inputPath: resolvedSource.inputPath,
        inputContent: resolvedSource.inputContent,
        password: targetPassword,
      });

      console.log(JSON.stringify({ ok: true, action: "key.add", result }, null, 2));
      return;
    }

    const result = await runWithRenameRetry(
      async (retryName) => await keyImport({
        inputPath: resolvedSource.inputPath,
        inputContent: resolvedSource.inputContent,
        name: retryName,
        password,
        backup,
        threshold,
        sharesCount,
        storageRoot: String(args.storageRoot ?? "storage"),
      }),
      name,
    );

    console.log(JSON.stringify({ ok: true, action: "key.import", result }, null, 2));
    return;
  }

  throw new Error(`不支持的命令: ${com}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, action: "key", message: error?.message ?? String(error) }, null, 2));
  process.exitCode = 1;
});
