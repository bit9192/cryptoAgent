import test from "node:test";
import assert from "node:assert/strict";

import { EvmContract } from "../../../../apps/evm/contracts/deploy.mjs";

test("EvmContract: 提供 address 别名", () => {
	const contract = new EvmContract(
		"0x1111111111111111111111111111111111111111",
		[],
		null,
	);

	assert.equal(contract.address, "0x1111111111111111111111111111111111111111");
	assert.equal(String(contract.target), contract.address);
});

test("EvmContract.connect: 自动适配 wallet 风格 signer", async () => {
	const base = new EvmContract(
		"0x2222222222222222222222222222222222222222",
		[],
		null,
	);

	const rawSigner = {
		async getAddress() {
			return { ok: true, result: "0x3333333333333333333333333333333333333333" };
		},
		async signMessage() {
			return { ok: true, result: "0xsig" };
		},
		async signTransaction() {
			return { ok: true, result: "0xsigned" };
		},
		async sendTransaction() {
			return { ok: true, result: { hash: "0xabc" } };
		},
	};

	const connected = base.connect(rawSigner);
	assert.equal(connected instanceof EvmContract, true);
	assert.equal(connected.address, "0x2222222222222222222222222222222222222222");
	assert.equal(typeof connected.runner.sendTransaction, "function");

	const tx = await connected.runner.sendTransaction({});
	assert.equal(tx.hash, "0xabc");

	const addr = await connected.runner.getAddress();
	assert.equal(addr, "0x3333333333333333333333333333333333333333");
});
