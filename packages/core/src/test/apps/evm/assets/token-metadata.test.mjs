import test from "node:test";
import assert from "node:assert/strict";

import { Interface } from "ethers";

import {
	queryEvmTokenMetadata,
	queryEvmTokenMetadataBatch,
} from "../../../../apps/evm/assets/token-metadata.mjs";

const ERC20_METADATA_INTERFACE = new Interface([
	"function name() view returns (string)",
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
]);

function createMetadataRunner(table) {
	return {
		async call(tx) {
			const parsed = ERC20_METADATA_INTERFACE.parseTransaction({ data: tx.data });
			const address = String(tx.to ?? "").toLowerCase();
			const row = table[address];
			if (!row) {
				throw new Error(`mock token not found: ${address}`);
			}
			if (parsed.name === "name") {
				return ERC20_METADATA_INTERFACE.encodeFunctionResult("name", [row.name]);
			}
			if (parsed.name === "symbol") {
				return ERC20_METADATA_INTERFACE.encodeFunctionResult("symbol", [row.symbol]);
			}
			if (parsed.name === "decimals") {
				return ERC20_METADATA_INTERFACE.encodeFunctionResult("decimals", [row.decimals]);
			}
			throw new Error(`unexpected call: ${parsed.name}`);
		},
	};
}

test("evm token metadata: supports single token query", async () => {
	const runner = createMetadataRunner({
		"0x00000000000000000000000000000000000000aa": {
			name: "Mock USD",
			symbol: "MUSD",
			decimals: 6,
		},
	});

	const item = await queryEvmTokenMetadata({
		tokenAddress: "0x00000000000000000000000000000000000000aa",
		runner,
	});

	assert.equal(item.chain, "evm");
	assert.equal(item.tokenAddress, "0x00000000000000000000000000000000000000AA");
	assert.equal(item.name, "Mock USD");
	assert.equal(item.symbol, "MUSD");
	assert.equal(item.decimals, 6);
});

test("evm token metadata: supports small batch query", async () => {
	const runner = createMetadataRunner({
		"0x00000000000000000000000000000000000000aa": {
			name: "Mock USD",
			symbol: "MUSD",
			decimals: 6,
		},
		"0x00000000000000000000000000000000000000bb": {
			name: "Mock ETH",
			symbol: "METH",
			decimals: 18,
		},
	});

	const res = await queryEvmTokenMetadataBatch({
		tokenAddresses: [
			"0x00000000000000000000000000000000000000aa",
			"0x00000000000000000000000000000000000000bb",
		],
		runner,
	});

	assert.equal(res.ok, true);
	assert.equal(res.items.length, 2);
	assert.equal(res.items[0].symbol, "MUSD");
	assert.equal(res.items[1].symbol, "METH");
});

test("evm token metadata: throws on invalid token address", async () => {
	await assert.rejects(
		async () => await queryEvmTokenMetadata({
			tokenAddress: "not-an-address",
			runner: createMetadataRunner({}),
		}),
		/invalid address|tokenAddress/,
	);
});
