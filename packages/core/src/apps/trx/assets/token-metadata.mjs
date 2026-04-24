import { resolveTrxToken } from "../config/tokens.js";
import { resolveTrxNetProvider } from "../netprovider.mjs";
import { toTrxBase58Address } from "../address-codec.mjs";
import { createTrc20 } from "../send.mjs";

export const NATIVE_TOKEN_ADDRESS = "native";

function ensureBatchArray(input = []) {
	if (!Array.isArray(input)) {
		throw new Error("batch 输入必须是数组");
	}
	return input;
}

export function normalizeTokenRef(token, options = {}) {
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

export function resolveCallerAddress(options = {}, fallbackAddress) {
	const candidate = String(options.callerAddress ?? options.ownerAddress ?? fallbackAddress ?? "").trim();
	if (!candidate) {
		throw new Error("缺少 callerAddress（可传 callerAddress/ownerAddress/address）");
	}
	return toTrxBase58Address(candidate);
}

export function createReadonlySigner(address) {
	return {
		async getAddress() {
			return address;
		},
	};
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

export default {
	queryTrxTokenMetadata,
	queryTrxTokenMetadataBatch,
};
