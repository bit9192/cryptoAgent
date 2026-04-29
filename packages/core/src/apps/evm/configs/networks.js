import "../../../load-env.mjs";
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

const DEFULE = Object.values(evmNetworks).filter(v => v.network !== "fork").map(v => v.network)
export const evmNetworkScopeMap = Object.freeze({
	mainnet: DEFULE,
	testnet: "fork",
	fork: "fork",
	default: DEFULE,
});

function listEvmNetworkEntries() {
	return Object.entries(evmNetworks);
}

function listMainnetNetworkNames() {
	return listEvmNetworkEntries()
		.filter(([, config]) => Boolean(config?.isMainnet))
		.map(([name]) => name);
}

function resolvePrimaryMainnetNetwork() {
	const mainnets = listMainnetNetworkNames();
	if (mainnets.length > 0) return mainnets[0];
	const all = listEvmNetworks();
	if (all.length > 0) return all[0];
	return "bsc";
}

function normalizeMappedNetworks(value) {
	const values = Array.isArray(value) ? value : [value];
	return values
		.map((item) => String(item ?? "").trim().toLowerCase())
		.filter((item) => item && item in evmNetworks);
}

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
	if (!raw) return resolvePrimaryMainnetNetwork();
	if (raw in evmNetworks) return raw;
	if (raw in evmNetworkScopeMap) {
		const mapped = evmNetworkScopeMap[raw];
		if (Array.isArray(mapped)) {
			const list = normalizeMappedNetworks(mapped);
			return list[0] ?? resolvePrimaryMainnetNetwork();
		}
		return mapped;
	}
	if (raw === "ethereum") return "eth";
	if (["fork", "local", "hardhat"].includes(raw)) return "fork";
	throw new Error(`不支持的 EVM 网络: ${value ?? ""}`);
}

export function normalizeEvmNetworkScope(scope) {
	const raw = String(scope ?? "default").trim().toLowerCase();
	if (!raw || raw === "default") return "mainnet";
	if (raw === "mainnet") return "mainnet";
	if (raw in evmNetworkScopeMap) {
		const mapped = evmNetworkScopeMap[raw];
		if (Array.isArray(mapped)) return "mainnet";
		return mapped;
	}
	throw new Error(`不支持的 EVM scope: ${scope ?? ""}`);
}

export function listEvmNetworksByScope(scope = "default") {
	const normalizedScope = normalizeEvmNetworkScope(scope);
	if (normalizedScope === "mainnet") {
		const fromMap = normalizeMappedNetworks(evmNetworkScopeMap.mainnet);
		if (fromMap.length > 0) return fromMap;
		return listMainnetNetworkNames();
	}
	if (normalizedScope in evmNetworks) return [normalizedScope];
	return [];
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

