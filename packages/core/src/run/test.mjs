import { searchToken, tokenRiskCheck } from "../apps/evm/search/token-provider.mjs";

// Edit inputs here before running: node src/run/test.mjs
const tokenaddress = "0xfc69c8a4192130f5d3295876bec43f22704df1e2"
const inputs = {
	searchToken: {
		query: tokenaddress, //"crv",
		// query: "crv", //"crv",
		network: "bsc",
		limit: 5,
        count: 10
	},
	tokenRiskCheck: {
		chain: "evm",
		network: "bsc",
		tokenAddress: tokenaddress,
		// tokenAddress: "0x8aa688AB789d1848d131C65D98CEAA8875D97eF1",
	},
};

async function main() {
	const tokenItems = await searchToken(inputs.searchToken);
	const risk = await tokenRiskCheck(inputs.tokenRiskCheck);
    console.log(
        tokenItems
    )
	const output = {
		input: inputs,
		output: {
			searchToken: {
				type: "SearchItem[]",
				count: Array.isArray(tokenItems) ? tokenItems.length : 0,
				firstItem: Array.isArray(tokenItems) && tokenItems.length > 0 ? tokenItems[0] : null,
			},
			tokenRiskCheck: {
				type: "RiskSummary",
				data: risk,
			},
		},
	};

	console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
	console.error("run/test failed:", error?.message || error);
	process.exitCode = 1;
});
