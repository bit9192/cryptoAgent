import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";
import { multiCall } from "../../../apps/evm/multicall.mjs";
import { EvmContract } from "../../../apps/evm/contracts/deploy.mjs";

const erc20Abi = [
	"function name() view returns (string)",
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
	"function balanceOf(address account) view returns (uint256)",
];

function makeRequest(abi, target, method, args = []) {
	const iface = new Interface(abi);
	const fragment = iface.getFunction(method);
	return {
		target,
		iface,
		fragment,
		args,
		[Symbol.for("contractHelper.multicallRequest")]: true,
	};
}

function createStubMulticall(responses) {
	return {
		aggregate: {
			async staticCall(calls) {
				assert.equal(calls.length, responses.length);
				return [1n, responses.map((item) => item.encoded)];
			},
		},
	};
}

describe("evm multiCall", () => {
	it("returns same object shape for nested input", async () => {
		const tokenA = "0x00000000000000000000000000000000000000aa";
		const tokenB = "0x00000000000000000000000000000000000000bb";
		const wallet = "0x00000000000000000000000000000000000000cc";
		const iface = new Interface(erc20Abi);
		const responses = [
			{
				encoded: iface.encodeFunctionResult("name", ["TokenA"]),
			},
			{
				encoded: iface.encodeFunctionResult("symbol", ["TKA"]),
			},
			{
				encoded: iface.encodeFunctionResult("decimals", [18]),
			},
			{
				encoded: iface.encodeFunctionResult("balanceOf", [123456n]),
			},
		];

		const mc = multiCall({
			getContract: async () => createStubMulticall(responses),
		});

		const input = {
			tokenA: {
				meta: [
					makeRequest(erc20Abi, tokenA, "name"),
					makeRequest(erc20Abi, tokenA, "symbol"),
				],
				decimals: makeRequest(erc20Abi, tokenA, "decimals"),
			},
			wallet: {
				balance: makeRequest(erc20Abi, tokenB, "balanceOf", [wallet]),
			},
		};

		const output = await mc.call(input);

		assert.deepEqual(output, {
			tokenA: {
				meta: ["TokenA", "TKA"],
				decimals: 18n,
			},
			wallet: {
				balance: 123456n,
			},
		});
	});

	it("returns same array shape for nested list input", async () => {
		const token = "0x00000000000000000000000000000000000000aa";
		const iface = new Interface(erc20Abi);
		const responses = [
			{
				encoded: iface.encodeFunctionResult("name", ["TokenX"]),
			},
			{
				encoded: iface.encodeFunctionResult("symbol", ["TKX"]),
			},
			{
				encoded: iface.encodeFunctionResult("decimals", [6]),
			},
		];

		const mc = multiCall({
			getContract: async () => createStubMulticall(responses),
		});

		const input = [
			makeRequest(erc20Abi, token, "name"),
			[
				makeRequest(erc20Abi, token, "symbol"),
				{ decimals: makeRequest(erc20Abi, token, "decimals") },
			],
		];

		const output = await mc.call(input);

		assert.deepEqual(output, ["TokenX", ["TKX", { decimals: 6n }]]);
	});

	it("returns input directly when there is no multicall request", async () => {
		const mc = multiCall({
			getContract: async () => {
				throw new Error("should not resolve multicall contract");
			},
		});

		const input = {
			ok: true,
			message: "noop",
			list: [1, 2, 3],
		};

		const output = await mc.call(input);
		assert.deepEqual(output, input);
	});

	it("supports EvmContract call requests directly", async () => {
		const token = "0x00000000000000000000000000000000000000aa";
		const wallet = "0x00000000000000000000000000000000000000cc";
		const iface = new Interface(erc20Abi);
		const responses = [
			{
				encoded: iface.encodeFunctionResult("balanceOf", [7654321n]),
			},
			{
				encoded: iface.encodeFunctionResult("decimals", [18]),
			},
		];

		const mc = multiCall({
			getContract: async () => createStubMulticall(responses),
		});

		const tokenA = new EvmContract(token, erc20Abi, null);
		const output = await mc.call({
			balance: tokenA.call.balanceOf(wallet),
			meta: {
				decimals: tokenA.calls.decimals(),
			},
		});

		assert.deepEqual(output, {
			balance: 7654321n,
			meta: {
				decimals: 18n,
			},
		});
	});
});
