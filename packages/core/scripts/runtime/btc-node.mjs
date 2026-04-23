import "dotenv/config";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { getBtcNetworkConfig, normalizeBtcNetworkName } from "../../src/apps/btc/config/networks.js";

function printHelp() {
  console.log("Usage: npm run btc:node -- <start|stop> [options]");
  console.log("");
  console.log("Options:");
  console.log("  -n, --network <name>   BTC 网络（mainnet|testnet|signet|regtest，默认 regtest）");
  console.log("      --foreground       前台运行 bitcoind（仅 start 有效）");
  console.log("  -h, --help             显示帮助");
  console.log("");
  console.log("Examples:");
  console.log("  npm run btc:node -- start --network regtest");
  console.log("  npm run btc:node -- stop --network regtest");
  console.log("  npm run btc:node -- start --foreground");
}

function parseCommand(argv) {
  const [action, ...rest] = argv;
  const normalized = String(action ?? "").trim().toLowerCase();

  if (!normalized || normalized === "-h" || normalized === "--help" || normalized === "help") {
    return { type: "help", args: [] };
  }

  if (normalized === "start") {
    return { type: "start", args: rest };
  }

  if (normalized === "stop") {
    return { type: "stop", args: rest };
  }

  throw new Error(`不支持的动作: ${action}`);
}

function parseNetworkArgs(argv) {
  const result = {
    networkName: "regtest",
    foreground: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-n" || token === "--network") {
      result.networkName = String(argv[i + 1] ?? "regtest").trim();
      i += 1;
      continue;
    }
    if (token.startsWith("--network=")) {
      result.networkName = token.slice("--network=".length).trim();
      continue;
    }
    if (token.startsWith("-n=")) {
      result.networkName = token.slice(3).trim();
      continue;
    }
    if (token === "--foreground") {
      result.foreground = true;
    }
  }

  result.networkName = normalizeBtcNetworkName(result.networkName);
  return result;
}

function buildAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function btcRpcCall(config, method, params = [], timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: buildAuthHeader(config.rpcUsername, config.rpcPassword),
      },
      body: JSON.stringify({
        jsonrpc: "1.0",
        id: "core-btc-node",
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.error) {
      throw new Error(payload.error.message || JSON.stringify(payload.error));
    }

    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForRpc(config, maxAttempts = 20) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await btcRpcCall(config, "getblockchaininfo", [], 2000);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}

function spawnBitcoind(args, foreground) {
  return new Promise((resolve, reject) => {
    const child = spawn("bitcoind", args, {
      stdio: foreground ? "inherit" : "pipe",
      env: process.env,
    });

    if (foreground) {
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0 || code === null) {
          resolve();
          return;
        }
        reject(new Error(`bitcoind 退出，code=${code}`));
      });
      return;
    }

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`bitcoind 退出，code=${code ?? "unknown"}`));
    });
  });
}

async function startNode(argv) {
  const parsed = parseNetworkArgs(argv);
  const config = getBtcNetworkConfig(parsed.networkName);

  const alreadyReady = await waitForRpc(config, 1);
  if (alreadyReady) {
    console.log(`BTC ${parsed.networkName} 节点已在运行: ${config.rpcUrl}`);
    return;
  }

  await fs.mkdir(config.dataDir, { recursive: true });

  const networkFlag = parsed.networkName === "mainnet" ? null : `-${parsed.networkName}`;
  const args = [
    ...(networkFlag ? [networkFlag] : []),
    `-datadir=${config.dataDir}`,
    "-server=1",
    "-txindex=1",
    "-rest=1",
    "-fallbackfee=0.0002",
    "-rpcbind=127.0.0.1",
    "-rpcallowip=127.0.0.1",
    `-rpcuser=${config.rpcUsername}`,
    `-rpcpassword=${config.rpcPassword}`,
    `-rpcport=${config.rpcPort}`,
  ];

  if (!parsed.foreground) {
    args.push("-daemon=1", "-daemonwait=1");
  }

  await spawnBitcoind(args, parsed.foreground);

  if (!parsed.foreground) {
    const ready = await waitForRpc(config);
    if (!ready) {
      throw new Error(`BTC ${parsed.networkName} 节点启动后未能通过 RPC 就绪检查`);
    }

    console.log(`BTC ${parsed.networkName} 节点已启动`);
    console.log(`rpc    : ${config.rpcUrl}`);
    console.log(`wallet : ${config.walletName}`);
    console.log(`datadir: ${config.dataDir}`);
  }
}

async function stopNode(argv) {
  const parsed = parseNetworkArgs(argv);
  const config = getBtcNetworkConfig(parsed.networkName);
  await btcRpcCall(config, "stop", []);
  console.log(`BTC ${parsed.networkName} 节点停止请求已发送`);
}

async function main() {
  const parsed = parseCommand(process.argv.slice(2));

  if (parsed.type === "help") {
    printHelp();
    return;
  }

  if (parsed.type === "start") {
    await startNode(parsed.args);
    return;
  }

  await stopNode(parsed.args);
}

main().catch((error) => {
  console.error(`btc:node 执行失败: ${error.message}`);
  printHelp();
  process.exitCode = 1;
});
