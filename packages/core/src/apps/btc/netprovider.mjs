/**
 * BTC NetProvider Resolver
 * 根据网络名称和配置，创建统一的 provider 对象
 */

import { getBtcNetworkConfig } from "./config/networks.js";
import { createAdapter } from "./providers/adapter.mjs";

/**
 * 创建标准化的 BTC netProvider 对象
 * @param {string} networkName - 网络名称 (mainnet, testnet, signet, regtest)
 * @param {object} overrides - 配置覆盖
 * @returns {object} Provider 对象，包含实例方法和元数据
 */
export function createBtcNetProvider(networkName, overrides = {}) {
	const config = getBtcNetworkConfig(networkName);

	const mergedConfig = {
		...config,
		...overrides,
	};

	const adapter = createAdapter(mergedConfig);

	const provider = {
		// 元数据
		networkName: config.networkName,
		chain: "btc",
		providerType: config.providerType,
		walletName: config.walletName,
		isLocal: config.isLocal,
		isMainnet: config.isMainnet,
		isPublicTestnet: config.isPublicTestnet,

		// 网络配置
		rpcUrl: config.rpcUrl,
		restUrl: config.restUrl,
		explorerUrl: config.explorerUrl,

		// 适配器和能力
		adapter,

		/**
		 * 检查是否支持指定能力
		 */
		supports(capability) {
			return adapter.supports(capability);
		},

		/**
		 * 健康检查
		 */
		async healthcheck() {
			if (!adapter.supports("healthcheck")) {
				throw new Error(`${adapter.name} 不支持健康检查`);
			}
			return adapter.healthcheck();
		},

		/**
		 * bitcoind 专属：JSON-RPC 调用
		 */
		async rpcCall(method, params = []) {
			if (config.providerType !== "bitcoind") {
				throw new Error(
					`${adapter.name} 不支持通用 RPC 调用，请使用适配器方法`,
				);
			}
			return adapter.rpcCall(method, params);
		},

		/**
		 * bitcoind 专属：Wallet 范围 RPC 调用
		 */
		async walletRpcCall(method, params = []) {
			if (config.providerType !== "bitcoind") {
				throw new Error(
					`${adapter.name} 不支持 wallet RPC 调用`,
				);
			}
			return adapter.walletRpcCall(method, params);
		},
	};

	return Object.freeze(provider);
}

/**
 * 获取默认网络的 provider（根据环境变量或上下文）
 */
export function getDefaultBtcProvider() {
	return createBtcNetProvider();
}

/**
 * 根据网络名或现有 provider 解析为标准化 provider
 */
export function resolveBtcProvider(input) {
	if (input && typeof input === "object") {
		if (input.adapter && input.networkName) {
			// 已经是 provider 对象，直接返回
			return input;
		}

		// 如果有 networkName，用它创建新 provider
		if (input.networkName) {
			return createBtcNetProvider(input.networkName, input);
		}
	}

	// 如果是字符串，作为网络名
	if (typeof input === "string") {
		return createBtcNetProvider(input);
	}

	// 否则返回默认 provider
	return getDefaultBtcProvider();
}

export default {
	createBtcNetProvider,
	getDefaultBtcProvider,
	resolveBtcProvider,
};
