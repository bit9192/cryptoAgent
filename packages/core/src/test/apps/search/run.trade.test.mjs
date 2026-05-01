import { readFileSync } from "node:fs";

import { createDefaultSearchEngine } from "../../../apps/search/engine.mjs";

function parseTokenList(text) {
	const lines = String(text ?? "").split(/\r?\n/);
	const tokens = [];
	let inTokens = false;

	for (const raw of lines) {
		const line = raw.trim();
		if (line === "# tokens") {
			inTokens = true;
			continue;
		}
		if (!inTokens) continue;
		if (!line) continue;
		if (line.startsWith("### ") || line.startsWith("## ") || line.startsWith("# ")) {
			break;
		}
		tokens.push(line);
	}

	return tokens;
}

function pickPreview(items = [], limit = 20) {
	return (Array.isArray(items) ? items : []).slice(0, limit).map((item) => {
		const symbol = String(item?.symbol ?? item?.name ?? "-").trim() || "-";
		const chain = String(item?.chain ?? "-").trim() || "-";
		const network = String(item?.network ?? "-").trim() || "-";
		const pairAddress = String(item?.pairAddress ?? item?.address ?? "-").trim() || "-";
		const providerId = String(item?.providerId ?? "-").trim() || "-";
		const price = item?.priceUsd != null ? ` price=$${item.priceUsd}` : "";
		const vol = item?.volume24h != null ? ` vol24h=${item.volume24h}` : "";
		return `${symbol} @ ${chain}:${network} ${pairAddress}${price}${vol} [${providerId}]`;
	});
}

function buildNoHitDiagnostics(input = {}, result = {}) {
	return {
		kind: "trade-search-no-hit",
		query: input?.query,
		chain: input?.chain ?? null,
		network: input?.network ?? null,
		sourceStats: result?.sourceStats ?? null,
		reason: "当前数据源在该链/网络下无可用交易对",
		hints: [
			"确认该 token 在目标链是否存在可交易对",
			"尝试直接传入 token 合约地址作为 query",
			"若跨链查询，去掉 chain 参数让所有 provider 参与",
		],
	};
}

async function main() {
	const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
	const tokens = parseTokenList(raw);

	const query = String(process.argv[2] ?? tokens[0] ?? "usdt").trim();
	const chain = String(process.argv[3] ?? "").trim() || undefined;
	const network = String(process.argv[4] ?? "").trim() || undefined;

	const engine = createDefaultSearchEngine();
	const result = await engine.trade.search({
		query,
		chain,
		network,
		limit: 20,
	});

	console.log("=== apps/search trade.search ===");
	console.log(`query=${query}`);
	console.log(`chain=${chain ?? "-"}`);
	console.log(`network=${network ?? "-"}`);
	console.log(`items=${Array.isArray(result?.items) ? result.items.length : 0}`);
	console.log(`sourceStats=${JSON.stringify(result?.sourceStats ?? {}, null, 2)}`);

	for (const line of pickPreview(result?.items, 20)) {
		console.log(`- ${line}`);
	}

	if (!Array.isArray(result?.items) || result.items.length === 0) {
		const diagnostics = buildNoHitDiagnostics({ query, chain, network }, result);
		console.log("noHitDiagnostics=");
		console.log(JSON.stringify(diagnostics, null, 2));
	}
}

main().catch((error) => {
	console.error(error?.stack ?? error?.message ?? String(error));
	process.exitCode = 1;
});
