import { resolveTrxToken } from "./config/tokens.js";
import { resolveTrxNetProvider } from "./netprovider.mjs";
import { toTrxBase58Address, toTrxHexAddress } from "./address-codec.mjs";
import { createTrc20 } from "./send.mjs";

const NATIVE_TOKEN_ADDRESS = "native";

function normalizeAddress(value, label) {
	const raw = String(value ?? "").trim();
	if (!raw) {
		throw new Error(`${label} 不能为空`);
	}
	return toTrxBase58Address(raw);
}

function normalizeTokenRef(token, options = {}) {
	const raw = String(token ?? "").trim();
	if (!raw) {
		throw new Error("token 不能为空");
	}
	if (raw.toLowerCase() === NATIVE_TOKEN_ADDRESS) {
		return NATIVE_TOKEN_ADDRESS;
	}

	try {
		return toTrxBase58Address(raw);
	} catch {
		const networkName = String(options.networkName ?? options.network ?? "mainnet").trim().toLowerCase() || "mainnet";
		const tokenMeta = resolveTrxToken({
			network: networkName,
			key: raw,
		});
		return toTrxBase58Address(tokenMeta.address);
	}
}

function resolveCallerAddress(options = {}, fallbackAddress) {
	const candidate = String(options.callerAddress ?? options.ownerAddress ?? fallbackAddress ?? "").trim();
	if (!candidate) {
		throw new Error("缺少 callerAddress（可传 callerAddress/ownerAddress/address）");
	}
	return toTrxBase58Address(candidate);
}

function createReadonlySigner(address) {
	return {
		async getAddress() {
			return address;
		},
	};
}

async function queryNativeSunBalance(address, provider) {
	const account = await provider.walletCall("getaccount", {
		address: toTrxHexAddress(address),
		visible: false,
	});
	const sun = Number(account?.balance ?? 0);
	return BigInt(Number.isFinite(sun) ? Math.max(0, Math.floor(sun)) : 0);
}

function ensureBatchArray(input = []) {
	if (!Array.isArray(input)) {
		throw new Error("batch 输入必须是数组");
	}

	return input;
}

export async function queryTrxTokenMetadata(input = {}) {
	const provider = resolveTrxNetProvider(input.networkNameOrProvider ?? input.netProvider ?? input.networkName ?? input.network ?? null);
	const tokenAddress = normalizeTokenRef(input.token ?? input.tokenAddress, {
		networkName: provider.networkName,
	});

	if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
		return {
			chain: "trx",
			tokenAddress: NATIVE_TOKEN_ADDRESS,
			name: "TRON",
			symbol: "TRX",
			decimals: 6,
		};
	}

	const callerAddress = resolveCallerAddress(input, tokenAddress);
	const token = createTrc20({
		address: tokenAddress,
		networkNameOrProvider: provider,
		signer: createReadonlySigner(callerAddress),
	});
	const [nameRaw, symbolRaw, decimalsRaw] = await Promise.all([
		token.name(),
		token.symbol(),
		token.decimals(),
	]);

	return {
		chain: "trx",
		tokenAddress,
		name: String(nameRaw ?? "").trim() || null,
		symbol: String(symbolRaw ?? "").trim() || null,
		decimals: Number(decimalsRaw),
	};
}

export async function queryTrxTokenMetadataBatch(items = [], options = {}) {
	const batch = ensureBatchArray(items);
	if (batch.length === 0) {
		return {
			ok: true,
			items: [],
		};
	}

	const provider = resolveTrxNetProvider(options.networkNameOrProvider ?? options.netProvider ?? options.networkName ?? options.network ?? null);
	const rows = await Promise.all(batch.map(async (item) => {
		try {
			const meta = await queryTrxTokenMetadata({
				...options,
				networkNameOrProvider: provider,
				tokenAddress: item?.token ?? item?.tokenAddress ?? item,
			});
			return {
				...meta,
				ok: true,
				error: null,
			};
		} catch (error) {
			return {
				chain: "trx",
				tokenAddress: String(item?.token ?? item?.tokenAddress ?? item ?? "").trim() || null,
				name: null,
				symbol: null,
				decimals: null,
				ok: false,
				error: error?.message ?? String(error),
			};
		}
	}));

	return {
		ok: true,
		items: rows,
	};
}

export async function queryTrxTokenBalance(input = {}) {
	const provider = resolveTrxNetProvider(input.networkNameOrProvider ?? input.netProvider ?? input.networkName ?? input.network ?? null);
	const ownerAddress = normalizeAddress(input.ownerAddress ?? input.address, "ownerAddress");
	const tokenAddress = normalizeTokenRef(input.token ?? input.tokenAddress, {
		networkName: provider.networkName,
	});

	if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
		const balance = await queryNativeSunBalance(ownerAddress, provider);
		return {
			chain: "trx",
			ownerAddress,
			tokenAddress,
			balance,
		};
	}

	const callerAddress = resolveCallerAddress(input, ownerAddress);
	const token = createTrc20({
		address: tokenAddress,
		networkNameOrProvider: provider,
		signer: createReadonlySigner(callerAddress),
	});
	const raw = await token.balanceOf(ownerAddress);
	return {
		chain: "trx",
		ownerAddress,
		tokenAddress,
		balance: raw,
	};
}

export async function queryTrxTokenBalanceBatch(input = [], options = {}) {
	const batch = ensureBatchArray(input);
	if (batch.length === 0) {
		return {
			ok: true,
			items: [],
		};
	}

	const provider = resolveTrxNetProvider(options.networkNameOrProvider ?? options.netProvider ?? options.networkName ?? options.network ?? null);
	const rows = await Promise.all(batch.map(async (item) => {
		try {
			const balance = await queryTrxTokenBalance({
				...options,
				networkNameOrProvider: provider,
				address: item?.address,
				token: item?.token,
			});
			return {
				...balance,
				ok: true,
				error: null,
			};
		} catch (error) {
			return {
				chain: "trx",
				ownerAddress: String(item?.address ?? "").trim() || null,
				tokenAddress: String(item?.token ?? "").trim() || null,
				balance: null,
				ok: false,
				error: error?.message ?? String(error),
			};
		}
	}));

	return {
		ok: true,
		items: rows,
	};
}

export default {
	queryTrxTokenMetadata,
	queryTrxTokenMetadataBatch,
	queryTrxTokenBalance,
	queryTrxTokenBalanceBatch,
};
