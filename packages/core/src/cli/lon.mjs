#!/usr/bin/env node
/**
 * cli/lon.mjs  —  Lon REPL (长任务执行 + 热更新)
 *
 * 用法：
 *   node src/cli/lon.mjs [--mode dev|op] [--autoConfirm] [--network <network>]
 *
 * 热更新（监听文件变化自动重启）：
 *   LON_EXIT_WATCHER_ON_CLOSE=1 node --watch \
 *     --watch-path src/execute --watch-path src/tasks \
 *     src/cli/lon.mjs --mode dev --autoConfirm
 */

import readline from "node:readline";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

import { parseCliCommand, askPassword, askText, askConfirm, askSelect } from "./ui.mjs";
import createWallet from "../apps/wallet/index.mjs";
import {
  execute,
  createMemoryCheckpointStore,
  getDefaultRegistry,
  clearRegistryCache,
} from "../execute/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 热更新：退出时通知 watcher 父进程 ───────────────────────

function requestWatcherParentExitIfNeeded() {
  if (process.env.LON_EXIT_WATCHER_ON_CLOSE === "1") {
    try { process.kill(process.ppid, "SIGTERM"); } catch { /* ignore */ }
  }
}

// ─── 参数解析 ─────────────────────────────────────────────────

function parseArgv(argv = process.argv.slice(2)) {
  const result = {
    mode: "dev",
    autoConfirm: false,
    network: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--mode" && argv[i + 1]) {
      const m = String(argv[++i]).toLowerCase();
      if (m === "dev" || m === "op") result.mode = m;
    } else if (token === "--autoConfirm" || token === "--auto-confirm") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        result.autoConfirm = String(next).toLowerCase() !== "false";
        i++;
      } else {
        result.autoConfirm = true;
      }
    } else if (token === "--network" && argv[i + 1]) {
      result.network = String(argv[++i]);
    }
  }

  return result;
}

// ─── Session 状态 ─────────────────────────────────────────────

function createSession(initArgs) {
  return {
    mode: initArgs.mode,
    autoConfirm: initArgs.autoConfirm,
    network: initArgs.network,
    interactionActive: false,
    skipNextLine: false,
    wallet: null,
    registry: null,
    checkpointStore: createMemoryCheckpointStore(),
    execLog: [],
    lastResult: null,
    lastResume: null,
  };
}

// ─── 钱包初始化 ───────────────────────────────────────────────

async function initWallet(session) {
  const wallet = createWallet({ baseDir: process.cwd() });
  session.wallet = wallet;

  if (session.mode === "dev") {
    await wallet.loadDevKeys();
    console.log("  [wallet] dev 模式：已加载开发密钥");
    return;
  }

  // op 模式：加载加密密钥文件
  let file;
  let password;
  try {
    file = await askText("key 文件路径（可填目录）", { required: true, initial: "key" });
    password = await askPassword({ message: "解锁密码", confirm: false, minLength: 1 });
  } catch {
    throw new Error("已取消钱包初始化");
  }

  await wallet.loadKeyFile({ file, password });
  console.log("  [wallet] op 模式：密钥文件已加载");
}

// ─── 注册表初始化 ─────────────────────────────────────────────

async function initRegistry(session) {
  try {
    clearRegistryCache();
    session.registry = await getDefaultRegistry();
    const ids = session.registry.list();
    console.log(`  [registry] 已加载 ${ids.length} 个任务`);
  } catch (err) {
    console.warn(`  [registry] 加载任务注册表失败: ${err.message}`);
    session.registry = null;
  }
}

// ─── 确认/交互 handler ────────────────────────────────────────

function makeConfirmHandler(session) {
  return async (opts) => {
    session.interactionActive = true;
    try {
    if (session.autoConfirm) {
      console.log(`  [confirm] 自动确认: ${opts.task ?? opts.type}`);
      return true;
    }
    const msg = opts.message ?? `确认执行 [${opts.task ?? opts.type}]?`;
    return askConfirm(msg, { initial: false });
    } finally {
      session.interactionActive = false;
      session.skipNextLine = true;
    }
  };
}

function makeInteractHandler(session) {
  return async (opts) => {
    session.interactionActive = true;
    const fields = Array.isArray(opts.fields) ? opts.fields : [];
    try {
    const payload = {};

    if (session.autoConfirm && opts.type === "task.interact.confirm") {
      return { payload: { confirmed: true } };
    }

    console.log(`\n  [interact] ${opts.message ?? opts.type}`);

    for (const field of fields) {
      const name = String(field.name ?? "");
      if (!name) continue;

      const fieldType = String(field.type ?? "text");
      const message = String(field.message ?? field.label ?? name);
      const required = Boolean(field.required);

      try {
        if (fieldType === "password") {
          payload[name] = await askPassword({
            message,
            confirm: Boolean(field.confirm),
            minLength: field.minLength ?? 1,
          });
        } else if (fieldType === "confirm") {
          payload[name] = await askConfirm(message, { initial: field.initial ?? false });
        } else if (fieldType === "select" && Array.isArray(field.choices)) {
          payload[name] = await askSelect(message, field.choices);
        } else {
          payload[name] = await askText(message, { required, initial: field.initial });
        }
      } catch (err) {
        if (String(err.message ?? "").includes("取消")) {
          return null; // 用户取消
        }
        throw err;
      }
    }

    return { payload };
    } finally {
      session.interactionActive = false;
      if (fields.length > 0) {
        session.skipNextLine = true;
      }
    }
  };
}

// ─── 执行辅助 ─────────────────────────────────────────────────

function logExec(session, entry) {
  session.execLog.push(entry);
  if (entry.status === "ok") {
    session.lastResult = entry.result;
  } else if (entry.status === "paused") {
    session.lastResume = entry.token;
  }
}

async function runTask(session, taskId, args, resumeToken) {
  const registry = session.registry;
  if (!registry) {
    console.error("  [task] 任务注册表未初始化");
    return;
  }

  const confirm = makeConfirmHandler(session);
  const interact = makeInteractHandler(session);

  console.log(`  [task] 正在执行: ${taskId}`);

  const result = await execute(
    {
      task: taskId,
      args: args ?? {},
      source: "cli",
      network: session.network,
      ...(resumeToken ? { resumeToken } : {}),
    },
    {
      registry,
      wallet: session.wallet,
      confirm,
      interact,
      checkpointStore: session.checkpointStore,
    },
  );

  const entry = {
    id: session.execLog.length + 1,
    task: taskId,
    timestamp: new Date().toISOString(),
  };

  if (result.paused) {
    entry.status = "paused";
    entry.token = result.resumeToken;
    session.lastResume = result.resumeToken;
    console.log(`  [task] 任务已暂停，resumeToken: ${result.resumeToken}`);
    console.log(`  [task] 使用 resume ${result.resumeToken} 继续`);
  } else if (result.ok) {
    entry.status = "ok";
    entry.result = result.data;
    session.lastResult = result.data;
    console.log("  [task] 执行成功");
    if (result.data != null) {
      try { console.log(JSON.stringify(result.data, null, 2)); } catch { console.log(String(result.data)); }
    }
  } else {
    entry.status = "error";
    entry.error = result.error?.message ?? "未知错误";
    console.error(`  [task] 执行失败: ${entry.error}`);
    if (result.error?.details) {
      try { console.error(JSON.stringify(result.error.details, null, 2)); } catch { /* ignore */ }
    }
  }

  logExec(session, entry);
}

async function runNodeScript(scriptPath, label = "run") {
  const child = spawn(process.execPath, [scriptPath], {
    stdio: "inherit",
    env: { ...process.env },
  });
  await new Promise((res) => child.on("close", (code) => {
    console.log(`  [${label}] 脚本退出: code=${code}`);
    res();
  }));
}

async function runScriptWithExecHandlers(session, scriptPath) {
  const moduleUrl = `${pathToFileURL(scriptPath).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  const runner = mod.run ?? mod.default;

  if (typeof runner !== "function") {
    throw new Error("run 脚本需要导出 run(options) 或 default(options) 函数");
  }

  const data = await runner({
    source: "cli",
    network: session.network,
    wallet: session.wallet,
    confirm: makeConfirmHandler(session),
    interact: makeInteractHandler(session),
  });

  if (data !== undefined) {
    console.log("  [run] 执行成功");
    try { console.log(JSON.stringify(data, null, 2)); } catch { console.log(String(data)); }
  } else {
    console.log("  [run] 执行成功");
  }
}

// ─── 命令分发 ─────────────────────────────────────────────────

async function dispatchCommand(line, session) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || trimmed.startsWith("#")) return true; // 继续 REPL

  const { com, args } = parseCliCommand(trimmed.split(/\s+/));

  switch (com) {
    // ── task <taskId> [--key value ...] ──
    case "task": {
      const positional = args._ ?? [];
      const taskId = String(positional[0] ?? "").trim();
      if (!taskId) {
        console.error("  用法: task <taskId> [--key value ...]");
        break;
      }
      const taskArgs = { ...args };
      delete taskArgs._;
      await runTask(session, taskId, taskArgs, null);
      break;
    }

    // ── run <scriptName> ──  固定执行 src/run 下脚本（注入 confirm/interact）
    case "run": {
      const positional = args._ ?? [];
      const scriptName = String(positional[0] ?? "").trim();
      if (!scriptName) {
        console.error("  用法: run <scriptName>");
        break;
      }

      const baseDir = path.resolve(process.cwd(), "src/run");
      const normalizedName = scriptName.endsWith(".mjs") ? scriptName : `${scriptName}.mjs`;
      const resolved = path.resolve(baseDir, normalizedName);

      if (!resolved.startsWith(`${baseDir}${path.sep}`)) {
        console.error("  非法路径：run 仅允许执行 src/run 下脚本");
        break;
      }

      console.log(`  [run] 执行脚本: ${resolved}`);
      await runScriptWithExecHandlers(session, resolved);
      break;
    }

    // ── n <scriptPath> ──  保留按路径执行（旧 run 行为）
    case "n": {
      const positional = args._ ?? [];
      const scriptPath = String(positional[0] ?? "").trim();
      if (!scriptPath) {
        console.error("  用法: n <scriptPath>");
        break;
      }
      const resolved = path.resolve(process.cwd(), scriptPath);
      console.log(`  [n] 执行脚本: ${resolved}`);
      await runNodeScript(resolved, "n");
      break;
    }

    // ── test <filePattern> [--timeout ms] ──
    case "test": {
      const positional = args._ ?? [];
      const fileArg = String(positional[0] ?? "").trim();
      if (!fileArg) {
        console.error("  用法: test <filePattern>");
        break;
      }
      const testFile = path.resolve(process.cwd(), fileArg);
      const testArgs = ["--test", testFile];
      if (args.timeout) {
        testArgs.push("--test-timeout", String(args.timeout));
      }
      console.log(`  [test] 运行测试: ${testFile}`);
      const child = spawn(process.execPath, testArgs, {
        stdio: "inherit",
        env: { ...process.env },
      });
      await new Promise((res) => child.on("close", (code) => {
        console.log(`  [test] 测试退出: code=${code}`);
        res();
      }));
      break;
    }

    // ── resume <token> ──
    case "resume": {
      const positional = args._ ?? [];
      const token = String(positional[0] ?? "").trim();
      if (!token) {
        if (session.lastResume) {
          console.log(`  使用上次的 resumeToken: ${session.lastResume}`);
          // 需要知道对应任务 ID：从 execLog 中查找
          const entry = [...session.execLog].reverse().find(
            (e) => e.token === session.lastResume,
          );
          if (entry) {
            await runTask(session, entry.task, {}, session.lastResume);
          } else {
            console.error("  无法确定 resumeToken 对应的任务，请手动指定: resume <token>");
          }
        } else {
          console.error("  用法: resume <token>");
        }
        break;
      }
      // 从 execLog 中查找 taskId
      const entry = [...session.execLog].reverse().find((e) => e.token === token);
      if (!entry) {
        console.error(`  未找到 resumeToken 对应的记录: ${token}`);
        console.error("  如果任务跨重启，请用: task <taskId> --resumeToken <token>");
        break;
      }
      await runTask(session, entry.task, {}, token);
      break;
    }

    // ── use <dev|op> ──
    case "use": {
      const positional = args._ ?? [];
      const newMode = String(positional[0] ?? "").toLowerCase();
      if (newMode !== "dev" && newMode !== "op") {
        console.error("  用法: use <dev|op>");
        break;
      }
      session.mode = newMode;
      try {
        await initWallet(session);
        console.log(`  [use] 已切换到 ${newMode} 模式`);
      } catch (err) {
        console.error(`  [use] 切换失败: ${err.message}`);
      }
      break;
    }

    // ── reload ──  手动重新加载注册表
    case "reload": {
      await initRegistry(session);
      console.log("  [reload] 注册表已重新加载");
      break;
    }

    // ── state ──
    case "state": {
      console.log("\n  Session 状态:");
      console.log(`    mode:        ${session.mode}`);
      console.log(`    autoConfirm: ${session.autoConfirm}`);
      console.log(`    network:     ${session.network ?? "(未设置)"}`);
      const keys = session.wallet ? (await session.wallet.listKeys()).items : [];
      console.log(`    keys:        ${keys.length} 个已加载`);
      const tasks = session.registry ? session.registry.list() : [];
      console.log(`    tasks:       ${tasks.length} 个已注册`);
      console.log(`    execLog:     ${session.execLog.length} 条记录`);
      if (session.lastResume) {
        console.log(`    lastResume:  ${session.lastResume}`);
      }
      console.log();
      break;
    }

    // ── history [id] ──
    case "history": {
      const positional = args._ ?? [];
      const idStr = String(positional[0] ?? "").trim();

      if (idStr) {
        const id = Number.parseInt(idStr, 10);
        const entry = session.execLog.find((e) => e.id === id);
        if (!entry) {
          console.error(`  未找到记录 #${id}`);
          break;
        }
        console.log(`\n  记录 #${entry.id}:`);
        console.log(`    task:      ${entry.task}`);
        console.log(`    status:    ${entry.status}`);
        console.log(`    timestamp: ${entry.timestamp}`);
        if (entry.token) console.log(`    token:     ${entry.token}`);
        if (entry.error) console.log(`    error:     ${entry.error}`);
        if (entry.result != null) {
          try { console.log(`    result:    ${JSON.stringify(entry.result)}`); } catch { /* ignore */ }
        }
        console.log();
      } else if (session.execLog.length === 0) {
        console.log("  (暂无执行记录)");
      } else {
        console.log("\n  执行历史:");
        for (const e of session.execLog.slice(-20)) {
          const symbol = e.status === "ok" ? "✓" : e.status === "paused" ? "⏸" : "✗";
          console.log(`    #${String(e.id).padEnd(3)} ${symbol} ${e.task.padEnd(30)} ${e.timestamp}`);
        }
        console.log();
      }
      break;
    }

    // ── tasks ──  列出已注册任务
    case "tasks": {
      if (!session.registry) {
        console.log("  (注册表未初始化)");
        break;
      }
      const ids = session.registry.list();
      if (ids.length === 0) {
        console.log("  (没有已注册的任务)");
      } else {
        console.log("\n  已注册任务:");
        for (const id of ids.sort()) {
          const def = session.registry.get(id);
          const label = def?.title ? `  ${def.title}` : "";
          console.log(`    ${id}${label}`);
        }
        console.log();
      }
      break;
    }

    // ── help ──
    case "help":
    case "?": {
      console.log(`
  Lon REPL 命令:
    task <taskId> [--key value ...]   执行已注册的任务
    run  <scriptName>                 运行 src/run/<scriptName>.mjs
    n    <scriptPath>                 按路径运行脚本（旧 run 行为）
    test <filePattern>                运行 Node 测试文件
    resume <token>                    恢复已暂停的任务
    use  <dev|op>                     切换 wallet 模式
    tasks                             列出所有已注册任务
    reload                            重新加载任务注册表
    state                             查看当前 Session 状态
    history [id]                      查看执行历史
    help                              显示此帮助
    exit                              退出

  快捷键: Ctrl+C 取消当前输入，Ctrl+D 退出
`);
      break;
    }

    // ── exit / quit ──
    case "exit":
    case "quit": {
      return false; // 通知 REPL 退出
    }

    default: {
      if (com) {
        console.error(`  未知命令: ${com}（输入 help 查看帮助）`);
      }
    }
  }

  return true; // 继续 REPL
}

// ─── REPL 主循环 ──────────────────────────────────────────────

async function runRepl(session) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
    removeHistoryDuplicates: true,
  });

  const modeLabel = session.mode === "dev" ? "dev" : "op";
  const network = session.network ? `@${session.network}` : "";
  const prompt = () => `lon[${modeLabel}${network}]> `;

  // 重新赋值动态 prompt（mode/network 可能中途变化）
  rl.setPrompt(prompt());
  rl.prompt();

  return new Promise((resolve) => {
    rl.on("line", async (line) => {
      if (session.interactionActive) {
        return;
      }
      if (session.skipNextLine) {
        session.skipNextLine = false;
        rl.prompt();
        return;
      }
      rl.pause();
      try {
        const cont = await dispatchCommand(line, session);
        if (!cont) {
          rl.close();
          return;
        }
      } catch (err) {
        console.error(`  [error] ${err.message}`);
      }
      // 更新 prompt（mode 可能已改变）
      rl.setPrompt(prompt());
      rl.resume();
      rl.prompt();
    });

    rl.on("close", () => {
      console.log("\n  Goodbye.");
      resolve();
    });

    rl.on("SIGINT", () => {
      process.stdout.write("\n");
      rl.setPrompt(prompt());
      rl.prompt();
    });
  });
}

// ─── 启动横幅 ─────────────────────────────────────────────────

function printBanner(session) {
  console.log("┌───────────────────────────────────────┐");
  console.log("│           Lon REPL  (ex:lon)          │");
  console.log("└───────────────────────────────────────┘");
  console.log(`  mode:        ${session.mode}`);
  console.log(`  autoConfirm: ${session.autoConfirm}`);
  console.log(`  network:     ${session.network ?? "(默认)"}`);
  if (process.env.LON_EXIT_WATCHER_ON_CLOSE === "1") {
    console.log("  hot-reload:  已启用（--watch 模式）");
  }
  console.log("  输入 help 查看命令列表\n");
}

// ─── 入口 ─────────────────────────────────────────────────────

async function main() {
  const initArgs = parseArgv();
  const session = createSession(initArgs);

  // SIGTERM：来自 --watch 文件变化，干净退出让 watcher 重启
  process.on("SIGTERM", () => {
    console.log("\n  [hot-reload] 检测到文件变化，正在重启...");
    process.exit(0);
  });

  printBanner(session);

  // 初始化 wallet
  try {
    await initWallet(session);
  } catch (err) {
    console.error(`  [init] wallet 初始化失败: ${err.message}`);
    console.error("  启动失败，退出。");
    process.exit(1);
  }

  // 初始化任务注册表
  await initRegistry(session);

  // 进入 REPL
  await runRepl(session);

  // 退出时：通知 watcher 父进程停止（如果是显式用户退出）
  requestWatcherParentExitIfNeeded();
  process.exit(0);
}

main().catch((err) => {
  console.error("  [fatal]", err);
  process.exit(1);
});
