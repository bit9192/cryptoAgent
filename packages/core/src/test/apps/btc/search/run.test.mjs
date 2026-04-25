import { createBtcTokenSearchProvider } from "../../../../apps/btc/search/token-provider.mjs";
import { createBtcAddressSearchProvider } from "../../../../apps/btc/search/address-provider.mjs";
import { createBtcTradeSearchProvider } from "../../../../apps/btc/search/trade-provider.mjs";

// Edit inputs here before running:
// node src/test/apps/btc/search/run.test.mjs

const inputs = {
	searchToken: {
		query: "ordi",
		network: "mainnet",
	},
	searchTrade: {
		query: "ordi", // BRC20 ticker，大小写不敏感
		network: "mainnet",
	},
	searchAddress: {
		// P2TR (Taproot) — 支持 native + BRC20
		query: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6",
		network: "mainnet", // 留空则自动从地址前缀推断
	},
};

async function main() {
	const tokenProvider = createBtcTokenSearchProvider();
	const addressProvider = createBtcAddressSearchProvider();
	const tradeProvider = createBtcTradeSearchProvider();

	const [tokenItems, addressItems, tradeItems] = await Promise.all([
		tokenProvider.searchToken(inputs.searchToken),
		addressProvider.searchAddress(inputs.searchAddress),
		tradeProvider.searchTrade(inputs.searchTrade),
	]);

	const output = {
		input: inputs,
		output: {
			searchToken: {
				type: "SearchItem[]",
				count: Array.isArray(tokenItems) ? tokenItems.length : 0,
				firstItem: Array.isArray(tokenItems) && tokenItems.length > 0 ? tokenItems[0] : null,
			},
			searchTrade: {
				type: "TradeItem[]",
				count: Array.isArray(tradeItems) ? tradeItems.length : 0,
				// 有 BESTINSLOT_API_KEY 时 source=bestinslot，否则 source=coinpaprika（仅主流 token）
				firstItem: Array.isArray(tradeItems) && tradeItems.length > 0 ? tradeItems[0] : null,
			},
			searchAddress: {
				type: "SearchItem[]",
				count: Array.isArray(addressItems) ? addressItems.length : 0,
				items: addressItems,
			},
		},
	};

	console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
	console.error("btc-search run.test failed:", error?.message || error);
	process.exitCode = 1;
});
