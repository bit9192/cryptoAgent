/**
 * search.asset.test.mjs
 *
 * 直接通过 SearchEngine 查询 address domain，验证 provider 返回的资产余额摘要。
 *
 * 用法：
 *   node src/test/modules/search-engine/search.asset.test.mjs
 */

import { readFileSync } from "node:fs";
import { createDefaultSearchEngine } from "../../../modules/search-engine/index.mjs";

process.stdout.on("error", (error) => {
	if (error?.code === "EPIPE") {
		process.exit(0);
	}
	throw error;
});

function parseAddressAssetsCases(text) {
	const lines = String(text ?? "").split(/\r?\n/);
	const cases = [];
	let inSection = false;
	let category = "happy";
	let current = null;

	for (const raw of lines) {
		const line = raw.trim();

		if (line.startsWith("## address assets test")) {
			inSection = true;
			continue;
		}

		if (!inSection) {
			continue;
		}

		if (line.startsWith("## ")) {
			break;
		}

		if (!line) {
			continue;
		}

		if (line.startsWith("### ")) {
			category = line.slice(4).trim().toLowerCase() || "happy";
			current = null;
			continue;
		}

		if (category === "invalid") {
			if (!current) {
				current = {
					category,
					expectedSymbols: [],
					addresses: [],
				};
				cases.push(current);
			}
			current.addresses.push(line);
			continue;
		}

		if (!looksLikeAddress(line)) {
			current = {
				category,
				expectedSymbols: line
					.split(/\s+/)
					.map((item) => item.trim().toUpperCase())
					.filter(Boolean),
				addresses: [],
			};
			cases.push(current);
			continue;
		}

		if (!current) {
			current = {
				category,
				expectedSymbols: [],
				addresses: [],
			};
			cases.push(current);
		}
		current.addresses.push(line);
	}

	return cases.filter((item) => item.addresses.length > 0);
}

function looksLikeAddress(value) {
	const text = String(value ?? "").trim();
	if (!text) return false;
	if (/^0x[a-fA-F0-9]{40}$/.test(text)) return true;
	if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(text)) return true;
	if (/^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}$/.test(text)) return true;
	if (/^04[0-9a-fA-F]{128}$/.test(text)) return true;
	return false;
}

function detectChain(address) {
	const value = String(address ?? "").trim();
	if (/^0x[a-fA-F0-9]{40}$/.test(value)) return "evm";
	if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return "trx";
	if (/^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}$/.test(value) || /^04[0-9a-fA-F]{128}$/.test(value)) return "btc";
	return "unknown";
}

function trimTrailingZeros(value) {
	const text = String(value ?? "0").trim();
	if (!text.includes(".")) return text;
	return text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function pickAssetSymbol(item = {}) {
	const extra = item?.extra && typeof item.extra === "object" ? item.extra : {};
	const asset = extra.asset && typeof extra.asset === "object" ? extra.asset : {};
	const raw = String(item.symbol ?? asset.symbol ?? item.title ?? "-").trim();
	const normalized = raw.includes(" @ ") ? raw.split(" @ ")[0] : raw;
	return normalized.toUpperCase();
}

function pickAssetBalance(item = {}) {
	const extra = item?.extra && typeof item.extra === "object" ? item.extra : {};
	const asset = extra.asset && typeof extra.asset === "object" ? extra.asset : {};
	return asset.formatted ?? asset.balanceFormatted ?? asset.rawBalance ?? "0";
}

function formatTopAssets(items = []) {
	return items.slice(0, 5).map((item) => {
		const symbol = pickAssetSymbol(item);
		const balance = trimTrailingZeros(pickAssetBalance(item));
		const chain = String(item?.chain ?? "-").toLowerCase() || "-";
		const network = String(item?.network ?? "-").toLowerCase() || "-";
		return `${symbol}@${chain}:${network}=${balance}`;
	});
}

function matchExpectedSymbols(items = [], expectedSymbols = []) {
	if (!Array.isArray(expectedSymbols) || expectedSymbols.length === 0) {
		return [];
	}
	const found = new Set(items.map((item) => pickAssetSymbol(item)));
	return expectedSymbols.filter((symbol) => found.has(String(symbol).toUpperCase()));
}

async function main() {
	const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
	const cases = parseAddressAssetsCases(raw);
	const engine = createDefaultSearchEngine();
	const summary = {
		total: 0,
		hit: 0,
		empty: 0,
		invalidOk: 0,
		failed: 0,
	};

	console.log("=== Direct SearchEngine address assets ===\n");
    console.log(
        cases
    )

    return
	for (const item of cases) {
		console.log(`[${item.category}] expected=${item.expectedSymbols.join(",") || "-"}`);

		for (const address of item.addresses) {
			summary.total += 1;
			const chainHint = detectChain(address);

			try {
				const result = await engine.search({
					domain: "address",
					query: address,
					limit: 20,
					timeoutMs: 15000,
				});

				const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
				const matched = matchExpectedSymbols(candidates, item.expectedSymbols);
				const topAssets = formatTopAssets(candidates);

				if (item.category === "invalid") {
					if (candidates.length === 0) {
						summary.invalidOk += 1;
						console.log(`  ok    ${chainHint.padEnd(7)} ${address} -> empty`);
					} else {
						summary.failed += 1;
						console.log(`  fail  ${chainHint.padEnd(7)} ${address} -> unexpected assets=${candidates.length}`);
					}
					continue;
				}

				if (candidates.length === 0) {
					summary.empty += 1;
					console.log(`  empty ${chainHint.padEnd(7)} ${address}`);
					continue;
				}

				summary.hit += 1;
				console.log(
					`  hit   ${chainHint.padEnd(7)} ${address} -> assets=${candidates.length} matched=${matched.join(",") || "-"}`,
				);
				for (const row of topAssets) {
					console.log(`        - ${row}`);
				}
			} catch (error) {
				summary.failed += 1;
				console.log(`  fail  ${chainHint.padEnd(7)} ${address} -> ${error?.message ?? String(error)}`);
			}
		}

		console.log("");
	}

	console.log("=== Summary ===");
	console.log(`total=${summary.total}`);
	console.log(`hit=${summary.hit}`);
	console.log(`empty=${summary.empty}`);
	console.log(`invalidOk=${summary.invalidOk}`);
	console.log(`failed=${summary.failed}`);
}

main().catch((error) => {
	console.error(error?.stack ?? error?.message ?? String(error));
	process.exitCode = 1;
});
