import test from "node:test";
import assert from "node:assert/strict";

import {
	brc20SummaryGet,
	brc20BalanceGet,
	createBrc20,
} from "../../../apps/btc/brc20.mjs";

function jsonResponse(payload, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		async json() {
			return payload;
		},
	};
}

test("brc20SummaryGet: 读取并标准化 summary 数据", async (t) => {
	const calls = [];
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});

	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init });
		return jsonResponse({
			code: 0,
			msg: "OK",
			data: {
				height: 850000,
				start: 0,
				total: 1,
				detail: [{
					ticker: "ordi",
					overallBalance: "12",
					availableBalance: "7",
					transferableBalance: "5",
				}],
			},
		});
	};

	const result = await brc20SummaryGet({
		address: "bc1qsummary0000000000000000000000000000000000",
		limit: 16,
	});

	assert.equal(result.networkName, "mainnet");
	assert.equal(result.total, 1);
	assert.equal(result.rows[0].ticker, "ORDI");
	assert.equal(result.rows[0].overallBalance, "12");
	assert.match(calls[0].url, /\/v1\/indexer\/address\/.+\/brc20\/summary/);
	assert.match(calls[0].url, /start=0/);
	assert.match(calls[0].url, /limit=16/);
	assert.match(calls[0].url, /exclude_zero=true/);
	assert.match(calls[0].url, /tick_filter=24/);
});

test("brc20BalanceGet: 读取 ticker info 并返回统一余额结构", async (t) => {
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});

	globalThis.fetch = async () => jsonResponse({
		code: 0,
		msg: "OK",
		data: {
			ticker: "ordi",
			overallBalance: "20",
			availableBalance: "8",
			availableBalanceSafe: "8",
			availableBalanceUnSafe: "0",
			transferableBalance: "12",
			transferableCount: 2,
			historyCount: 0,
			historyInscriptions: [],
			transferableInscriptions: [],
		},
	});

	const result = await brc20BalanceGet({
		address: "bc1qbalance0000000000000000000000000000000000",
		ticker: "ordi",
	});

	assert.equal(result.symbol, "ORDI");
	assert.equal(result.balance, "20");
	assert.equal(result.availableBalance, "8");
	assert.equal(result.transferableBalance, "12");
	assert.equal(result.transferableCount, 2);
});

test("brc20BalanceGet: 支持用 token key 解析默认 ticker", async (t) => {
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});

	globalThis.fetch = async (url) => {
		assert.match(String(url), /\/brc20\/ORDI\/info/i);
		return jsonResponse({
			code: 0,
			msg: "OK",
			data: {
				ticker: "ordi",
				overallBalance: "3",
				availableBalance: "2",
				availableBalanceSafe: "2",
				availableBalanceUnSafe: "0",
				transferableBalance: "1",
				transferableCount: 1,
				historyCount: 0,
				historyInscriptions: [],
				transferableInscriptions: [],
			},
		});
	};

	const result = await brc20BalanceGet({
		address: "bc1qbalance0000000000000000000000000000000000",
		key: "ordi",
	});

	assert.equal(result.symbol, "ORDI");
	assert.equal(result.tokenName, "Ordinals");
	assert.equal(result.decimals, 18);
});

test("createBrc20.transfer: 通过 wallet signer 完成 UniSat transfer 编排", async (t) => {
	const calls = [];
	const signCalls = [];
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});

	globalThis.fetch = async (url, init = {}) => {
		const body = init.body ? JSON.parse(init.body) : null;
		calls.push({ url: String(url), init, body });

		if (String(url).includes("/v2/inscribe/order/create/brc20-transfer")) {
			assert.equal(body.receiveAddress, "bc1qreceiver000000000000000000000000000000000");
			assert.equal(body.brc20Ticker, "ORDI");
			assert.equal(body.brc20Amount, "15");
			return jsonResponse({
				code: 0,
				msg: "OK",
				data: { orderId: "order-1", payAddress: "bc1qpay", amount: 1234 },
			});
		}

		if (String(url).includes("/v2/inscribe/order/request-commit")) {
			assert.equal(body.orderId, "order-1");
			assert.equal(body.payerAddress, "bc1qpayer00000000000000000000000000000000000");
			return jsonResponse({
				code: 0,
				msg: "OK",
				data: {
					psbtHex: "70736274ff0100",
					inputsToSign: [{
						address: "bc1qpayer00000000000000000000000000000000000",
						signingIndexes: [0, 2],
					}],
				},
			});
		}

		if (String(url).includes("/v2/inscribe/order/sign-commit")) {
			assert.equal(body.orderId, "order-1");
			assert.equal(body.psbt, "signed-commit-psbt");
			return jsonResponse({
				code: 0,
				msg: "OK",
				data: {
					psbtHex: "70736274ff0200",
					inputsToSign: [{
						address: "bc1qpayer00000000000000000000000000000000000",
						signingIndexes: [1],
					}],
				},
			});
		}

		if (String(url).includes("/v2/inscribe/order/sign-reveal")) {
			assert.equal(body.orderId, "order-1");
			assert.equal(body.psbt, "signed-reveal-psbt");
			return jsonResponse({
				code: 0,
				msg: "OK",
				data: { inscriptionId: "inscription-1" },
			});
		}

		throw new Error(`unexpected url: ${String(url)}`);
	};

	const signer = {
		async getAddress() {
			return "bc1qpayer00000000000000000000000000000000000";
		},
		async getPublicKey() {
			return { publicKey: Buffer.from(`02${"11".repeat(32)}`, "hex") };
		},
		async signPsbt(payload) {
			signCalls.push(payload);
			return {
				ok: true,
				result: {
					psbtHex: signCalls.length === 1 ? "signed-commit-psbt" : "signed-reveal-psbt",
				},
			};
		},
	};

	const brc20 = createBrc20({
		key: "ordi",
		signer,
		derivePath: "m/84'/0'/0'/0/0",
		addressType: "p2wpkh",
		apiBase: "https://open-api.unisat.io",
	});

	const result = await brc20.transfer(
		"bc1qreceiver000000000000000000000000000000000",
		"15",
		{ feeRate: 12 },
	);

	assert.equal(result.ok, true);
	assert.equal(result.orderId, "order-1");
	assert.equal(result.inscriptionId, "inscription-1");
	assert.equal(signCalls.length, 2);
	assert.equal(signCalls[0].finalize, false);
	assert.deepEqual(signCalls[0].signingRequests, [
		{ inputIndex: 0, derivePath: "m/84'/0'/0'/0/0", addressType: "p2wpkh" },
		{ inputIndex: 2, derivePath: "m/84'/0'/0'/0/0", addressType: "p2wpkh" },
	]);
	assert.deepEqual(signCalls[1].signingRequests, [
		{ inputIndex: 1, derivePath: "m/84'/0'/0'/0/0", addressType: "p2wpkh" },
	]);
	assert.equal(calls.length, 4);
});