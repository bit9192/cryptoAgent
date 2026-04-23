/**
 * BTC provider 默认配置和能力矩阵
 * 定义各种 provider 支持的操作能力
 */

export const PROVIDER_DEFAULTS = {
	bitcoind: {
		name: "Bitcoin Core",
		providerType: "bitcoind",
		authMethod: "basic",
		supportsCapabilities: {
			healthcheck: true,
			getBlock: true,
			getTx: true,
			getUtxos: true,
			estimateFee: true,
			sendTx: true,
			signTx: true,
			buildPsbt: true,
			walletOps: true,
		},
	},

	mempool: {
		name: "Mempool API",
		providerType: "mempool",
		authMethod: "header",
		supportsCapabilities: {
			healthcheck: true,
			getBlock: true,
			getTx: true,
			getUtxos: true,
			estimateFee: true,
			sendTx: true,
			signTx: false,
			buildPsbt: false,
			walletOps: false,
		},
	},

	blockbook: {
		name: "BlockBook",
		providerType: "blockbook",
		authMethod: "none",
		supportsCapabilities: {
			healthcheck: true,
			getBlock: true,
			getTx: true,
			getUtxos: true,
			estimateFee: true,
			sendTx: true,
			signTx: false,
			buildPsbt: false,
			walletOps: false,
		},
	},

	blockchair: {
		name: "BlockChair API",
		providerType: "blockchair",
		authMethod: "query",
		supportsCapabilities: {
			healthcheck: true,
			getBlock: true,
			getTx: true,
			getUtxos: false,
			estimateFee: false,
			sendTx: false,
			signTx: false,
			buildPsbt: false,
			walletOps: false,
		},
	},
};

/**
 * 获取 provider 的默认配置
 */
export function getProviderDefaults(providerType) {
	const normalized = String(providerType || "bitcoind").trim().toLowerCase();
	const defaults = PROVIDER_DEFAULTS[normalized];
	if (!defaults) {
		throw new Error(`不支持的 BTC provider 类型: ${providerType}`);
	}
	return defaults;
}

/**
 * 检查 provider 是否支持指定能力
 */
export function providerSupports(providerType, capability) {
	const defaults = getProviderDefaults(providerType);
	return defaults.supportsCapabilities[capability] === true;
}

/**
 * 获取 provider 不支持的能力列表
 */
export function getUnsupportedCapabilities(providerType) {
	const defaults = getProviderDefaults(providerType);
	return Object.keys(defaults.supportsCapabilities).filter(
		(cap) => defaults.supportsCapabilities[cap] !== true,
	);
}

export default {
	PROVIDER_DEFAULTS,
	getProviderDefaults,
	providerSupports,
	getUnsupportedCapabilities,
};
