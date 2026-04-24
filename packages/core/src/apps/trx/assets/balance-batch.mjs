import { resolveTrxNetProvider } from "../netprovider.mjs";
import { toTrxBase58Address, toTrxHexAddress } from "../address-codec.mjs";
import { createTrc20 } from "../send.mjs";
import {
	NATIVE_TOKEN_ADDRESS,
	normalizeTokenRef,
	resolveCallerAddress,
	createReadonlySigner,
} from "./token-metadata.mjs";

function normalizeAddress(value, label) {
	const raw = String(value ?? "").trim();
	if (!raw) {
		throw new Error(`${label} 不能为空`);
	}
	return toTrxBase58Address(raw);
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
	queryTrxTokenBalance,
	queryTrxTokenBalanceBatch,
};
