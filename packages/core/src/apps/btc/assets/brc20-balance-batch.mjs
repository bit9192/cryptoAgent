import { brc20BalanceGet } from "../brc20.mjs";

function normalizeBrc20BatchItems(input = []) {
	if (!Array.isArray(input)) {
		throw new Error("batch 输入必须是数组");
	}

	return input.map((item) => {
		const address = String(item?.address ?? "").trim();
		if (!address) {
			throw new Error("address 不能为空");
		}
		const token = String(item?.token ?? item?.tokenAddress ?? item?.ticker ?? "").trim();
		if (!token) {
			throw new Error("token 不能为空");
		}
		return {
			address,
			token,
		};
	});
}

export async function brc20BalanceBatchGet(input = [], networkNameOrProvider = null) {
	const items = normalizeBrc20BatchItems(input);
	if (items.length === 0) {
		return {
			ok: true,
			items: [],
		};
	}

	const rows = await Promise.all(items.map(async (item) => {
		try {
			const balance = await brc20BalanceGet({
				address: item.address,
				ticker: item.token,
			}, networkNameOrProvider);
			return {
				...balance,
				ok: true,
				error: null,
			};
		} catch (error) {
			return {
				chain: "btc",
				type: "brc20",
				address: item.address,
				tokenAddress: String(item.token).trim().toUpperCase(),
				symbol: String(item.token).trim().toUpperCase(),
				decimals: null,
				balance: null,
				availableBalance: null,
				transferableBalance: null,
				transferableCount: null,
				networkName: null,
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
	brc20BalanceBatchGet,
};
