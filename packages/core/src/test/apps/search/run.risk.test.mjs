import { createDefaultSearchEngine } from "../../../apps/search/engine.mjs";

// Usage:
//   node src/test/apps/search/run.risk.test.mjs <tokenAddress> <chain> [network]
//
// Examples:
//   node src/test/apps/search/run.risk.test.mjs 0xdac17f958d2ee523a2206206994597c13d831ec7 evm eth
//   node src/test/apps/search/run.risk.test.mjs 0x55d398326f99059ff775485246999027b3197955 evm bsc
//   node src/test/apps/search/run.risk.test.mjs TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t trx mainnet

const DEFAULTS = {
	tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
	chain: "evm",
	network: "eth",
};

async function main() {
	const tokenAddress = String(process.argv[2] ?? DEFAULTS.tokenAddress).trim();
	const chain = String(process.argv[3] ?? DEFAULTS.chain).trim();
	const network = String(process.argv[4] ?? DEFAULTS.network).trim();

	const engine = createDefaultSearchEngine();

	console.log("=== apps/search engine.token.risk ===");
	console.log(`tokenAddress=${tokenAddress}`);
	console.log(`chain=${chain}`);
	console.log(`network=${network}`);
	console.log("");

	const result = await engine.token.risk({ tokenAddress, chain, network });

	console.log(`ok=${result.ok}`);
	console.log(`notSupported=${result.notSupported}`);
	console.log(`riskLevel=${result.riskLevel}`);
	console.log(`riskScore=${result.riskScore}`);
	console.log(`riskFlags=${JSON.stringify(result.riskFlags)}`);
	console.log("");
	console.log("sources:");
	for (const src of Array.isArray(result.sources) ? result.sources : []) {
		const reason = src.reason ? ` (${src.reason})` : "";
		console.log(`  [${src.name}] status=${src.status} level=${src.level} score=${src.score} flags=${src.flagsCount}${reason}`);
	}
}

main().catch((error) => {
	console.error(error?.stack ?? error?.message ?? String(error));
	process.exitCode = 1;
});
