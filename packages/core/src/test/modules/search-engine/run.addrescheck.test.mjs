/**
 * run.addrescheck.test.mjs
 *
 * 用法：
 *   node src/test/modules/search-engine/run.addrescheck.test.mjs
 */

import { readFileSync } from "node:fs";

import { searchAddressCheckTask } from "../../../tasks/search/index.mjs";

function parseAddressSection(text) {
	const lines = String(text ?? "").split(/\r?\n/);
	const out = [];
	let inAddresses = false;

	for (const raw of lines) {
		const line = raw.trim();

		if (line.startsWith("# addresses")) {
			inAddresses = true;
			continue;
		}
		if (inAddresses && line.startsWith("## address assets test")) {
			break;
		}
		if (inAddresses && line.startsWith("#") && !line.startsWith("## btc P2PK")) {
			break;
		}
		if (!inAddresses || !line) continue;

		// Skip inline subgroup headers in address section.
		if (line.startsWith("## ")) continue;

		const value = line.replace(/^[-*]\s*/, "").trim();
		if (value) out.push(value);
	}

	return out;
}

function shortAddress(value) {
	const text = String(value ?? "").trim();
	if (text.length <= 16) return text;
	return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function formatTopCandidate(row) {
	if (!row || typeof row !== "object") return "-";
	const chain = String(row.chain ?? "-");
	const detectedNetwork = String(row.detectedNetwork ?? "-");
	const networks = Array.isArray(row.networks) ? row.networks.join(",") : "-";
	const mainnetNetworks = Array.isArray(row.mainnetNetworks) ? row.mainnetNetworks.join(",") : "-";
	const providers = Array.isArray(row.providerIds) ? row.providerIds.join(",") : "-";
	const addressType = String(row.addressType ?? "-");
	return `type=${addressType} [${chain}] detected=${detectedNetwork} networks=${networks} mainnet=${mainnetNetworks} providers=${providers}`;
}

async function main() {
	const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
	const addresses = parseAddressSection(raw);

	console.log("🚀 === run.addrescheck: address-check ===");
	console.log(`样本数量: ${addresses.length}`);

	for (const address of addresses) {
		try {
			const result = await searchAddressCheckTask({
				query: address,
				timeoutMs: 15000,
			});

			if (!result?.ok) {
				console.log(`✗ ${shortAddress(address)} error=${String(result?.error ?? "unknown")}`);
				continue;
			}

			const candidates = Array.isArray(result.candidates) ? result.candidates : [];
			const top = candidates[0] ?? null;
			console.log(`✓ ${shortAddress(address)} hits=${candidates.length} top=${formatTopCandidate(top)}`);
		} catch (error) {
			console.log(`✗ ${shortAddress(address)} error=${String(error?.message ?? error)}`);
		}
	}

	console.log("✅ 完成");
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

