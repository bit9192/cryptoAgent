function normalizeHttpUrl(value, fallback) {
	const raw = String(value ?? "").trim();
	if (!raw) return fallback;
	if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, "");
	return `https://${raw}`.replace(/\/$/, "");
}

function normalizeGrpcEndpoint(value, fallback) {
	const raw = String(value ?? "").trim();
	if (!raw) return fallback;
	if (/^grpcs?:\/\//i.test(raw)) return raw.replace(/\/$/, "");
	return raw.replace(/\/$/, "");
}

export const trxNetworks = Object.freeze({
	mainnet: Object.freeze({
		networkName: "mainnet",
		chain: "trx",
		chainId: 728126428,
		rpcUrl: normalizeHttpUrl(process.env.TRX_MAINNET_RPC_URL, "https://api.trongrid.io"),
		grpcUrl: normalizeGrpcEndpoint(process.env.TRX_MAINNET_GRPC_URL, "grpc.trongrid.io:50051"),
		explorerUrl: normalizeHttpUrl(process.env.TRX_MAINNET_EXPLORER_URL, "https://tronscan.org"),
		apiKey: process.env.TRX_MAINNET_API_KEY || process.env.TRX_API_KEY || "",
		providerType: String(process.env.TRX_MAINNET_PROVIDER_TYPE || "trongrid").trim().toLowerCase(),
		isPublicTestnet: false,
		isMainnet: true,
		isLocal: false,
	}),
	nile: Object.freeze({
		networkName: "nile",
		chain: "trx",
		chainId: 3448148188,
		rpcUrl: normalizeHttpUrl(process.env.TRX_NILE_RPC_URL, "https://nile.trongrid.io"),
		grpcUrl: normalizeGrpcEndpoint(process.env.TRX_NILE_GRPC_URL, "grpc.nile.trongrid.io:50051"),
		explorerUrl: normalizeHttpUrl(process.env.TRX_NILE_EXPLORER_URL, "https://nile.tronscan.org"),
		apiKey: process.env.TRX_NILE_API_KEY || process.env.TRX_API_KEY || "",
		providerType: String(process.env.TRX_NILE_PROVIDER_TYPE || "trongrid").trim().toLowerCase(),
		isPublicTestnet: true,
		isMainnet: false,
		isLocal: false,
	}),
	shasta: Object.freeze({
		networkName: "shasta",
		chain: "trx",
		chainId: 2494104990,
		rpcUrl: normalizeHttpUrl(process.env.TRX_SHASTA_RPC_URL, "https://api.shasta.trongrid.io"),
		grpcUrl: normalizeGrpcEndpoint(process.env.TRX_SHASTA_GRPC_URL, "grpc.shasta.trongrid.io:50051"),
		explorerUrl: normalizeHttpUrl(process.env.TRX_SHASTA_EXPLORER_URL, "https://shasta.tronscan.org"),
		apiKey: process.env.TRX_SHASTA_API_KEY || process.env.TRX_API_KEY || "",
		providerType: String(process.env.TRX_SHASTA_PROVIDER_TYPE || "trongrid").trim().toLowerCase(),
		isPublicTestnet: true,
		isMainnet: false,
		isLocal: false,
	}),
	local: Object.freeze({
		networkName: "local",
		chain: "trx",
		chainId: Number(process.env.TRX_LOCAL_CHAIN_ID || 0),
		rpcUrl: normalizeHttpUrl(process.env.TRX_LOCAL_RPC_URL, "http://127.0.0.1:8090"),
		grpcUrl: normalizeGrpcEndpoint(process.env.TRX_LOCAL_GRPC_URL, "127.0.0.1:50051"),
		explorerUrl: normalizeHttpUrl(process.env.TRX_LOCAL_EXPLORER_URL, "http://127.0.0.1:8080"),
		apiKey: process.env.TRX_LOCAL_API_KEY || process.env.TRX_API_KEY || "",
		providerType: String(process.env.TRX_LOCAL_PROVIDER_TYPE || "trongrid").trim().toLowerCase(),
		isPublicTestnet: false,
		isMainnet: false,
		isLocal: true,
	}),
});

export const defaultTrxNetworkName = String(process.env.TRX_NETWORK || "mainnet").trim().toLowerCase();

export function normalizeTrxNetworkName(value) {
	const raw = String(value ?? "").trim().toLowerCase();
	if (raw === "" || raw === "main" || raw === "mainnet") return "mainnet";
	if (raw === "nile") return "nile";
	if (raw === "shasta" || raw === "sha") return "shasta";
	if (raw === "local" || raw === "dev") return "local";
	throw new Error(`不支持的 TRX 网络: ${value ?? ""}`);
}

export function getTrxNetworkConfig(networkName) {
	const target = normalizeTrxNetworkName(networkName || defaultTrxNetworkName);
	return trxNetworks[target];
}

