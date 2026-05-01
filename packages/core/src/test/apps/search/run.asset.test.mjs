import { readFileSync } from "node:fs";

import { createDefaultSearchEngine } from "../../../apps/search/engine.mjs";

function parseAddressList(text) {
	const lines = String(text ?? "").split(/\r?\n/);
	const addresses = [];
	let inAddresses = false;

	for (const raw of lines) {
		const line = raw.trim();
		if (line === "# addresses") {
			inAddresses = true;
			continue;
		}
		if (!inAddresses) continue;
		if (!line) continue;
		if (line.startsWith("## ") || line.startsWith("# ")) {
			inAddresses = false;
			continue;
		}
		if (line.startsWith("-")) {
			addresses.push(line.slice(1).trim());
		} else {
			addresses.push(line);
		}
	}

	return addresses.filter(Boolean);
}

function resolveBalance(item) {
	const extra = item?.extra ?? {};
	// TRX: extra.balance
	if (extra.balance != null) return String(extra.balance);
	// EVM: extra.asset.formatted
	if (extra.asset?.formatted != null) return String(extra.asset.formatted);
	// BTC: extra.confirmed
	if (extra.confirmed != null) return String(extra.confirmed);
	return null;
}

function resolveProtocol(item) {
	const extra = item?.extra ?? {};
	// TRX: extra.protocol
	if (extra.protocol != null) return String(extra.protocol);
	// EVM: extra.asset.assetType
	if (extra.asset?.assetType != null) return String(extra.asset.assetType);
	// BTC: extra.assetType
	if (extra.assetType != null) return String(extra.assetType);
	return null;
}

function pickPreview(items = [], limit = 5) {
	return (Array.isArray(items) ? items : []).slice(0, limit).map((item) => {
		const symbol = String(item?.symbol ?? item?.name ?? "-").trim() || "-";
		const chain = String(item?.chain ?? "-").trim() || "-";
		const network = String(item?.network ?? "-").trim() || "-";
		const address = String(item?.address ?? "-").trim() || "-";
		const providerId = String(item?.providerId ?? "-").trim() || "-";
		const balance = resolveBalance(item);
		const protocol = resolveProtocol(item);
		const protocolStr = protocol ? ` (${protocol})` : "";
		const balanceStr = balance != null ? ` balance=${balance}` : "";
		return `${symbol}${protocolStr} @ ${chain}:${network} ${address}${balanceStr} [${providerId}]`;
	});
}

function buildNoHitDiagnostics(input = {}, result = {}) {
	return {
		kind: "asset-by-address-no-hit",
		address: input?.address,
		chain: input?.chain ?? null,
		network: input?.network ?? null,
		sourceStats: result?.sourceStats ?? null,
		reason: "当前数据源在该链/网络下无匹配地址",
		hints: [
			"确认地址格式是否符合目标链规范",
			"确认该地址在目标链上是否存在可索引资产",
			"若需指定链，传入 chain 参数（evm / btc / trx）",
		],
	};
}

async function main() {
	const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
	const addresses = parseAddressList(raw);

	const address = String(process.argv[2] ?? addresses[0] ?? "").trim();
	const chain = String(process.argv[3] ?? "").trim() || undefined;
	const network = String(process.argv[4] ?? "").trim() || undefined;

	if (!address) {
		console.error("Usage: node run.asset.test.mjs <address> [chain] [network]");
		console.error("Sample addresses from test.data.md:");
		for (const a of addresses.slice(0, 6)) {
			console.error(`  ${a}`);
		}
		process.exitCode = 1;
		return;
	}

	const engine = createDefaultSearchEngine();
	const result = await engine.asset.byAddress({
		address,
		chain,
		network,
		limit: 20,
	});

	console.log("=== apps/search asset.byAddress ===");
	console.log(`address=${address}`);
	console.log(`chain=${chain ?? "-"}`);
	console.log(`network=${network ?? "-"}`);
	console.log(`ok=${result?.ok}`);
	console.log(`items=${Array.isArray(result?.items) ? result.items.length : 0}`);
	console.log(`sourceStats=${JSON.stringify(result?.sourceStats ?? {}, null, 2)}`);

	for (const line of pickPreview(result?.items, 20)) {
		console.log(`- ${line}`);
	}

	if (!Array.isArray(result?.items) || result.items.length === 0) {
		const diagnostics = buildNoHitDiagnostics({ address, chain, network }, result);
		console.log("noHitDiagnostics=");
		console.log(JSON.stringify(diagnostics, null, 2));
	}
}

main().catch((error) => {
	console.error(error?.stack ?? error?.message ?? String(error));
	process.exitCode = 1;
});
