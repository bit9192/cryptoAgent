import test from "node:test";
import assert from "node:assert/strict";

import {
	btcProviderSummary,
	btcNodeHealth,
	btcTxGet,
	btcUtxoList,
	btcBalanceGet,
	btcFeeEstimate,
	createBtcNetProvider,
} from "../../../apps/btc/index.mjs";

test("read API/summary: 可获取 provider 摘要", async () => {
	const summary = await btcProviderSummary("regtest");

	assert.equal(typeof summary.networkName, "string");
	assert.equal(typeof summary.providerType, "string");
	assert.equal(typeof summary.supportsCapabilities, "object");
	assert.ok(summary.supportsCapabilities.getTx);
	assert.ok(summary.supportsCapabilities.getUtxos);
});

test("read API/health: 可执行健康检查", { timeout: 20000 }, async (t) => {
	try {
		const health = await btcNodeHealth("regtest");

		assert.equal(typeof health.networkName, "string");
		assert.equal(typeof health.healthy, "boolean");

		if (!health.healthy && String(health.error).includes("ECONNREFUSED")) {
			t.skip("本地 BTC 节点未启动，跳过健康检查");
			return;
		}
	} catch (error) {
		if (String(error.message).includes("ECONNREFUSED")) {
			t.skip("本地 BTC 节点未启动，跳过健康检查");
		} else {
			throw error;
		}
	}
});

test("read API/tx-get: 不支持的能力应报错", async () => {
	const provider = createBtcNetProvider("regtest");

	// 模拟一个不支持来覆盖能力检查
	const mockProvider = {
		...provider,
		supports: () => false,
		adapter: {
			...provider.adapter,
			supports: () => false,
		},
	};

	try {
		// 直接用 API 会通过已冻结的 provider，所以这里测试能力检查逻辑
		await btcTxGet({ txid: "abc" }, mockProvider);
		assert.fail("应该抛出错误");
	} catch (error) {
		assert.ok(
			String(error.message).includes("不支持"),
			"错误消息应包含提示",
		);
	}
});

test("read API/tx-get: 必须提供 txid", async () => {
	try {
		await btcTxGet({}, "regtest");
		assert.fail("应该抛出错误");
	} catch (error) {
		assert.ok(String(error.message).includes("txid"));
	}
});

test("read API/utxo-list: 必须提供 addresses", async () => {
	try {
		await btcUtxoList({}, "regtest");
		assert.fail("应该抛出错误");
	} catch (error) {
		assert.ok(String(error.message).includes("addresses"));
	}
});

test("read API/utxo-list: 不支持的 provider 应报错", async () => {
	const provider = createBtcNetProvider("regtest");
	const mockProvider = {
		...provider,
		supports: () => false,
	};

	try {
		await btcUtxoList({ addresses: ["1A1z7agoat"] }, mockProvider);
		assert.fail("应该抛出错误");
	} catch (error) {
		assert.ok(String(error.message).includes("不支持"));
	}
});

test("read API/balance-get: 必须提供 addresses", async () => {
	try {
		await btcBalanceGet({}, "regtest");
		assert.fail("应该抛出错误");
	} catch (error) {
		assert.ok(String(error.message).includes("addresses"));
	}
});

test("read API/fee-estimate: 返回标准格式", { timeout: 20000 }, async (t) => {
	const provider = createBtcNetProvider("regtest");

	if (!provider.supports("estimateFee")) {
		t.skip("regtest 不支持费用估计");
		return;
	}

	try {
		const fee = await btcFeeEstimate({ blocks: 6 }, "regtest");

		assert.equal(typeof fee.networkName, "string");
		assert.equal(typeof fee.providerType, "string");
		assert.equal(typeof fee.feeRate, "number");
		assert.equal(fee.blocks, 6);
		assert.equal(fee.unit, "BTC/B");
	} catch (error) {
		const errMsg = String(error.message);
		if (
			errMsg.includes("ECONNREFUSED") ||
			errMsg.includes("fetch failed")
		) {
			t.skip("本地 BTC 节点未启动，跳过费用估计");
		} else {
			throw error;
		}
	}
});
