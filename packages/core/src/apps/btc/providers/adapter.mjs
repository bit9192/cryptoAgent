/**
 * BTC Provider 适配器工厂
 * 根据 provider 类型创建对应的适配器实例
 */

import BitcoinCoreAdapter from "./bitcoind.mjs";
import MempoolAdapter from "./mempool.mjs";
import BlockbookAdapter from "./blockbook.mjs";
import { getProviderDefaults } from "./defaults.mjs";

/**
 * 根据 network config 创建适配器
 */
export function createAdapter(networkConfig = {}) {
	const providerType = String(networkConfig.providerType || "bitcoind").trim().toLowerCase();

	try {
		switch (providerType) {
			case "bitcoind":
			case "bitcoin-core":
			case "core":
				return new BitcoinCoreAdapter(networkConfig);

			case "mempool":
			case "mempool.space":
				return new MempoolAdapter(networkConfig);

			case "blockbook":
			case "trezor":
				return new BlockbookAdapter(networkConfig);

			default:
				throw new Error(
					`不支持的 BTC provider 类型: ${providerType}。支持: bitcoind, mempool, blockbook`,
				);
		}
	} catch (error) {
		if (error.message.includes("不支持的")) {
			throw error;
		}
		throw new Error(`创建 BTC provider 适配器失败 [${providerType}]: ${error.message}`);
	}
}

/**
 * 检查适配器是否支持某个能力
 */
export function checkCapability(adapter, capability) {
	if (!adapter) {
		throw new Error("adapter 不能为空");
	}

	if (typeof adapter.supports !== "function") {
		throw new Error("adapter 必须实现 supports 方法");
	}

	const supported = adapter.supports(capability);

	return {
		supported,
		message: supported
			? undefined
			: `${adapter.name} 不支持 ${capability} 操作`,
	};
}

/**
 * 列出适配器支持的所有能力
 */
export function listCapabilities(adapter) {
	if (!adapter) {
		throw new Error("adapter 不能为空");
	}

	const defaults = getProviderDefaults(adapter.providerType);
	const caps = defaults.supportsCapabilities;

	return {
		providerType: adapter.providerType,
		name: adapter.name,
		supported: Object.keys(caps).filter((cap) => caps[cap] === true),
		unsupported: Object.keys(caps).filter((cap) => caps[cap] !== true),
	};
}

export default {
	createAdapter,
	checkCapability,
	listCapabilities,
};
