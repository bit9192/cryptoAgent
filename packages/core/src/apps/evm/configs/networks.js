import "dotenv/config";
import { readEvmForkStateSync } from "../fork/node.mjs";

function normalizeOptionalUrl(value) {
	const raw = String(value ?? "").trim();
	if (!raw) return "";
	if (/^https?:\/\//i.test(raw)) return raw;
	return `https://${raw}`;
}

export const evmNetworks = Object.freeze({
	eth: Object.freeze({
		network: "eth",
		rpc: normalizeOptionalUrl(process.env.ETHMAIN_RPC_URL),
		chainId: 1,
		chainType: "l1",
		etherscan: Object.freeze({
			apiKey: process.env.ETHERSCAN_API_KEY || "",
			apiURL: "https://api.etherscan.io/v2/api?chainid=1",
			browserURL: "https://etherscan.io/",
		}),
		isForkable: true,
		gasToken: "ETH",
		explorerUrl: "https://etherscan.io",
		isMainnet: true,
	}),
	bsc: Object.freeze({
		network: "bsc",
		rpc: normalizeOptionalUrl(process.env.BSC_RPC_URL),
		accountsCount: 20,
		chainId: 56,
		chainType: "l1",
		etherscan: Object.freeze({
			apiKey: process.env.ETHERSCAN_API_KEY || "",
			apiURL: "https://api.etherscan.io/v2/api?chainid=56",
			browserURL: "https://bscscan.com/",
		}),
		isForkable: true,
		gasToken: "BNB",
		explorerUrl: "https://bscscan.com",
		isMainnet: true,
	}),
	fork: Object.freeze({
		network: "fork",
		chainId: Number(process.env.EVM_FORK_CHAIN_ID || 31337),
		rpc: String(process.env.EVM_FORK_RPC_URL || "http://127.0.0.1:8545").trim(),
		accountsCount: 20,
		chainType: "l1",
		etherscan: Object.freeze({
			apiKey: process.env.ETHERSCAN_API_KEY || "",
			apiURL: "https://api.etherscan.io/v2/api?chainid=1337",
			browserURL: "https://etherscan.io/",
		}),
		gasToken: "ETH",
		explorerUrl: "",
		isMainnet: false,
		isLocal: true,
	}),
});

export const defaultEvmNetworkName = String(process.env.EVM_NETWORK || "bsc").trim().toLowerCase();

function readForkRuntimeMeta() {
	const state = readEvmForkStateSync();
	const sourceNetwork = String(process.env.EVM_FORK_SOURCE_NETWORK || state?.sourceNetwork || "").trim().toLowerCase();
	const sourceChainIdRaw = process.env.EVM_FORK_SOURCE_CHAIN_ID ?? state?.sourceChainId;
	const sourceChainId = Number.isInteger(Number(sourceChainIdRaw)) ? Number(sourceChainIdRaw) : null;
	const sourceRpcUrl = String(process.env.EVM_FORK_SOURCE_RPC_URL || state?.sourceRpcUrl || "").trim();
	const blockNumberRaw = process.env.EVM_FORK_BLOCK_NUMBER ?? state?.blockNumber;
	const blockNumber = Number.isInteger(Number(blockNumberRaw)) ? Number(blockNumberRaw) : null;
	return {
		sourceNetwork,
		sourceChainId,
		sourceRpcUrl,
		blockNumber,
		state,
	};
}

export function normalizeEvmNetworkName(value) {
	const raw = String(value ?? "").trim().toLowerCase();
	if (!raw || raw === "default" || raw === "bsc") return "bsc";
	if (["eth", "mainnet", "ethereum"].includes(raw)) return "eth";
	if (["fork", "local", "hardhat"].includes(raw)) return "fork";
	throw new Error(`不支持的 EVM 网络: ${value ?? ""}`);
}

export function getEvmNetworkConfig(networkName) {
	const name = normalizeEvmNetworkName(networkName || defaultEvmNetworkName);
	const config = evmNetworks[name];
	if (!config) {
		throw new Error(`未找到 EVM 网络配置: ${name}`);
	}
	if (name !== "fork") {
		return config;
	}

	const runtime = readForkRuntimeMeta();
	const sourceConfig = runtime.sourceNetwork && runtime.sourceNetwork !== "fork"
		? evmNetworks[runtime.sourceNetwork]
		: null;
	const sourceChainId = runtime.sourceChainId ?? Number(sourceConfig?.chainId ?? 0) ?? null;

	return Object.freeze({
		...config,
		forkMode: true,
		forkSourceNetwork: runtime.sourceNetwork || null,
		forkSourceChainId: sourceChainId > 0 ? sourceChainId : null,
		forkSourceRpcUrl: runtime.sourceRpcUrl || String(sourceConfig?.rpc ?? "").trim(),
		forkBlockNumber: runtime.blockNumber,
		gasToken: sourceConfig?.gasToken ?? config.gasToken,
		explorerUrl: sourceConfig?.explorerUrl ?? config.explorerUrl,
		chainType: sourceConfig?.chainType ?? config.chainType,
	});
}

export function listEvmNetworks() {
	return Object.keys(evmNetworks);
}

