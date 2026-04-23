/**
 * BTC Core API 示例
 * 演示主网和测试网的地址余额查询
 */

import {
	btcBalanceGet,
	btcProviderSummary,
	resolveBtcProvider,
} from "../apps/btc/index.mjs";

// 测试地址
const MAINNET_P2PKH = "13Q1WmqLg5CQHtPCYdH3YXboWu26G79FWi"; // 主网 P2PKH
const MAINNET_TAPROOT = "bc1pxaneaf3w4d27hl2y93fuft2xk6m4u3wc4rafevc6slgd7f5tq2dqyfgy06"; // 主网 Taproot
const TESTNET_TAPROOT = "tb1p2260r7y6r4lya5ds8lvwwdhccvg4u3qjtxxl7a2ayhvmy4uck3gqc6zhsk"; // 测试网 Taproot

async function queryMainnetAddresses() {
	console.log("\n========== 主网查询 (Mainnet) ==========\n");

	try {
		// 查询 provider 配置
		const summary = await btcProviderSummary("mainnet");
		console.log("Provider 信息:");
		console.log(`  网络: ${summary.networkName}`);
		console.log(`  类型: ${summary.providerType}`);
		console.log(`  名称: ${summary.name}`);
		console.log(`  REST: ${summary.restUrl}`);

		// P2PKH 地址查询
		console.log(`\n查询 P2PKH 地址: ${MAINNET_P2PKH}`);
		try {
			const p2pkhBalance = await btcBalanceGet(
				{ addresses: [MAINNET_P2PKH] },
				"mainnet",
			);

			console.log(`  ✓ 查询成功:`);
			p2pkhBalance.rows.forEach((row) => {
				console.log(`    地址: ${row.address}`);
				console.log(`    确认余额: ${row.confirmed} BTC`);
				console.log(`    未确认余额: ${row.unconfirmed} BTC`);
				console.log(`    总余额: ${row.total} BTC`);
				console.log(`    UTXO 数: ${row.utxoCount}`);
			});
		} catch (error) {
			console.log(`  ❌ 查询失败: ${error.message}`);
		}

		// Taproot 地址查询
		console.log(`\n查询 Taproot 地址: ${MAINNET_TAPROOT}`);
		console.log(`  ℹ 提示: Taproot 地址可能由于 mempool.space API 限制而查询失败`);
		try {
			const taprootBalance = await btcBalanceGet(
				{ addresses: [MAINNET_TAPROOT] },
				"mainnet",
			);

			console.log(`  ✓ 查询成功:`);
			taprootBalance.rows.forEach((row) => {
				console.log(`    地址: ${row.address}`);
				console.log(`    确认余额: ${row.confirmed} BTC`);
				console.log(`    未确认余额: ${row.unconfirmed} BTC`);
				console.log(`    总余额: ${row.total} BTC`);
				console.log(`    UTXO 数: ${row.utxoCount}`);
			});
		} catch (error) {
			console.log(`  ⚠ 查询失败 (可尝试用 Bitcoin Core 或 blockbook): ${error.message}`);
		}
	} catch (error) {
		console.error(`主网查询出错: ${error.message}`);
	}
}

async function queryTestnetAddresses() {
	console.log("\n========== 测试网查询 (Testnet) ==========\n");

	try {
		// 查询 provider 配置
		const summary = await btcProviderSummary("testnet");
		console.log("Provider 信息:");
		console.log(`  网络: ${summary.networkName}`);
		console.log(`  类型: ${summary.providerType}`);
		console.log(`  名称: ${summary.name}`);
		console.log(`  REST: ${summary.restUrl}`);

		// Taproot 地址查询
		console.log(`\n查询 Taproot 地址: ${TESTNET_TAPROOT}`);
		try {
			const balance = await btcBalanceGet(
				{ addresses: [TESTNET_TAPROOT] },
				"testnet",
			);

			console.log(`  ✓ 查询成功:`);
			balance.rows.forEach((row) => {
				console.log(`    地址: ${row.address}`);
				console.log(`    确认余额: ${row.confirmed} BTC`);
				console.log(`    未确认余额: ${row.unconfirmed} BTC`);
				console.log(`    总余额: ${row.total} BTC`);
				console.log(`    UTXO 数: ${row.utxoCount}`);
			});
		} catch (error) {
			console.log(`  ❌ 查询失败: ${error.message}`);
		}
	} catch (error) {
		console.error(`测试网查询出错: ${error.message}`);
	}
}

async function main() {
	console.log("🔗 BTC Core API 示例 - 地址余额查询\n");
	console.log("地址列表:");
	console.log(`  主网 P2PKH: ${MAINNET_P2PKH}`);
	console.log(`  主网 Taproot: ${MAINNET_TAPROOT}`);
	console.log(`  测试网 Taproot: ${TESTNET_TAPROOT}`);

	// 检查环境配置
	console.log("\n检查 provider 配置:");
	try {
		const mainnetProvider = resolveBtcProvider("mainnet");
		console.log(
			`✓ 主网 provider 已准备 (type: ${mainnetProvider.providerType})`,
		);
	} catch (error) {
		console.warn(`⚠ 主网 provider 配置可能有问题: ${error.message}`);
	}

	try {
		const testnetProvider = resolveBtcProvider("testnet");
		console.log(
			`✓ 测试网 provider 已准备 (type: ${testnetProvider.providerType})`,
		);
	} catch (error) {
		console.warn(`⚠ 测试网 provider 配置可能有问题: ${error.message}`);
	}

	// 执行查询
	await queryMainnetAddresses();
	await queryTestnetAddresses();

	console.log("\n✓ 查询完成\n");
}

// 运行
main().catch((error) => {
	console.error("❌ 执行错误:", error);
	process.exit(1);
});
