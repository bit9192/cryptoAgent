/**
 * TRX 查询演示脚试
 * 测试地址：TTfXBJ1ssA2MTXTgdesjLddcYy4ccw4QGp
 */

import test from "node:test";
import assert from "node:assert";
import { getTrxNetworkConfig } from "../../../apps/trx/config/networks.js";

const TEST_ADDRESS = "TTfXBJ1ssA2MTXTgdesjLddcYy4ccw4QGp";

async function fetchTrxAddress(address, networkName = "mainnet") {
	const config = getTrxNetworkConfig(networkName);
	const url = `${config.rpcUrl}/v1/accounts/${address}`;

	const headers = {
		accept: "application/json",
		...(config.apiKey ? { "TRON-PRO-API-KEY": config.apiKey } : {}),
	};

	const response = await fetch(url, { headers, timeout: 15000 });

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	return response.json();
}

test("trx query: mainnet 地址查询", async () => {
	const response = await fetchTrxAddress(TEST_ADDRESS, "mainnet");

	// 验证响应结构
	assert.ok(response, "响应不为空");
	assert.ok(response.data || response.address, "响应应包含 data 或 address");

	// 获取账户信息
	const accountInfo = response.data?.[0] || response;

	// 验证账户数据
	assert.ok(accountInfo.address, "账户应有地址");
	assert.strictEqual(
		typeof accountInfo.balance,
		"number",
		"余额应为数字类型"
	);
	console.log(`  ✓ 地址: ${TEST_ADDRESS}`);
	console.log(`  ✓ 余额: ${accountInfo.balance / 1e6} TRX`);
	console.log(`  ✓ 创建时间: ${new Date(accountInfo.create_time).toISOString()}`);

	if (Array.isArray(accountInfo.trc20)) {
		console.log(`  ✓ TRC-20 代币: ${accountInfo.trc20.length}`);
	}
});

test("trx query: nile 测试网地址查询", async () => {
	const response = await fetchTrxAddress(TEST_ADDRESS, "nile");

	assert.ok(response, "测试网响应不为空");

	const accountInfo = response.data?.[0] || response;

	if (accountInfo && typeof accountInfo === "object") {
		const balanceTrx = (accountInfo.balance || 0) / 1e6;
		console.log(`  ✓ 测试网地址查询成功`);
		console.log(`  ✓ 测试网余额: ${balanceTrx} TRX`);
	}
});

test("trx query: 网络配置读取", async () => {
	const mainnetConfig = getTrxNetworkConfig("mainnet");
	const nileConfig = getTrxNetworkConfig("nile");

	assert.strictEqual(mainnetConfig.networkName, "mainnet");
	assert.strictEqual(nileConfig.networkName, "nile");
	assert.ok(mainnetConfig.rpcUrl.includes("trongrid.io"));
	assert.ok(nileConfig.rpcUrl.includes("trongrid.io"));

	console.log(`  ✓ 主网 RPC: ${mainnetConfig.rpcUrl}`);
	console.log(`  ✓ 测试网 RPC: ${nileConfig.rpcUrl}`);
});

test("trx query: 地址数据完整性验证", async () => {
	const response = await fetchTrxAddress(TEST_ADDRESS, "mainnet");
	const accountInfo = response.data?.[0] || response;

	// 验证关键数据字段
	assert.ok(
		accountInfo.owner_permission !== undefined,
		"应包含 owner_permission"
	);
	assert.ok(
		accountInfo.active_permission !== undefined,
		"应包含 active_permission"
	);
	assert.ok(accountInfo.balance !== undefined, "应包含 balance");
	assert.ok(
		accountInfo.free_net_usage !== undefined,
		"应包含 free_net_usage"
	);

	console.log(`  ✓ 权限: owner=${accountInfo.owner_permission?.permission_name}`);
	console.log(`  ✓ 免费带宽已用: ${accountInfo.free_net_usage} bytes`);
});

test("trx query: TRC 资产统计", { skip: true }, async () => {
	const response = await fetchTrxAddress(TEST_ADDRESS, "mainnet");
	const accountInfo = response.data?.[0] || response;

	const trc20Count = Array.isArray(accountInfo.trc20)
		? accountInfo.trc20.length
		: 0;
	const trc10Count = Array.isArray(accountInfo.assetV2)
		? accountInfo.assetV2.length
		: 0;

	console.log(`  ✓ 持有 TRC-20 代币: ${trc20Count} 个`);
	console.log(`  ✓ 持有 TRC-10 资产: ${trc10Count} 个`);

	assert.ok(trc20Count > 0, "应持有至少一个 TRC-20 代币");
	assert.ok(trc10Count > 0, "应持有至少一个 TRC-10 资产");
});
