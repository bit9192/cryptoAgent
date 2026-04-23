import { JsonRpcProvider } from "ethers";
import { spawn } from "node:child_process";
import { goplusTokenSecurityOne } from "../goplus/index.mjs";
import { evmNetworks as networks } from "../../evm/configs/networks.js";
import { getContractAbi, getContractSource } from "./explorer.mjs";
import { simulateTokenSellability } from "./fork-sim.mjs";

function normalizeNetwork(networkInput) {
  const network = String(networkInput ?? "").trim().toLowerCase();
  if (!network) {
    throw new Error("network 不能为空");
  }
  return network;
}

function normalizeAddress(addressInput) {
  const address = String(addressInput ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    throw new Error(`tokenAddress 非法: ${addressInput}`);
  }
  return address;
}

function resolveForkOptions(network, options = {}) {
  const commonFork = options.fork && typeof options.fork === "object" ? options.fork : {};
  const byNetwork = options.forkByNetwork && typeof options.forkByNetwork === "object"
    ? (options.forkByNetwork[network] ?? {})
    : {};

  const mapRpc = options.forkRpcUrlByNetwork && typeof options.forkRpcUrlByNetwork === "object"
    ? String(options.forkRpcUrlByNetwork[network] ?? "").trim()
    : "";

  const directRpc = String(options.forkRpcUrl ?? "").trim();
  const selectedRpc = mapRpc || directRpc || String(byNetwork?.forkRpcUrl ?? "").trim();

  return {
    ...commonFork,
    ...(byNetwork && typeof byNetwork === "object" ? byNetwork : {}),
    ...(selectedRpc ? { forkRpcUrl: selectedRpc } : {}),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAutoForkOptions(autoForkInput) {
  if (!autoForkInput) {
    return { enabled: false };
  }
  if (autoForkInput === true) {
    return { enabled: true };
  }
  if (typeof autoForkInput === "object") {
    return { enabled: true, ...autoForkInput };
  }
  return { enabled: false };
}

async function resolveForkBlockNumber(rpcUrl, blockOffset) {
  const provider = new JsonRpcProvider(rpcUrl);
  const latest = await provider.getBlockNumber();
  return Math.max(0, latest - blockOffset);
}

async function startTemporaryFork(network, autoFork = {}) {
  const netCfg = networks[network];
  const sourceRpc = String(autoFork.rpcUrl ?? netCfg?.rpc ?? "").trim();
  if (!sourceRpc) {
    throw new Error(`autoFork 启动失败: network=${network} 缺少 rpc`);
  }

  const host = String(autoFork.host ?? "127.0.0.1").trim() || "127.0.0.1";
  const port = Number.isInteger(Number(autoFork.port)) && Number(autoFork.port) > 0
    ? Number(autoFork.port)
    : (18000 + Math.floor(Math.random() * 1000));
  const blockOffset = Number.isInteger(Number(autoFork.blockOffset)) && Number(autoFork.blockOffset) >= 0
    ? Number(autoFork.blockOffset)
    : 25;
  const startupTimeoutMs = Number.isInteger(Number(autoFork.startupTimeoutMs)) && Number(autoFork.startupTimeoutMs) > 0
    ? Number(autoFork.startupTimeoutMs)
    : 45_000;

  const blockNumber = Number.isInteger(Number(autoFork.blockNumber))
    ? Number(autoFork.blockNumber)
    : await resolveForkBlockNumber(sourceRpc, blockOffset);

  const args = [
    "hardhat",
    "node",
    "--network",
    "hardhat",
    "--hostname",
    host,
    "--port",
    String(port),
  ];

  const child = spawn("npx", args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORK_URL: sourceRpc,
      FORK_BLOCK_NUMBER: String(blockNumber),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const readyPattern = /Started HTTP and WebSocket JSON-RPC server at/i;
  let ready = false;
  let stderrBuffer = "";

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`autoFork 启动超时(${startupTimeoutMs}ms): ${stderrBuffer || "no logs"}`));
    }, startupTimeoutMs);

    const onData = (chunk) => {
      const text = String(chunk ?? "");
      if (readyPattern.test(text)) {
        ready = true;
        clearTimeout(timer);
        resolve();
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk ?? "");
      stderrBuffer += text;
      if (stderrBuffer.length > 4000) {
        stderrBuffer = stderrBuffer.slice(-4000);
      }
      onData(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (!ready) {
        clearTimeout(timer);
        reject(new Error(`autoFork 进程提前退出: code=${code ?? "unknown"}, stderr=${stderrBuffer}`));
      }
    });
  });

  return {
    child,
    rpcUrl: `http://${host}:${port}`,
    host,
    port,
    sourceRpc,
    blockNumber,
  };
}

async function stopTemporaryFork(forkCtx) {
  const child = forkCtx?.child;
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  for (let i = 0; i < 10; i += 1) {
    if (child.exitCode !== null) {
      return;
    }
    await sleep(100);
  }

  child.kill("SIGKILL");
}

export async function getTokenRiskReport(networkInput, tokenAddressInput, options = {}) {
  const network = normalizeNetwork(networkInput);
  const tokenAddress = normalizeAddress(tokenAddressInput);
  const autoFork = parseAutoForkOptions(options.autoFork);
  const useGoPlus = options.useGoPlus !== false;
  let forkOptions = resolveForkOptions(network, options);
  let tempForkCtx = null;

  try {
    if (autoFork.enabled && !forkOptions.forkRpcUrl) {
      tempForkCtx = await startTemporaryFork(network, autoFork);
      forkOptions = {
        ...forkOptions,
        forkRpcUrl: tempForkCtx.rpcUrl,
      };
    }

    const [abiResult, sourceResult, forkSimResult] = await Promise.all([
      getContractAbi(tokenAddress, {
        network,
        resolveImplementation: true,
      }),
      getContractSource(tokenAddress, {
        network,
      }),
      simulateTokenSellability({
        network,
        tokenAddress,
        ...forkOptions,
      }),
    ]);

    const goplusResult = useGoPlus
      ? await goplusTokenSecurityOne(network, tokenAddress, {
        fetchFromApi: Boolean(options.fetchFromApi ?? false),
      })
      : {
        ok: true,
        source: "goplus-sdk",
        network,
        item: null,
        meta: {
          skipped: true,
          reason: "DISABLED_BY_OPTION",
        },
      };

    const goplusItem = goplusResult?.item ?? null;
    const goplusRiskLevel = String(goplusItem?.riskLevel ?? "unknown");
    const openSourceInfo = {
      ok: Boolean(sourceResult?.ok),
      isOpenSource: Boolean(sourceResult?.data?.isOpenSource),
      isProxy: Boolean(sourceResult?.data?.isProxy),
      implementation: sourceResult?.data?.implementation ?? null,
      abiAvailable: Boolean(abiResult?.data?.abi),
      contractName: sourceResult?.data?.contractName ?? null,
    };

    const reasons = [];
    let score = 0;

    if (useGoPlus) {
      if (goplusRiskLevel === "high") {
        score += 70;
        reasons.push("GoPlus 标记 high 风险");
      } else if (goplusRiskLevel === "medium") {
        score += 40;
        reasons.push("GoPlus 标记 medium 风险");
      } else if (goplusRiskLevel === "unknown") {
        score += 20;
        reasons.push("GoPlus 返回 unknown");
      }
    } else {
      reasons.push("GoPlus 已关闭");
    }

    if (!openSourceInfo.isOpenSource) {
      score += 25;
      reasons.push("合约源码未开源");
    }

    if (openSourceInfo.isProxy && !openSourceInfo.implementation) {
      score += 20;
      reasons.push("代理合约但 implementation 不可见");
    }

    if (forkSimResult?.supported && forkSimResult?.sellable === false) {
      score += 80;
      reasons.push(`fork 卖出探针失败: ${forkSimResult?.reason ?? "REVERTED"}`);
    } else if (forkSimResult?.supported && forkSimResult?.sellable === true) {
      score -= 25;
      reasons.push("fork 卖出探针通过");
    }

    let riskLevel = "low";
    if (score >= 80) {
      riskLevel = "high";
    } else if (score >= 45) {
      riskLevel = "medium";
    }

    const verdict = riskLevel === "high"
      ? "BLOCK"
      : riskLevel === "medium"
        ? "REVIEW"
        : "ALLOW";

    return {
      ok: true,
      source: "token-risk",
      network,
      tokenAddress,
      riskLevel,
      verdict,
      score,
      reasons,
      evidence: {
        goplus: goplusResult,
        openSource: openSourceInfo,
        abi: {
          ok: Boolean(abiResult?.ok),
          implementation: abiResult?.data?.implementation ?? null,
          abiAvailable: Boolean(abiResult?.data?.abi),
        },
        forkSimulation: forkSimResult,
        forkContext: {
          hasDedicatedForkRpc: Boolean(forkOptions?.forkRpcUrl),
          autoForkEnabled: Boolean(autoFork.enabled),
          autoForkStarted: Boolean(tempForkCtx),
          autoForkRpcUrl: tempForkCtx?.rpcUrl ?? null,
          autoForkSourceRpc: tempForkCtx?.sourceRpc ?? null,
          autoForkBlockNumber: tempForkCtx?.blockNumber ?? null,
        },
        pipeline: {
          useGoPlus,
          goplusExecutedLast: useGoPlus,
        },
      },
    };
  } finally {
    await stopTemporaryFork(tempForkCtx);
  }
}

export default {
  getTokenRiskReport,
};