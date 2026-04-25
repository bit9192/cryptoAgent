import {
	searchTradePairs,
	getTokenTradeSummary,
} from "../../../../../apps/evm/search/trade-provider.mjs";

// Edit inputs here before running:
// node src/test/apps/evm/search/trade-search/run.test.mjs

const tokenAddress = "0xF89712b7C0b6136E1436a8c4E3f4B9C1a1276dfC";

const options = {
	// If offchain sources return empty, enable onchain pair probing by configured dex factories.
	enableOnchainFallback: true,
};

const inputs = {
	searchTradePairs: {
		tokenAddress,
		network: "bsc",
		limit: 5,
	},
	getTokenTradeSummary: {
		tokenAddress,
		network: "bsc",
		limit: 10,
	},
};

async function main() {
	const pairItems = await searchTradePairs(inputs.searchTradePairs, options);
	const summary = await getTokenTradeSummary(inputs.getTokenTradeSummary, options);

	const output = {
		input: inputs,
		options,
		output: {
			searchTradePairs: {
				type: "TradeItem[]",
				count: Array.isArray(pairItems) ? pairItems.length : 0,
				firstItem: Array.isArray(pairItems) && pairItems.length > 0 ? pairItems[0] : null,
			},
			getTokenTradeSummary: {
				type: "TradeSummary",
				data: summary,
			},
		},
	};

	console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
	console.error("trade-search run.test failed:", error?.message || error);
	process.exitCode = 1;
});
