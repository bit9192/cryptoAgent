import { JsonRpcProvider } from "ethers";
import { getEvmNetworkConfig } from "./configs/networks.js";

function toRpcUrl(input) {
  const raw = String(input ?? "").trim();
  return raw || "";
}

function toProvider(input, chainId) {
  if (!input) return null;
  if (typeof input === "string") {
    const rpcUrl = toRpcUrl(input);
    return rpcUrl ? new JsonRpcProvider(rpcUrl, Number(chainId)) : null;
  }
  if (typeof input === "object") {
    if (typeof input.getBlockNumber === "function" || typeof input.request === "function") {
      return input;
    }
    if (input.provider && (typeof input.provider.getBlockNumber === "function" || typeof input.provider.request === "function")) {
      return input.provider;
    }
  }
  return null;
}

export function createEvmNetProvider(input = {}) {
  const config = getEvmNetworkConfig(input.networkName ?? input.network);
  const rpcUrl = toRpcUrl(input.rpcUrl ?? input.rpc ?? config.rpc);
  const provider = toProvider(input.provider ?? rpcUrl, config.chainId);

  return Object.freeze({
    chain: "evm",
    networkName: config.network,
    chainId: Number(config.chainId),
    chainType: config.chainType,
    gasToken: config.gasToken,
    explorerUrl: config.explorerUrl,
    isLocal: Boolean(config.isLocal),
    isMainnet: Boolean(config.isMainnet),
    isForkable: Boolean(config.isForkable),
    forkMode: Boolean(config.forkMode),
    forkSourceNetwork: config.forkSourceNetwork ?? null,
    forkSourceChainId: Number.isInteger(Number(config.forkSourceChainId)) ? Number(config.forkSourceChainId) : null,
    forkSourceRpcUrl: String(config.forkSourceRpcUrl ?? "").trim() || null,
    forkBlockNumber: Number.isInteger(Number(config.forkBlockNumber)) ? Number(config.forkBlockNumber) : null,
    providerType: "jsonrpc",
    rpcUrl,
    provider,
    supports(capability) {
      const op = String(capability ?? "").trim();
      if (!op) return false;
      return ["sendTransaction", "estimateGas", "getBalance", "getBlockNumber"].includes(op);
    },
    async healthcheck() {
      if (!provider || typeof provider.getBlockNumber !== "function") {
        throw new Error("EVM provider 不可用：缺少 getBlockNumber");
      }
      const blockNumber = await provider.getBlockNumber();
      return {
        healthy: true,
        networkName: config.network,
        chainId: Number(config.chainId),
        forkSourceNetwork: config.forkSourceNetwork ?? null,
        forkSourceChainId: Number.isInteger(Number(config.forkSourceChainId)) ? Number(config.forkSourceChainId) : null,
        blockNumber,
      };
    },
  });
}

export function defaultEvmNetProvider() {
  return createEvmNetProvider();
}

export function resolveEvmNetProvider(networkNameOrProvider, fallbackOptions = {}) {
  if (networkNameOrProvider && typeof networkNameOrProvider === "object") {
    if (
      typeof networkNameOrProvider.healthcheck === "function"
      && networkNameOrProvider.chain === "evm"
      && networkNameOrProvider.networkName
    ) {
      return networkNameOrProvider;
    }

    if (typeof networkNameOrProvider.getBlockNumber === "function" || typeof networkNameOrProvider.request === "function") {
      const wrapped = createEvmNetProvider({
        ...fallbackOptions,
        provider: networkNameOrProvider,
        networkName: fallbackOptions.networkName ?? fallbackOptions.network ?? "fork",
      });
      return wrapped;
    }

    return createEvmNetProvider({ ...fallbackOptions, ...networkNameOrProvider });
  }

  if (typeof networkNameOrProvider === "string") {
    return createEvmNetProvider({ ...fallbackOptions, networkName: networkNameOrProvider });
  }

  return defaultEvmNetProvider();
}

export default {
  createEvmNetProvider,
  defaultEvmNetProvider,
  resolveEvmNetProvider,
};
