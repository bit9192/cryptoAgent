import test from "node:test";
import assert from "node:assert/strict";

import { 
	createBtcNetProvider, 
	resolveBtcProvider,
	getDefaultBtcProvider,
} from "../../../apps/btc/netprovider.mjs";
import {
	btcProviderSummary,
	btcNodeHealth,
} from "../../../apps/btc/core.mjs";
import { listCapabilities } from "../../../apps/btc/providers/adapter.mjs";

test("provider/resolver: 能按网络名称创建 provider", async () => {
	const provider = createBtcNetProvider("regtest");

	assert.equal(provider.networkName, "regtest");
	assert.ok(provider.adapter);
	assert.equal(typeof provider.supports, "function");
	assert.ok(Object.isFrozen(provider), "provider 应该是冻结对象");
});

test("provider/resolver: 能解析不同来源的输入", async () => {
	// 字符串
	const p1 = resolveBtcProvider("mainnet");
	assert.equal(p1.networkName, "mainnet");

	// 已有 provider
	const p2 = resolveBtcProvider(p1);
	assert.equal(p2.networkName, "mainnet");

	// 对象
	const p3 = resolveBtcProvider({ networkName: "testnet" });
	assert.equal(p3.networkName, "testnet");

	// 默认
	const p4 = resolveBtcProvider();
	assert.ok(p4.networkName);
});

test("provider/capabilities: bitcoind 应支持 healthcheck, getBlock 等", async () => {
	const provider = createBtcNetProvider("regtest");
	
	assert.equal(provider.supports("healthcheck"), true);
	assert.equal(provider.supports("getBlock"), true);
	assert.equal(provider.supports("getTx"), true);
	assert.equal(provider.supports("getUtxos"), true);
	assert.equal(provider.supports("walletOps"), true);
});

test("provider/summary: 可获取 provider 摘要信息", async () => {
	const summary = await btcProviderSummary("regtest");

	assert.equal(summary.networkName, "regtest");
	assert.equal(typeof summary.providerType, "string");
	assert.equal(typeof summary.name, "string");
	assert.equal(typeof summary.supportsCapabilities, "object");
	assert.ok(summary.supportsCapabilities.healthcheck);
});

test("provider/health: 可执行健康检查（本地不可用可 skip）", { timeout: 20000 }, async (t) => {
	const provider = createBtcNetProvider("regtest");
	
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

test("provider/adapter: 应能列出 capabilities", async () => {
	const provider = createBtcNetProvider("regtest");
	const caps = listCapabilities(provider.adapter);

	assert.equal(Array.isArray(caps.supported), true);
	assert.equal(Array.isArray(caps.unsupported), true);
	assert.ok(caps.supported.length > 0);
});
