import { resolveTrxToken } from "../config/tokens.js";
import { resolveTrxNetProvider } from "../netprovider.mjs";
import { toTrxBase58Address } from "../address-codec.mjs";
import { createTrc20 } from "../send.mjs";
import { queryTrxMulticall } from "../multicall.mjs";
import { Interface } from "ethers";

export const NATIVE_TOKEN_ADDRESS = "native";

const TRC20_METADATA_ABI = new Interface([
	"function name() view returns (string)",
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
]);

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
	const rows = await tryQueryTrxTokenMetadataBatchViaMulticall(batch, provider, options);
	if (rows) {
		return {
			ok: true,
			items: rows,
		};
	}

	const fallbackRows = await Promise.all(batch.map(async (item) => {
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
		items: fallbackRows,
	};
}

async function tryQueryTrxTokenMetadataBatchViaMulticall(batch = [], provider, options = {}) {
	if (options.multicall === false) {
		return null;
	}

	const output = Array.from({ length: batch.length }, () => null);
	const requests = [];
	const positions = [];
	const fallbackIndexes = [];

	for (const [index, item] of batch.entries()) {
		try {
			const tokenAddress = normalizeTokenRef(item?.token ?? item?.tokenAddress ?? item, {
				networkName: provider.networkName,
			});

			if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
				output[index] = {
					chain: "trx",
					tokenAddress,
					name: "TRON",
					symbol: "TRX",
					decimals: 6,
					ok: true,
					error: null,
				};
				continue;
			}

			positions.push({ index, tokenAddress });
			for (const method of ["name", "symbol", "decimals"]) {
				requests.push({
					targetAddress: tokenAddress,
					iface: TRC20_METADATA_ABI,
					method,
					args: [],
				});
			}
		} catch (error) {
			output[index] = {
				chain: "trx",
				tokenAddress: String(item?.token ?? item?.tokenAddress ?? item ?? "").trim() || null,
				name: null,
				symbol: null,
				decimals: null,
				ok: false,
				error: error?.message ?? String(error),
			};
		}
	}

	if (requests.length === 0) {
		return output;
	}

	const multicall = await queryTrxMulticall(requests, {
		networkNameOrProvider: provider,
		callerAddress: options.callerAddress ?? options.ownerAddress ?? undefined,
		multicallAddress: options.multicallAddress,
		multicall: options.multicall,
	});

	if (!multicall.ok) {
		return null;
	}

	for (let tokenIndex = 0; tokenIndex < positions.length; tokenIndex += 1) {
		const { index, tokenAddress } = positions[tokenIndex];
		const nameRow = multicall.items[tokenIndex * 3];
		const symbolRow = multicall.items[tokenIndex * 3 + 1];
		const decimalsRow = multicall.items[tokenIndex * 3 + 2];

		if (!nameRow?.ok || !symbolRow?.ok || !decimalsRow?.ok) {
			fallbackIndexes.push(index);
			continue;
		}

		output[index] = {
			chain: "trx",
			tokenAddress,
			name: String(nameRow.value ?? "").trim() || null,
			symbol: String(symbolRow.value ?? "").trim() || null,
			decimals: Number(decimalsRow.value),
			ok: true,
			error: null,
		};
	}

	if (fallbackIndexes.length > 0) {
		const fallbackRows = await Promise.all(fallbackIndexes.map(async (index) => {
			try {
				const meta = await queryTrxTokenMetadata({
					...options,
					networkNameOrProvider: provider,
					tokenAddress: batch[index]?.token ?? batch[index]?.tokenAddress ?? batch[index],
				});
				return {
					index,
					row: {
						...meta,
						ok: true,
						error: null,
					},
				};
			} catch (error) {
				return {
					index,
					row: {
						chain: "trx",
						tokenAddress: String(batch[index]?.token ?? batch[index]?.tokenAddress ?? batch[index] ?? "").trim() || null,
						name: null,
						symbol: null,
						decimals: null,
						ok: false,
						error: error?.message ?? String(error),
					},
				};
			}
		}));

		for (const item of fallbackRows) {
			output[item.index] = item.row;
		}
	}

	return output;
}

export default {
	queryTrxTokenMetadata,
	queryTrxTokenMetadataBatch,
};
