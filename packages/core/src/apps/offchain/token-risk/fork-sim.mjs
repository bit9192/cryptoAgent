import { Contract, JsonRpcProvider } from "ethers";
import { resolveEvmNetProvider } from "../../evm/netprovider.mjs";

const ERC20_PROBE_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const ROUTER_V2_SELL_ABI = [
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
];

const V2_FACTORY_ABI = [
  "function getPair(address,address) view returns (address)",
];

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DISCOVERY_WINDOWS = Object.freeze([1500, 6000, 20000, 80000, 200000, 600000]);
const MAX_LOG_BLOCK_SPAN = 50000;

const NETWORK_DEFAULTS = Object.freeze({
  bsc: {
    routerAddress: "0x10ed43c718714eb63d5aa57b78b54704e256024e",
    factoryAddress: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
    quoteAddress: "0x55d398326f99059ff775485246999027b3197955",
  },
  eth: {
    routerAddress: "0x7a250d5630b4cf539739df2c5dacab4c659f2488",
    factoryAddress: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f",
    quoteAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  },
  ethereum: {
    routerAddress: "0x7a250d5630b4cf539739df2c5dacab4c659f2488",
    factoryAddress: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f",
    quoteAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  },
});

function normalizeNetwork(networkInput) {
  const network = String(networkInput ?? "").trim().toLowerCase();
  if (!network) throw new Error("network 不能为空");
  return network;
}

function normalizeAddress(addressInput, fieldName = "address", required = true) {
  const raw = String(addressInput ?? "").trim().toLowerCase();
  if (!raw && !required) return null;
  if (!/^0x[0-9a-f]{40}$/.test(raw)) {
    throw new Error(`${fieldName} 非法: ${addressInput}`);
  }
  return raw;
}

function parseRevertReason(error) {
  const msg = String(error?.shortMessage ?? error?.reason ?? error?.message ?? "").toLowerCase();
  if (!msg) return "UNKNOWN_ERROR";
  if (msg.includes("blacklist") || msg.includes("black listed")) return "BLACKLIST_REVERT";
  if (msg.includes("honeypot")) return "HONEYPOT_REVERT";
  if (msg.includes("insufficient") && msg.includes("balance")) return "INSUFFICIENT_BALANCE";
  if (msg.includes("trading") && msg.includes("disabled")) return "TRADING_DISABLED";
  if (msg.includes("transfer_from_failed") || msg.includes("transfer from failed")) return "TRANSFER_FROM_FAILED";
  return "REVERTED";
}

function decodeTopicAddress(topic) {
  const raw = String(topic ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(raw)) {
    return null;
  }
  return `0x${raw.slice(26)}`;
}

async function discoverHolderAddress(provider, tokenAddress, options = {}) {
  const routerAddress = normalizeAddress(options.routerAddress, "routerAddress", false);
  const quoteAddress = normalizeAddress(options.quoteAddress, "quoteAddress", false);
  const exclude = new Set(
    [
      tokenAddress,
      routerAddress,
      quoteAddress,
      "0x0000000000000000000000000000000000000000",
      "0x000000000000000000000000000000000000dead",
    ].filter(Boolean),
  );

  const token = new Contract(tokenAddress, ERC20_PROBE_ABI, provider);
  const latestBlock = await provider.getBlockNumber();

  for (const windowSize of DISCOVERY_WINDOWS) {
    const fromBlock = Math.max(0, latestBlock - windowSize);
    const logs = [];
    for (let cursor = fromBlock; cursor <= latestBlock; cursor += MAX_LOG_BLOCK_SPAN) {
      const chunkToBlock = Math.min(latestBlock, cursor + MAX_LOG_BLOCK_SPAN - 1);
      const chunkLogs = await provider.getLogs({
        address: tokenAddress,
        fromBlock: cursor,
        toBlock: chunkToBlock,
        topics: [TRANSFER_TOPIC],
      });
      logs.push(...chunkLogs);
    }

    const candidates = [];
    const seen = new Set();
    for (let index = logs.length - 1; index >= 0; index -= 1) {
      const log = logs[index];
      const to = decodeTopicAddress(log?.topics?.[2]);
      const from = decodeTopicAddress(log?.topics?.[1]);
      for (const candidate of [to, from]) {
        if (!candidate || seen.has(candidate) || exclude.has(candidate)) continue;
        seen.add(candidate);
        candidates.push(candidate);
        if (candidates.length >= 30) {
          break;
        }
      }
      if (candidates.length >= 30) {
        break;
      }
    }

    for (const candidate of candidates) {
      try {
        const [balance, code] = await Promise.all([
          token.balanceOf(candidate),
          provider.getCode(candidate),
        ]);
        if (balance > 0n && (!options.preferEoa || code === "0x")) {
          return {
            address: candidate,
            balanceRaw: String(balance),
            source: "recent-transfer-log",
            fromBlock,
            toBlock: latestBlock,
            isContract: code !== "0x",
          };
        }
      } catch {
        // ignore broken candidate and continue
      }
    }
  }

  return null;
}

async function impersonateIfSupported(provider, address) {
  if (!provider || typeof provider.send !== "function") return { ok: false, mode: null };

  try {
    await provider.send("hardhat_impersonateAccount", [address]);
    return { ok: true, mode: "hardhat" };
  } catch {
    try {
      await provider.send("anvil_impersonateAccount", [address]);
      return { ok: true, mode: "anvil" };
    } catch {
      return { ok: false, mode: null };
    }
  }
}

async function setBalanceIfSupported(provider, address, balanceHex) {
  if (!provider || typeof provider.send !== "function") return false;
  try {
    await provider.send("hardhat_setBalance", [address, balanceHex]);
    return true;
  } catch {
    try {
      await provider.send("anvil_setBalance", [address, balanceHex]);
      return true;
    } catch {
      return false;
    }
  }
}

async function stopImpersonate(provider, address, mode) {
  if (!provider || typeof provider.send !== "function" || !mode) return;
  try {
    if (mode === "hardhat") {
      await provider.send("hardhat_stopImpersonatingAccount", [address]);
      return;
    }
    if (mode === "anvil") {
      await provider.send("anvil_stopImpersonatingAccount", [address]);
    }
  } catch {
    // ignore cleanup failure
  }
}

export async function simulateTokenSellability(options = {}) {
  const network = normalizeNetwork(options.network ?? "fork");
  const defaults = NETWORK_DEFAULTS[network] ?? null;
  const tokenAddress = normalizeAddress(options.tokenAddress, "tokenAddress");
  const quoteAddress = normalizeAddress(options.quoteAddress ?? defaults?.quoteAddress, "quoteAddress", false);
  const routerAddress = normalizeAddress(options.routerAddress ?? defaults?.routerAddress, "routerAddress", false);
  const factoryAddress = normalizeAddress(options.factoryAddress ?? defaults?.factoryAddress, "factoryAddress", false);
  let holderAddress = normalizeAddress(options.holderAddress, "holderAddress", false);

  const forkRpcUrl = String(options.forkRpcUrl ?? options.rpcUrl ?? "").trim();
  const net = forkRpcUrl ? null : resolveEvmNetProvider(network, options);
  const provider = forkRpcUrl
    ? new JsonRpcProvider(
      forkRpcUrl,
      Number(options.forkChainId ?? 31337) || 31337,
      { staticNetwork: true },
    )
    : net.provider;
  const isForkLike = Boolean(forkRpcUrl) || net.networkName === "fork" || Boolean(net.isForkable);

  if (!isForkLike) {
    return {
      ok: true,
      source: "fork-sim",
      network,
      tokenAddress,
      quoteAddress,
      supported: false,
      sellable: null,
      reason: "NETWORK_NOT_FORKABLE",
      metrics: {
        holderBalanceRaw: null,
        amountInRaw: null,
        approveGas: null,
        sellGas: null,
        estimatedTaxBps: null,
      },
    };
  }

  let discoveredHolder = null;
  if (!holderAddress) {
    try {
      discoveredHolder = await discoverHolderAddress(provider, tokenAddress, {
        routerAddress,
        quoteAddress,
        preferEoa: options.preferEoa !== false,
      });
      holderAddress = discoveredHolder?.address ?? null;
    } catch {
      discoveredHolder = null;
    }
  }

  if (!routerAddress || !quoteAddress || !holderAddress) {
    return {
      ok: true,
      source: "fork-sim",
      network,
      tokenAddress,
      quoteAddress,
      supported: true,
      sellable: null,
      reason: "PRECONDITION_MISSING",
      details: {
        needs: holderAddress ? [] : ["holderAddress"],
        defaultsApplied: {
          routerAddress: routerAddress ?? null,
          quoteAddress: quoteAddress ?? null,
        },
        discoveredHolder,
      },
      metrics: {
        holderBalanceRaw: null,
        amountInRaw: null,
        approveGas: null,
        sellGas: null,
        estimatedTaxBps: null,
      },
    };
  }

  const token = new Contract(tokenAddress, ERC20_PROBE_ABI, provider);
  const router = new Contract(routerAddress, ROUTER_V2_SELL_ABI, provider);

  if (factoryAddress && quoteAddress) {
    try {
      const factory = new Contract(factoryAddress, V2_FACTORY_ABI, provider);
      const pairAddress = String(await factory.getPair(tokenAddress, quoteAddress)).toLowerCase();
      if (!pairAddress || /^0x0{40}$/.test(pairAddress)) {
        return {
          ok: true,
          source: "fork-sim",
          network,
          tokenAddress,
          quoteAddress,
          supported: false,
          sellable: null,
          reason: "STANDARD_ROUTE_NOT_FOUND",
          details: {
            holderAddress,
            discoveredHolder,
            routerAddress,
            quoteAddress,
            factoryAddress,
          },
          metrics: {
            holderBalanceRaw: null,
            amountInRaw: null,
            approveGas: null,
            sellGas: null,
            estimatedTaxBps: null,
          },
        };
      }
    } catch {
      // if factory check itself fails, continue and let swap probe decide
    }
  }

  const impersonate = await impersonateIfSupported(provider, holderAddress);
  if (!impersonate.ok) {
    return {
      ok: true,
      source: "fork-sim",
      network,
      tokenAddress,
      quoteAddress,
      supported: false,
      sellable: null,
      reason: "IMPERSONATION_NOT_SUPPORTED",
      metrics: {
        holderBalanceRaw: null,
        amountInRaw: null,
        approveGas: null,
        sellGas: null,
        estimatedTaxBps: null,
      },
    };
  }

  try {
    const holderBalance = await token.balanceOf(holderAddress);
    if (holderBalance <= 0n) {
      return {
        ok: true,
        source: "fork-sim",
        network,
        tokenAddress,
        quoteAddress,
        supported: true,
        sellable: null,
        reason: "HOLDER_ZERO_BALANCE",
        metrics: {
          holderBalanceRaw: "0",
          amountInRaw: null,
          approveGas: null,
          sellGas: null,
          estimatedTaxBps: null,
        },
      };
    }

    const amountInRaw = String(options.amountInRaw ?? "").trim();
    const amountIn = /^\d+$/.test(amountInRaw)
      ? BigInt(amountInRaw)
      : (holderBalance > 1000n ? holderBalance / 1000n : holderBalance);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const path = [tokenAddress, quoteAddress];

    const approveData = token.interface.encodeFunctionData("approve", [routerAddress, amountIn]);
    const sellData = router.interface.encodeFunctionData(
      "swapExactTokensForTokensSupportingFeeOnTransferTokens",
      [amountIn, 0n, path, holderAddress, deadline],
    );

    await setBalanceIfSupported(provider, holderAddress, "0x3635c9adc5dea00000");

    const approveGas = await provider.estimateGas({
      from: holderAddress,
      to: tokenAddress,
      data: approveData,
    });

    const approveTxHash = await provider.send("eth_sendTransaction", [{
      from: holderAddress,
      to: tokenAddress,
      data: approveData,
    }]);
    await provider.waitForTransaction(approveTxHash);

    const sellGas = await provider.estimateGas({
      from: holderAddress,
      to: routerAddress,
      data: sellData,
    });

    return {
      ok: true,
      source: "fork-sim",
      network,
      tokenAddress,
      quoteAddress,
      supported: true,
      sellable: true,
      reason: "SWAP_GAS_ESTIMATE_OK",
      details: {
        holderAddress,
        discoveredHolder,
        approveTxHash,
      },
      metrics: {
        holderBalanceRaw: String(holderBalance),
        amountInRaw: String(amountIn),
        approveGas: String(approveGas),
        sellGas: String(sellGas),
        estimatedTaxBps: null,
      },
    };
  } catch (error) {
    return {
      ok: true,
      source: "fork-sim",
      network,
      tokenAddress,
      quoteAddress,
      supported: true,
      sellable: false,
      reason: parseRevertReason(error),
      error: String(error?.shortMessage ?? error?.message ?? error),
      details: {
        holderAddress,
        discoveredHolder,
        routerAddress,
        quoteAddress,
      },
      metrics: {
        holderBalanceRaw: null,
        amountInRaw: null,
        approveGas: null,
        sellGas: null,
        estimatedTaxBps: null,
      },
    };
  } finally {
    await stopImpersonate(provider, holderAddress, impersonate.mode);
  }
}

export default {
  simulateTokenSellability,
};
