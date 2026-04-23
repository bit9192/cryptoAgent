/**
 * TRX Core API 示例
 * 演示 TRON 网络的地址查询
 */

import { getTrxNetworkConfig } from "../apps/trx/config/networks.js";

// 测试地址
const TEST_ADDRESS = "TTfXBJ1ssA2MTXTgdesjLddcYy4ccw4QGp";

async function fetchTrxAddress(address, networkName = "mainnet") {
	const config = getTrxNetworkConfig(networkName);
	const url = `${config.rpcUrl}/v1/accounts/${address}`;

	const headers = {
		accept: "application/json",
		...(config.apiKey ? { "TRON-PRO-API-KEY": config.apiKey } : {}),
	};

	try {
		const response = await fetch(url, { headers });

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return response.json();
	} catch (error) {
		throw new Error(`查询失败: ${error.message}`);
	}
}

async function queryMainnetAddress() {
	console.log("\n========== 主网查询 (Mainnet) ==========\n");

	try {
		const config = getTrxNetworkConfig("mainnet");
		console.log("Network 信息:");
		console.log(`  网络: ${config.networkName}`);
		console.log(`  RPC: ${config.rpcUrl}`);
		console.log(`  Explorer: ${config.explorerUrl}`);
		console.log(`  ChainId: ${config.chainId}`);

		console.log(`\n查询地址: ${TEST_ADDRESS}`);

		const response = await fetchTrxAddress(TEST_ADDRESS, "mainnet");

		// 处理响应格式：可能是 {data: [...], success: true} 或直接是账户信息
		let accountInfo = response.data?.[0] || response;

		if (accountInfo?.address) {
			const balanceTrx = (accountInfo.balance || 0) / 1e6; // Sun to TRX (1 TRX = 10^6 Sun)
			const createTime = accountInfo.create_time
				? new Date(accountInfo.create_time).toISOString()
				: "未知";

			console.log(`  ✓ 查询成功:`);
			console.log(`    地址: ${accountInfo.address || TEST_ADDRESS}`);
			console.log(`    TRX 余额: ${balanceTrx} TRX`);
			console.log(`    账户创建: ${createTime}`);

			// Token 资产（TRC-20）
			if (Array.isArray(accountInfo.trc20) && accountInfo.trc20.length > 0) {
				console.log(`    TRC-20 代币数: ${accountInfo.trc20.length}`);
				accountInfo.trc20.slice(0, 5).forEach((token, idx) => {
					const tokenAddr = Object.keys(token)[0];
					const tokenBalance = token[tokenAddr];
					console.log(
						`      ${idx + 1}. ${tokenAddr}: ${tokenBalance}`
					);
				});
				if (accountInfo.trc20.length > 5) {
					console.log(`      ... 及 ${accountInfo.trc20.length - 5} 个其他代币`);
				}
			}

			// TRC-10 资产
			if (
				Array.isArray(accountInfo.assetV2) &&
				accountInfo.assetV2.length > 0
			) {
				console.log(`    TRC-10 资产数: ${accountInfo.assetV2.length}`);
				const totalTrc10Value = accountInfo.assetV2.reduce(
					(sum, asset) => sum + (asset.value || 0),
					0
				);
				console.log(`    TRC-10 总价值: ${totalTrc10Value}`);
			}

			// 冻结资源信息
			if (
				Array.isArray(accountInfo.frozenV2) &&
				accountInfo.frozenV2.length > 0
			) {
				const hasFrozen = accountInfo.frozenV2.some(
					(f) => Object.keys(f).length > 0
				);
				if (hasFrozen) {
					console.log(`    冻结资源: 是`);
					accountInfo.frozenV2.forEach((frozen) => {
						if (frozen.type) {
							console.log(`      - ${frozen.type}`);
						}
					});
				}
			}

			// 网络资源信息
			if (accountInfo.account_resource) {
				console.log(`    账户资源信息:`);
				if (accountInfo.account_resource.latest_consume_time_for_energy) {
					const lastEnergyTime = new Date(
						accountInfo.account_resource.latest_consume_time_for_energy
					).toISOString();
					console.log(`      最后消耗 energy: ${lastEnergyTime}`);
				}
				if (accountInfo.account_resource.energy_window_size) {
					console.log(
						`      Energy 窗口大小: ${accountInfo.account_resource.energy_window_size}ms`
					);
				}
			}

			// 权限信息
			if (accountInfo.owner_permission) {
				console.log(`    权限信息:`);
				console.log(
					`      Owner 权限: ${accountInfo.owner_permission.permission_name} (阈值: ${accountInfo.owner_permission.threshold})`
				);
				if (Array.isArray(accountInfo.owner_permission.keys)) {
					console.log(
						`        签名者: ${accountInfo.owner_permission.keys.length}`
					);
				}
			}

			// 最后交易时间
			if (
				accountInfo.latest_opration_time ||
				accountInfo.latest_operation_time
			) {
				const lastTime =
					accountInfo.latest_opration_time ||
					accountInfo.latest_operation_time;
				const lastTxDate = new Date(lastTime).toISOString();
				console.log(`    最后交易时间: ${lastTxDate}`);
			}

			// 免费带宽信息
			if (accountInfo.free_net_usage !== undefined) {
				console.log(
					`    已用免费带宽: ${accountInfo.free_net_usage} bytes`
				);
			}
		} else {
			console.log(`  ❌ 无法解析账户信息`);
		}
	} catch (error) {
		console.error(`  ❌ 查询失败: ${error.message}`);
	}
}

async function queryNileTestnet() {
	console.log("\n========== Nile 测试网查询 ==========\n");

	try {
		const config = getTrxNetworkConfig("nile");
		console.log("Network 信息:");
		console.log(`  网络: ${config.networkName}`);
		console.log(`  RPC: ${config.rpcUrl}`);
		console.log(`  ChainId: ${config.chainId}`);

		console.log(`\n查询地址: ${TEST_ADDRESS}`);

		const response = await fetchTrxAddress(TEST_ADDRESS, "nile");
		const accountInfo = response.data?.[0] || response;

		if (accountInfo?.address || (response.data && response.success)) {
			const balanceTrx = (accountInfo.balance || 0) / 1e6;

			console.log(`  ✓ 查询成功:`);
			console.log(
				`    地址: ${accountInfo.address || TEST_ADDRESS}`
			);
			console.log(`    TRX 余额: ${balanceTrx} TRX`);

			if (Array.isArray(accountInfo.trc20)) {
				console.log(
					`    TRC-20 代币数: ${accountInfo.trc20.length}`
				);
			}

			if (
				Array.isArray(accountInfo.assetV2) &&
				accountInfo.assetV2.length > 0
			) {
				console.log(
					`    TRC-10 资产数: ${accountInfo.assetV2.length}`
				);
			}
		} else {
			console.log(
				`  ℹ 暂无该地址的数据（测试网）`
			);
		}
	} catch (error) {
		console.error(`  ❌ 查询失败: ${error.message}`);
	}
}

async function main() {
	console.log("🔗 TRX Core API 示例 - 地址查询\n");
	console.log("测试地址:");
	console.log(`  ${TEST_ADDRESS}`);

	// 检查网络配置
	console.log("\n检查 network 配置:");
	try {
		const mainnetConfig = getTrxNetworkConfig("mainnet");
		console.log(
			`✓ 主网已配置 (RPC: ${mainnetConfig.rpcUrl})`
		);
	} catch (error) {
		console.warn(`⚠ 主网配置可能有问题: ${error.message}`);
	}

	try {
		const nileConfig = getTrxNetworkConfig("nile");
		console.log(
			`✓ Nile 测试网已配置 (RPC: ${nileConfig.rpcUrl})`
		);
	} catch (error) {
		console.warn(`⚠ Nile 配置可能有问题: ${error.message}`);
	}

	// 执行查询
	await queryMainnetAddress();
	await queryNileTestnet();

	console.log("\n✓ 查询完成\n");
}

// 运行
main().catch((error) => {
	console.error("❌ 执行错误:", error);
	process.exit(1);
});
