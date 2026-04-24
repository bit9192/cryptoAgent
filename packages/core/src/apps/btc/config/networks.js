import "../../../load-env.mjs";
import path from "node:path";

function normalizeBaseUrl(value, fallbackHost = "127.0.0.1") {
	const raw = String(value ?? "").trim();
	if (!raw) {
		return `http://${fallbackHost}`;
	}
	if (/^https?:\/\//i.test(raw)) {
		return raw;
	}
	return `http://${raw}`;
}

function buildRpcUrl(baseUrl, port) {
	const url = new URL(baseUrl);
	url.port = String(port);
	return url.toString().replace(/\/$/, "");
}

function normalizeProviderType(value, fallback = "bitcoind") {
	const raw = String(value ?? fallback).trim().toLowerCase();
	if (raw === "" || raw === "bitcoind" || raw === "bitcoin-core" || raw === "core") {
		return "bitcoind";
	}
	if (raw === "mempool" || raw === "mempool.space") {
		return "mempool";
	}
	if (raw === "blockbook" || raw === "trezor") {
		return "blockbook";
	}
	if (raw === "blockchair") {
		return "blockchair";
	}
	throw new Error(`不支持的 BTC provider 类型: ${value ?? ""}`);
}

function buildRestUrl(restEnvValue, rpcEnvValue, port) {
	const raw = String(restEnvValue ?? rpcEnvValue ?? "").trim();
	if (!raw) {
		return buildRpcUrl(normalizeBaseUrl(rpcEnvValue), port);
	}

	const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
	try {
		const url = new URL(normalized);
		const isLocal =
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "0.0.0.0" ||
			url.hostname === "" ||
			url.hostname.startsWith("192.168.") ||
			url.hostname.startsWith("10.");

		if (isLocal) {
			return buildRpcUrl(normalizeBaseUrl(raw), port);
		}

		return normalized.replace(/\/+$/, "");
	} catch {
		return buildRpcUrl(normalizeBaseUrl(raw), port);
	}
}

const defaultRegtestDataDir = path.resolve(process.cwd(), "key/tmp/btc-regtest");

export const btcNetworks = Object.freeze({
	mainnet: Object.freeze({
		networkName: "mainnet",
		chain: "btc",
		addressFormat: "mixed",
		rpcPort: Number(process.env.BTC_MAINNET_RPC_PORT || 8332),
		rpcUrl: buildRpcUrl(normalizeBaseUrl(process.env.BTC_MAINNET_RPC_URL), Number(process.env.BTC_MAINNET_RPC_PORT || 8332)),
		rpcUsername: process.env.BTC_MAINNET_RPC_USERNAME || "btc",
		rpcPassword: process.env.BTC_MAINNET_RPC_PASSWORD || "btcpass",
		walletName: process.env.BTC_MAINNET_WALLET || "main",
		dataDir: path.resolve(process.env.BTC_MAINNET_DATA_DIR || path.join(defaultRegtestDataDir, "../btc-mainnet")),
		restUrl: buildRestUrl(process.env.BTC_MAINNET_REST_URL, process.env.BTC_MAINNET_RPC_URL, Number(process.env.BTC_MAINNET_RPC_PORT || 8332)),
		explorerUrl: process.env.BTC_MAINNET_EXPLORER_URL || "https://mempool.space",
		isPublicTestnet: false,
		providerType: normalizeProviderType(process.env.BTC_MAINNET_PROVIDER_TYPE || "bitcoind"),
		apiKey: process.env.BTC_MAINNET_REST_KEY || process.env.BTC_MAINNET_API_KEY || "",
		isMainnet: true,
		isLocal: false,
	}),
	testnet: Object.freeze({
		networkName: "testnet",
		chain: "btc",
		addressFormat: "mixed",
		rpcPort: Number(process.env.BTC_TESTNET_RPC_PORT || 18332),
		rpcUrl: buildRpcUrl(normalizeBaseUrl(process.env.BTC_TESTNET_RPC_URL), Number(process.env.BTC_TESTNET_RPC_PORT || 18332)),
		rpcUsername: process.env.BTC_TESTNET_RPC_USERNAME || "btc",
		rpcPassword: process.env.BTC_TESTNET_RPC_PASSWORD || "btcpass",
		walletName: process.env.BTC_TESTNET_WALLET || "test",
		dataDir: path.resolve(process.env.BTC_TESTNET_DATA_DIR || path.join(defaultRegtestDataDir, "../btc-testnet")),
		restUrl: buildRestUrl(process.env.BTC_TESTNET_REST_URL || process.env.BTC_MAINNET_REST_URL, process.env.BTC_TESTNET_RPC_URL, Number(process.env.BTC_TESTNET_RPC_PORT || 18332)),
		explorerUrl: process.env.BTC_TESTNET_EXPLORER_URL || "https://mempool.space/testnet",
		isPublicTestnet: true,
		providerType: normalizeProviderType(process.env.BTC_TESTNET_PROVIDER_TYPE || "bitcoind"),
		apiKey: process.env.BTC_TESTNET_REST_KEY || process.env.BTC_TESTNET_API_KEY || process.env.BTC_MAINNET_REST_KEY || process.env.BTC_MAINNET_API_KEY || "",
		isMainnet: false,
		isLocal: false,
	}),
	signet: Object.freeze({
		networkName: "signet",
		chain: "btc",
		addressFormat: "mixed",
		rpcPort: Number(process.env.BTC_SIGNET_RPC_PORT || 38332),
		rpcUrl: buildRpcUrl(normalizeBaseUrl(process.env.BTC_SIGNET_RPC_URL), Number(process.env.BTC_SIGNET_RPC_PORT || 38332)),
		rpcUsername: process.env.BTC_SIGNET_RPC_USERNAME || "btc",
		rpcPassword: process.env.BTC_SIGNET_RPC_PASSWORD || "btcpass",
		walletName: process.env.BTC_SIGNET_WALLET || "signet",
		dataDir: path.resolve(process.env.BTC_SIGNET_DATA_DIR || path.join(defaultRegtestDataDir, "../btc-signet")),
		restUrl: buildRestUrl(process.env.BTC_SIGNET_REST_URL || process.env.BTC_MAINNET_REST_URL, process.env.BTC_SIGNET_RPC_URL, Number(process.env.BTC_SIGNET_RPC_PORT || 38332)),
		explorerUrl: process.env.BTC_SIGNET_EXPLORER_URL || "https://mempool.space/signet",
		isPublicTestnet: true,
		providerType: normalizeProviderType(process.env.BTC_SIGNET_PROVIDER_TYPE || "bitcoind"),
		apiKey: process.env.BTC_SIGNET_REST_KEY || process.env.BTC_SIGNET_API_KEY || process.env.BTC_MAINNET_REST_KEY || process.env.BTC_MAINNET_API_KEY || "",
		isMainnet: false,
		isLocal: false,
	}),
	regtest: Object.freeze({
		networkName: "regtest",
		chain: "btc",
		addressFormat: "mixed",
		rpcPort: Number(process.env.BTC_REGTEST_RPC_PORT || 18_443),
		rpcUrl: buildRpcUrl(normalizeBaseUrl(process.env.BTC_REGTEST_RPC_URL), Number(process.env.BTC_REGTEST_RPC_PORT || 18443)),
		rpcUsername: process.env.BTC_REGTEST_RPC_USERNAME || "btc",
		rpcPassword: process.env.BTC_REGTEST_RPC_PASSWORD || "btcpass",
		walletName: process.env.BTC_REGTEST_WALLET || "regtest-dev",
		dataDir: path.resolve(process.env.BTC_REGTEST_DATA_DIR || defaultRegtestDataDir),
		restUrl: buildRestUrl(process.env.BTC_REGTEST_REST_URL, process.env.BTC_REGTEST_RPC_URL, Number(process.env.BTC_REGTEST_RPC_PORT || 18443)),
		explorerUrl: process.env.BTC_REGTEST_EXPLORER_URL || "",
		isPublicTestnet: false,
		providerType: normalizeProviderType(process.env.BTC_REGTEST_PROVIDER_TYPE || "bitcoind"),
		apiKey: process.env.BTC_REGTEST_REST_KEY || process.env.BTC_REGTEST_API_KEY || "",
		isMainnet: false,
		isLocal: true,
	}),
});

export const defaultBtcNetworkName = String(process.env.BTC_NETWORK || "regtest").trim().toLowerCase();

export function normalizeBtcNetworkName(value) {
	const raw = String(value ?? "").trim().toLowerCase();
	if (raw === "" || raw === "regtest") return "regtest";
	if (raw === "main" || raw === "mainnet") return "mainnet";
	if (raw === "test" || raw === "testnet") return "testnet";
	if (raw === "sig" || raw === "signet") return "signet";
	throw new Error(`不支持的 BTC 网络: ${value ?? ""}`);
}

export function getBtcNetworkConfig(networkName) {
	const target = normalizeBtcNetworkName(networkName || defaultBtcNetworkName);
	return btcNetworks[target];
}

