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

function pickPreview(items = [], limit = 5) {
	return (Array.isArray(items) ? items : []).slice(0, limit).map((item) => {
		const symbol = String(item?.symbol ?? "-").trim() || "-";
		const chain = String(item?.chain ?? "-").trim() || "-";
		const network = String(item?.network ?? "-").trim() || "-";
		const address = String(item?.address ?? item?.tokenAddress ?? "-").trim() || "-";
		const providerId = String(item?.providerId ?? "-").trim() || "-";
		return `${symbol} @ ${chain}:${network} ${address} [${providerId}]`;
	});
}

function buildNoHitDiagnostics(input = {}, result = {}) {
	const query = String(input?.query ?? "").trim();
	const chain = String(input?.chain ?? "").trim() || null;
	const network = String(input?.network ?? "").trim() || null;
	const matchMode = String(input?.matchMode ?? "fuzzy").trim().toLowerCase() === "exact"
		? "exact"
		: "fuzzy";

	return {
		kind: "token-search-no-hit",
		query,
		chain,
		network,
		matchMode,
		sourceStats: result?.sourceStats ?? null,
		reason: "当前数据源在该链/网络下无可用候选",
		hints: [
			"确认该 token 在目标链是否存在可交易或可索引资产",
			"尝试同义查询（symbol/address）",
			"若需强制有返回，可在链配置中补白名单 token",
		],
	};
}

async function main() {
	const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
	const tokens = parseTokenList(raw);

	const query = String(process.argv[2] ?? tokens[0] ?? "usdt").trim();
	const chain = String(process.argv[3] ?? "").trim() || undefined;
	const network = String(process.argv[4] ?? "").trim() || undefined;
    const matchMode = String(process.argv[5] ?? "fuzzy").trim().toLowerCase() === "exact"
        ? "exact"
        : "fuzzy";
    
	const engine = createDefaultSearchEngine();
	const result = await engine.token.search({
		query,
		chain,
		network,
		limit: 20,
        matchMode,
	});

	console.log("=== apps/search token.search ===");
	console.log(`query=${query}`);
	console.log(`chain=${chain ?? "-"}`);
	console.log(`network=${network ?? "-"}`);
	console.log(`matchMode=${matchMode}`);
	console.log(`items=${Array.isArray(result?.items) ? result.items.length : 0}`);
	console.log(`sourceStats=${JSON.stringify(result?.sourceStats ?? {}, null, 2)}`);

	for (const line of pickPreview(result?.items, 8)) {
		console.log(`- ${line}`);
	}

	if (!Array.isArray(result?.items) || result.items.length === 0) {
		const diagnostics = buildNoHitDiagnostics({ query, chain, network, matchMode }, result);
		console.log("noHitDiagnostics=");
		console.log(JSON.stringify(diagnostics, null, 2));
	}
}

main().catch((error) => {
	console.error(error?.stack ?? error?.message ?? String(error));
	process.exitCode = 1;
});
