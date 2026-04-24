import test from "node:test";
import assert from "node:assert/strict";

import {
	queryEvmTokenMetadata,
	queryEvmTokenMetadataBatch,
} from "../../../../apps/evm/assets/token-metadata.mjs";

function createMetadataMulticall(table) {
	return {
		async call(shape) {
			return shape.map((row) => {
				const tokenAddress = String(row.tokenAddress ?? "").toLowerCase();
				const meta = table[tokenAddress];
				if (!meta) {
					throw new Error(`mock token not found: ${tokenAddress}`);
				}
				return {
					...row,
					name: meta.name,
					symbol: meta.symbol,
					decimals: meta.decimals,
				};
			});
		},
	};
}

test("evm token metadata: supports single token query", async () => {
	const multicall = createMetadataMulticall({
		"0x00000000000000000000000000000000000000aa": {
			name: "Mock USD",
			symbol: "MUSD",
			decimals: 6,
		},
	});

	const item = await queryEvmTokenMetadata({
		tokenAddress: "0x00000000000000000000000000000000000000aa",
		multicall,
	});

	assert.equal(item.chain, "evm");
	assert.equal(item.tokenAddress, "0x00000000000000000000000000000000000000AA");
	assert.equal(item.name, "Mock USD");
	assert.equal(item.symbol, "MUSD");
	assert.equal(item.decimals, 6);
});

test("evm token metadata: supports small batch query", async () => {
	const multicall = createMetadataMulticall({
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

	const res = await queryEvmTokenMetadataBatch([
		{ token: "0x00000000000000000000000000000000000000aa" },
		{ token: "0x00000000000000000000000000000000000000bb" },
	], {
		multicall,
	});

	assert.equal(res.ok, true);
	assert.equal(res.items.length, 2);
	assert.equal(res.items[0].symbol, "MUSD");
	assert.equal(res.items[1].symbol, "METH");
});

test("evm token metadata: falls back to single-token reader when multicall misses decimals", async () => {
	const multicall = createMetadataMulticall({
		"0x00000000000000000000000000000000000000aa": {
			name: "Mock USD",
			symbol: "MUSD",
			decimals: null,
		},
	});

	let fallbackCalled = 0;
	const res = await queryEvmTokenMetadataBatch([
		{ token: "0x00000000000000000000000000000000000000aa" },
	], {
		multicall,
		async singleTokenMetadataReader(tokenAddress) {
			fallbackCalled += 1;
			return {
				tokenAddress,
				name: "Mock USD",
				symbol: "MUSD",
				decimals: 18,
			};
		},
	});

	assert.equal(res.ok, true);
	assert.equal(res.items.length, 1);
	assert.equal(res.items[0].tokenAddress, "0x00000000000000000000000000000000000000AA");
	assert.equal(res.items[0].decimals, 18);
	assert.equal(fallbackCalled, 1);
});


test("evm token metadata: queryEvmTokenMetadata supports batch tokens", async () => {
	const res = await queryEvmTokenMetadata({
		tokens: [
			{ token: "0x00000000000000000000000000000000000000aa" },
			{ token: "0x00000000000000000000000000000000000000bb" },
		],
		multicall: createMetadataMulticall({
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
		}),
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
		}),
		/invalid address|tokenAddress/,
	);
});

test("evm token metadata: batch input must be array", async () => {
	await assert.rejects(
		async () => await queryEvmTokenMetadataBatch({ tokenAddresses: [] }, {}),
		/数组/,
	);
});
