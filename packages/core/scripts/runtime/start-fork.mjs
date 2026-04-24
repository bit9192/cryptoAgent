import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prompts from "prompts";
import { JsonRpcProvider } from "ethers";
import { evmNetworks } from "../../src/apps/evm/configs/networks.js";
import { writeEvmForkState, clearEvmForkState } from "../../src/apps/evm/fork/node.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CORE_PACKAGE_DIR = path.resolve(SCRIPT_DIR, "../../");

function parseArgs(argv) {
  let network = "";
  let port = 8545;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "-h" || token === "--help") {
      return { help: true, network: "", port };
    }

    if (token === "-n" || token === "--network") {
      network = String(argv[i + 1] ?? "").trim();
      i += 1;
      continue;
    }

    if (token.startsWith("-n=")) {
      network = token.slice(3).trim();
      continue;
    }

    if (token.startsWith("--network=")) {
      network = token.slice("--network=".length).trim();
      continue;
    }

    if (token === "-p" || token === "--port") {
      const parsed = Number.parseInt(String(argv[i + 1] ?? ""), 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        port = parsed;
      }
      i += 1;
      continue;
    }

    if (token.startsWith("-p=")) {
      const parsed = Number.parseInt(token.slice(3).trim(), 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        port = parsed;
      }
      continue;
    }

    if (token.startsWith("--port=")) {
      const parsed = Number.parseInt(token.slice("--port=".length).trim(), 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        port = parsed;
      }
      continue;
    }
  }

  return { help: false, network, port };
}

function printHelp() {
  console.log("Usage: npm run fork -- [options]");
  console.log("");
  console.log("Options:");
  console.log("  -n, --network <name>   指定 fork 网络（如 eth / bsc）");
  console.log("  -p, --port <port>      指定本地 hardhat 端口（默认 8545）");
  console.log("  -h, --help             显示帮助");
}

function resolveForkableNetworks() {
  return Object.entries(evmNetworks)
    .filter(([, cfg]) => typeof cfg?.rpc === "string" && cfg.rpc.trim() && !cfg?.isLocal)
    .map(([name, cfg]) => ({ name, cfg }));
}

function spawnHardhat(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "hardhat", ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        ...extraEnv,
      },
      cwd: CORE_PACKAGE_DIR,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Hardhat 命令执行失败，退出码 ${code ?? 1}`));
    });
  });
}

async function pickNetwork(args, choices) {
  if (args.network) {
    const selected = choices.find((item) => item.name === args.network);
    if (!selected) {
      throw new Error(`网络 ${args.network} 不支持 fork`);
    }
    return selected;
  }

  if (choices.length === 1) {
    return choices[0];
  }

  const response = await prompts(
    {
      type: "select",
      name: "network",
      message: "选择要 fork 的网络",
      choices: choices.map((item) => ({
        title: `${item.name}  (${item.cfg.rpc.slice(0, 42)}...)`,
        value: item,
      })),
    },
    {
      onCancel: () => {
        throw new Error("已取消");
      },
    },
  );

  return response.network;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const forkableNetworks = resolveForkableNetworks();
  if (forkableNetworks.length === 0) {
    throw new Error("没有可 fork 的 EVM 网络配置，请检查 core apps evm networks");
  }

  const selected = await pickNetwork(args, forkableNetworks);

  console.log(`正在查询 ${selected.name} 当前区块高度...`);
  const provider = new JsonRpcProvider(selected.cfg.rpc);
  const latestBlock = await provider.getBlockNumber();
  const forkBlock = Math.max(0, latestBlock - 25);
  console.log(`最新区块: ${latestBlock}，fork 区块: ${forkBlock} (- 25)`);

  console.log(`启动本地 fork 节点 127.0.0.1:${args.port}...`);
  await writeEvmForkState({
    sourceNetwork: selected.name,
    sourceChainId: Number(selected.cfg.chainId),
    sourceRpcUrl: selected.cfg.rpc,
    localRpcUrl: `http://127.0.0.1:${args.port}`,
    localChainId: 31337,
    blockNumber: forkBlock,
  });

  try {
    await spawnHardhat(
      ["node", "--network", "hardhat", "--hostname", "127.0.0.1", "--port", String(args.port)],
      {
        FORK_URL: selected.cfg.rpc,
        FORK_BLOCK_NUMBER: String(forkBlock),
        EVM_FORK_SOURCE_NETWORK: selected.name,
        EVM_FORK_SOURCE_CHAIN_ID: String(selected.cfg.chainId),
        EVM_FORK_SOURCE_RPC_URL: selected.cfg.rpc,
      },
    );
  } finally {
    await clearEvmForkState();
  }
}

main().catch((error) => {
  console.error(`fork 启动失败: ${error.message}`);
  process.exitCode = 1;
});
