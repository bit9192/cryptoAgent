import {
	queryAddressCheckBatch,
	queryAddressBalance,
} from "../../../../../apps/evm/search/address-search.mjs";

// Edit inputs here before running:
// node src/test/apps/evm/search/address-search/run.test.mjs

const ownerA = "0x2Fcf9b5fe203d1C5AeD0eD996D9a17Ce51690da5";
const ownerB = "0xc353950E65Ad19D4FC57Ce655Be474831ADC26Cc";

const network = "bsc";

const options = {
	// For production usage, keep this empty and use your configured rpc/network.
	// You can inject custom hooks if needed:
	// addressTypeResolver: async ({ address, network }) => "eoa",
	// assetListResolver: async ({ address, network, addressType }) => [],
	// queryBalanceBatch: async (pairs, callOptions) => ({ ok: true, items: [] }),
};

const inputs = {
	queryAddressCheckBatch: [
		{
			address: ownerA,
			network,
		},
		{
			address: ownerB,
			network,
		},
	],
};

function normalizeLower(value) {
	return String(value ?? "").trim().toLowerCase();
}

function toBigIntSafe(value) {
	if (typeof value === "bigint") return value;
	if (value == null) return 0n;
	try {
		return BigInt(value);
	} catch {
		return 0n;
	}
}

function shortAddress(address) {
	const text = String(address ?? "");
	if (text.length <= 12) return text;
	return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function printReport(checkItems = [], balanceItems = []) {
	const balanceMap = new Map();
	for (const row of balanceItems) {
		balanceMap.set(normalizeLower(row?.address), row);
	}

	console.log("\n=== Address Portfolio Report ===");
	console.log(`Network: ${network}`);
	console.log(`Addresses: ${checkItems.length}`);

	for (const row of checkItems) {
		const addr = row?.address;
		const balanceRow = balanceMap.get(normalizeLower(addr)) ?? { balances: [] };
		const balances = Array.isArray(balanceRow.balances) ? balanceRow.balances : [];
		const nonZero = balances.filter((item) => toBigIntSafe(item?.rawBalance) !== 0n);

		console.log("\n----------------------------------------");
		console.log(`Address: ${addr}`);
		console.log(`Type: ${row?.addressType ?? "unknown"}`);
		console.log(`Discovered Assets: ${Array.isArray(row?.assets) ? row.assets.length : 0}`);
		console.log(`Non-zero Balances: ${nonZero.length}`);

		const displayItems = nonZero.slice(0, 12);
		if (displayItems.length === 0) {
			console.log("- (all zero)");
			continue;
		}

		for (const item of displayItems) {
			const symbol = String(item?.symbol ?? "").trim() || shortAddress(item?.address);
			console.log(`- ${symbol}: ${item?.formatted ?? "0"}`);
		}

		if (nonZero.length > displayItems.length) {
			console.log(`- ... and ${nonZero.length - displayItems.length} more non-zero assets`);
		}
	}
}

async function main() {
	console.log("Running: queryAddressCheckBatch -> queryAddressBalance\n");

	const checkRes = await queryAddressCheckBatch(inputs.queryAddressCheckBatch, options);
	const checkItems = Array.isArray(checkRes?.items) ? checkRes.items : [];

	const balanceInput = checkItems.map((row) => ({
		address: row.address,
		network: row.network,
		assets: Array.isArray(row.assets) ? row.assets : [],
	}));
	const balanceRes = await queryAddressBalance(balanceInput, options);
	const balanceItems = Array.isArray(balanceRes?.items) ? balanceRes.items : [];

	printReport(checkItems, balanceItems);
}

main().catch((error) => {
	console.error("address-search run.test failed:", error?.message || error);
	process.exitCode = 1;
});
