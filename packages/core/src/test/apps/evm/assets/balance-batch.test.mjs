import test from "node:test";
import assert from "node:assert/strict";

import { Interface } from "ethers";

import {
	queryEvmTokenBalance,
	queryEvmTokenBalanceBatch,
} from "../../../../apps/evm/assets/balance-batch.mjs";

const ERC20_INTERFACE = new Interface([
	"function balanceOf(address) view returns (uint256)",
]);

function createBalanceRunner(table) {
	return {
		async call(tx) {
			const parsed = ERC20_INTERFACE.parseTransaction({ data: tx.data });
			if (parsed.name !== "balanceOf") {
				throw new Error(`unexpected method: ${parsed.name}`);
			}
			const tokenAddress = String(tx.to ?? "").toLowerCase();
			const ownerAddress = String(parsed.args[0] ?? "").toLowerCase();
			const key = `${tokenAddress}:${ownerAddress}`;
			const amount = table[key];
			if (amount == null) {
				throw new Error(`mock balance not found: ${key}`);
			}
			return ERC20_INTERFACE.encodeFunctionResult("balanceOf", [BigInt(amount)]);
		},
	};
}

function createBalanceMulticall(table) {
	return {
		async call(shape) {
			return shape.map((row) => {
				const key = `${String(row.tokenAddress ?? "").toLowerCase()}:${String(row.ownerAddress ?? "").toLowerCase()}`;
				const amount = table[key];
				if (amount == null) {
					throw new Error(`mock balance not found: ${key}`);
				}
				return {
					...row,
					balance: BigInt(amount),
				};
			});
		},
	};
}

test("evm token balance: supports single owner + token query", async () => {
	const owner = "0x00000000000000000000000000000000000000c1";
	const token = "0x00000000000000000000000000000000000000a1";
	const runner = createBalanceRunner({
		[`${token.toLowerCase()}:${owner.toLowerCase()}`]: 123n,
	});

	const item = await queryEvmTokenBalance({
		ownerAddress: owner,
		tokenAddress: token,
		runner,
	});

	assert.equal(item.chain, "evm");
	assert.equal(item.ownerAddress, "0x00000000000000000000000000000000000000C1");
	assert.equal(item.tokenAddress, "0x00000000000000000000000000000000000000A1");
	assert.equal(item.balance, 123n);
});

test("evm token balance: supports multi owner batch query", async () => {
	const owners = [
		"0x00000000000000000000000000000000000000c1",
		"0x00000000000000000000000000000000000000c2",
	];
	const tokens = [
		"0x00000000000000000000000000000000000000a1",
		"0x00000000000000000000000000000000000000a2",
	];
	const runner = createBalanceRunner({
		[`${tokens[0].toLowerCase()}:${owners[0].toLowerCase()}`]: 11n,
		[`${tokens[1].toLowerCase()}:${owners[0].toLowerCase()}`]: 22n,
		[`${tokens[0].toLowerCase()}:${owners[1].toLowerCase()}`]: 33n,
		[`${tokens[1].toLowerCase()}:${owners[1].toLowerCase()}`]: 44n,
	});

	const res = await queryEvmTokenBalanceBatch([
		{ address: owners[0], token: tokens[0] },
		{ address: owners[0], token: tokens[1] },
		{ address: owners[1], token: tokens[0] },
		{ address: owners[1], token: tokens[1] },
	], {
		runner,
		multicall: createBalanceMulticall({
			[`${tokens[0].toLowerCase()}:${owners[0].toLowerCase()}`]: 11n,
			[`${tokens[1].toLowerCase()}:${owners[0].toLowerCase()}`]: 22n,
			[`${tokens[0].toLowerCase()}:${owners[1].toLowerCase()}`]: 33n,
			[`${tokens[1].toLowerCase()}:${owners[1].toLowerCase()}`]: 44n,
		}),
	});

	assert.equal(res.ok, true);
	assert.equal(res.items.length, 4);
	assert.equal(res.items[0].balance, 11n);
	assert.equal(res.items[1].balance, 22n);
	assert.equal(res.items[2].balance, 33n);
	assert.equal(res.items[3].balance, 44n);
});

test("evm token balance: empty token list returns empty result", async () => {
	const res = await queryEvmTokenBalanceBatch([], {
		runner: createBalanceRunner({}),
	});

	assert.equal(res.ok, true);
	assert.deepEqual(res.items, []);
});

test("evm token balance: supports native token marker", async () => {
	const owner = "0x00000000000000000000000000000000000000c1";
	const runner = createBalanceRunner({});
	const res = await queryEvmTokenBalanceBatch([
		{ address: owner, token: "native" },
	], {
		runner,
		multicallAddress: "0x00000000000000000000000000000000000000ff",
		multicall: {
			async call(shape) {
				return shape.map((row) => ({ ...row, balance: 99n }));
			},
		},
	});

	assert.equal(res.ok, true);
	assert.equal(res.items.length, 1);
	assert.equal(res.items[0].tokenAddress, "native");
	assert.equal(res.items[0].balance, 99n);
});

test("evm token balance: batch input must be array", async () => {
	await assert.rejects(
		async () => await queryEvmTokenBalanceBatch({ items: [] }, {}),
		/数组/,
	);
});
