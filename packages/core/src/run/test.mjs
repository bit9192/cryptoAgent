import { queryEvmTokenMetadataBatch } from "../apps/evm/assets/token-metadata.mjs";

function normalizeString(value) {
	return String(value ?? "").trim();
}

function parseTokenAddresses(args = {}) {
	if (Array.isArray(args.tokens)) {
		return args.tokens.map((v) => normalizeString(v)).filter(Boolean);
	}

	if (typeof args.tokens === "string") {
		return args.tokens
			.split(/[\s,]+/)
			.map((v) => normalizeString(v))
			.filter(Boolean);
	}

	if (typeof args.token === "string") {
		const one = normalizeString(args.token);
		return one ? [one] : [];
	}

	return [];
}

export async function run({ args = {} } = {}) {
	// const network = normalizeString(args.network) || "bsc";
	// const tokenAddresses = parseTokenAddresses(args);

    // console.log(
    //     args
    // )

	// if (tokenAddresses.length === 0) {
	// 	return {
	// 		ok: false,
	// 		message: "未提供 token 地址。请传 args.tokens（数组或逗号分隔字符串）",
	// 		usage: {
	// 			tokensArray: "--tokens '[\"0x...\",\"0x...\"]'",
	// 			tokensCsv: "--tokens '0x...,0x...'",
	// 			network: "--network bsc",
	// 		},
	// 	};
	// }
    // ["0x8965349fb649A33a30cbFDa057D8eC2C48AbE2A2", "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3"]
    const tokenAddresses = ["0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0", "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3"]
    const network = "bsc"
	const items = tokenAddresses.map((token) => ({ token }));
	const res = await queryEvmTokenMetadataBatch(items, { network });

	const tableRows = (res.items ?? []).map((item) => ({
		tokenAddress: item.tokenAddress,
		symbol: item.symbol,
		name: item.name,
		decimals: item.decimals,
	}));

	console.log(`[test.multicall] network=${network} tokens=${tokenAddresses.length}`);
	console.table(tableRows);

	return {
		ok: true,
		action: "test.multicall.token-metadata",
		network,
		inputCount: tokenAddresses.length,
		items: res.items ?? [],
	};
}

export default {
	run,
};
