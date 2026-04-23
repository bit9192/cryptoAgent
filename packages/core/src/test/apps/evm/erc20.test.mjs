import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Interface } from "ethers";

import { createErc20 } from "../../../apps/evm/erc20.mjs";

const ERC20_INTERFACE = new Interface([
	"function name() view returns (string)",
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
	"function totalSupply() view returns (uint256)",
	"function balanceOf(address) view returns (uint256)",
	"function allowance(address,address) view returns (uint256)",
	"function approve(address,uint256) returns (bool)",
	"function transfer(address,uint256) returns (bool)",
	"function transferFrom(address,address,uint256) returns (bool)",
]);

async function mkTmpDir(prefix) {
	return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function createMockRunner() {
	const sent = [];
	return {
		sent,
		async getAddress() {
			return "0x00000000000000000000000000000000000000AA";
		},
		async call(tx) {
			const decoded = ERC20_INTERFACE.parseTransaction({ data: tx.data });
			switch (decoded.name) {
				case "name":
					return ERC20_INTERFACE.encodeFunctionResult("name", ["Mock USD"]);
				case "symbol":
					return ERC20_INTERFACE.encodeFunctionResult("symbol", ["USDT"]);
				case "decimals":
					return ERC20_INTERFACE.encodeFunctionResult("decimals", [6]);
				case "totalSupply":
					return ERC20_INTERFACE.encodeFunctionResult("totalSupply", [999999999n]);
				case "balanceOf":
					return ERC20_INTERFACE.encodeFunctionResult("balanceOf", [1234567n]);
				case "allowance":
					return ERC20_INTERFACE.encodeFunctionResult("allowance", [888n]);
				default:
					throw new Error(`unexpected call: ${decoded.name}`);
			}
		},
		async sendTransaction(tx) {
			sent.push(tx);
			return {
				hash: `0x${String(sent.length).padStart(64, "0")}`,
				async wait() {
					return { status: 1 };
				},
			};
		},
	};
}

test("createErc20: 支持通过 token key + network 解析默认地址", async () => {
	const token = createErc20({
		token: "usdt",
		networkNameOrProvider: "eth",
		runner: createMockRunner(),
	});

	assert.equal(token.tokenName, "Tether USD");
	assert.equal(token.symbolHint, "USDT");
	assert.equal(token.decimalsHint, 6);
	assert.equal(token.address, "0xdAC17F958D2ee523a2206206994597C13D831ec7");
});

test("createErc20: contractName 未指定 deploymentKey 时默认解析最新地址", async () => {
	const deploymentDir = await mkTmpDir("evm-erc20-deploy-");
	const chainId = 31337;

	await fs.writeFile(path.join(deploymentDir, `${chainId}.json`), `${JSON.stringify({
		schemaVersion: 1,
		chainId,
		network: "fork",
		contracts: {
			TEST11111: {
				contractName: "TEST11111",
				address: "0x1111111111111111111111111111111111111111",
				updatedAt: "2026-04-05T08:18:06.390Z",
			},
			"TEST11111#2": {
				contractName: "TEST11111",
				address: "0x2222222222222222222222222222222222222222",
				updatedAt: "2026-04-05T08:24:20.123Z",
			},
			"TEST11111#3": {
				contractName: "TEST11111",
				address: "0x3333333333333333333333333333333333333333",
				updatedAt: "2026-04-05T08:24:36.190Z",
			},
			"TEST11111#4": {
				contractName: "TEST11111",
				address: "0xaBfb666BB4b2588D3259D8744e6971d74Aa55e9f",
				updatedAt: "2026-04-05T08:24:56.967Z",
			},
		},
		proxies: {},
		tokens: {},
	}, null, 2)}\n`, "utf8");

	const token = createErc20({
		token: "TEST11111",
		chainId,
		networkNameOrProvider: "fork",
		deploymentDirs: [deploymentDir],
		runner: createMockRunner(),
	});

	assert.equal(token.address.toLowerCase(), "0xabfb666bb4b2588d3259d8744e6971d74aa55e9f");
});

test("createErc20: 支持标准 ERC20 读写与 connect", async () => {
	const runner = createMockRunner();
	const token = createErc20({
		address: "0x00000000000000000000000000000000000000BB",
		tokenName: "Mock USD",
		runner,
		networkNameOrProvider: "eth",
	});

	assert.equal(await token.symbol(), "USDT");
	assert.equal(await token.decimals(), 6);
	assert.equal(await token.balanceOf("0x00000000000000000000000000000000000000CC"), 1234567n);
	assert.equal(await token.balanceOfHuman("0x00000000000000000000000000000000000000CC"), "1.234567");
	assert.equal(await token.allowance("0x00000000000000000000000000000000000000CC", "0x00000000000000000000000000000000000000DD"), 888n);

	const tx = await token.transferHuman("0x00000000000000000000000000000000000000EE", "1.5");
	assert.ok(tx.hash);
	assert.equal(runner.sent.length, 1);
	const decodedTransfer = ERC20_INTERFACE.parseTransaction({ data: runner.sent[0].data });
	assert.equal(decodedTransfer.name, "transfer");
	assert.equal(String(decodedTransfer.args[0]).toLowerCase(), "0x00000000000000000000000000000000000000ee");
	assert.equal(decodedTransfer.args[1], 1500000n);

	const rawSigner = {
		async sendTransaction(nextTx) {
			return {
				ok: true,
				result: {
					hash: "0xabc",
					tx: nextTx,
					async wait() {
						return { status: 1 };
					},
				},
			};
		},
	};
	const connected = token.connect(rawSigner);
	const approveTx = await connected.approve("0x00000000000000000000000000000000000000FF", 99n);
	assert.equal(approveTx.hash, "0xabc");
	const decodedApprove = ERC20_INTERFACE.parseTransaction({ data: approveTx.tx.data });
	assert.equal(decodedApprove.name, "approve");
	assert.equal(decodedApprove.args[1], 99n);
	assert.equal(connected.address, token.address);
});