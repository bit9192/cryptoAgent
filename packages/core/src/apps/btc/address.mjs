import * as bitcoin from "bitcoinjs-lib";

const BTC_NETWORK_ALIASES = {
	main: "mainnet",
	mainnet: "mainnet",
	bitcoin: "mainnet",
	livenet: "mainnet",
	test: "testnet",
	testnet: "testnet",
	signet: "testnet",
	regtest: "regtest",
	reg: "regtest",
};

const BTC_NETWORK_CONFIG = {
	mainnet: {
		name: "mainnet",
		pubKeyHash: bitcoin.networks.bitcoin.pubKeyHash,
		scriptHash: bitcoin.networks.bitcoin.scriptHash,
		bech32: bitcoin.networks.bitcoin.bech32,
	},
	testnet: {
		name: "testnet",
		pubKeyHash: bitcoin.networks.testnet.pubKeyHash,
		scriptHash: bitcoin.networks.testnet.scriptHash,
		bech32: bitcoin.networks.testnet.bech32,
	},
	regtest: {
		name: "regtest",
		// regtest 的 Base58 前缀与 testnet 相同，bech32 前缀不同
		pubKeyHash: bitcoin.networks.regtest.pubKeyHash,
		scriptHash: bitcoin.networks.regtest.scriptHash,
		bech32: bitcoin.networks.regtest.bech32,
	},
};

function normalizeBtcAddressNetworkName(input) {
	const key = String(input ?? "mainnet").trim().toLowerCase();
	const normalized = BTC_NETWORK_ALIASES[key];
	if (!normalized) {
		throw new Error(`不支持的 BTC 网络: ${input}`);
	}
	return normalized;
}

function detectNetworkFromBase58(version) {
	if (version === BTC_NETWORK_CONFIG.mainnet.pubKeyHash || version === BTC_NETWORK_CONFIG.mainnet.scriptHash) {
		return "mainnet";
	}
	// testnet / regtest 的 Base58 前缀相同
	return "testnet";
}

function detectNetworkFromBech32(prefix) {
	const raw = String(prefix ?? "").toLowerCase();
	if (raw === BTC_NETWORK_CONFIG.mainnet.bech32) return "mainnet";
	if (raw === BTC_NETWORK_CONFIG.testnet.bech32) return "testnet";
	if (raw === BTC_NETWORK_CONFIG.regtest.bech32) return "regtest";
	throw new Error(`未知 bech32 前缀: ${prefix}`);
}

/**
 * 解析 BTC 地址信息。
 *
 * @param {string} addressInput BTC 地址
 * @returns {{
 *   address: string,
 *   format: "base58"|"bech32",
 *   kind: "p2pkh"|"p2sh"|"segwit",
 *   network: "mainnet"|"testnet"|"regtest",
 *   version?: number,
 *   witnessVersion?: number,
 *   hash: Buffer,
 * }}
 */
export function parseBtcAddress(addressInput) {
	const address = String(addressInput ?? "").trim();
	if (!address) {
		throw new Error("address 不能为空");
	}

	try {
		const decoded = bitcoin.address.fromBase58Check(address);
		const kind = decoded.version === BTC_NETWORK_CONFIG.mainnet.scriptHash
			|| decoded.version === BTC_NETWORK_CONFIG.testnet.scriptHash
			|| decoded.version === BTC_NETWORK_CONFIG.regtest.scriptHash
			? "p2sh"
			: "p2pkh";

		return {
			address,
			format: "base58",
			kind,
			network: detectNetworkFromBase58(decoded.version),
			version: decoded.version,
			hash: decoded.hash,
		};
	} catch {
		// fallback bech32
	}

	try {
		const decoded = bitcoin.address.fromBech32(address);
		return {
			address,
			format: "bech32",
			kind: "segwit",
			network: detectNetworkFromBech32(decoded.prefix),
			witnessVersion: decoded.version,
			hash: Buffer.from(decoded.data),
		};
	} catch {
		throw new Error(`无效 BTC 地址: ${addressInput}`);
	}
}

function encodeByNetwork(parsed, networkName) {
	const cfg = BTC_NETWORK_CONFIG[networkName];

	if (parsed.format === "base58") {
		const version = parsed.kind === "p2sh" ? cfg.scriptHash : cfg.pubKeyHash;
		return bitcoin.address.toBase58Check(parsed.hash, version);
	}

	return bitcoin.address.toBech32(parsed.hash, parsed.witnessVersion ?? 0, cfg.bech32);
}

/**
 * 将 BTC 地址转换到目标网络格式。
 *
 * @param {string} addressInput 输入地址
 * @param {string} targetNetwork 目标网络: mainnet/testnet/regtest
 * @returns {{
 *   input: string,
 *   sourceNetwork: string,
 *   targetNetwork: string,
 *   format: string,
 *   kind: string,
 *   output: string,
 * }}
 */
export function convertBtcAddressNetwork(addressInput, targetNetwork = "testnet") {
	const parsed = parseBtcAddress(addressInput);
	const normalizedTarget = normalizeBtcAddressNetworkName(targetNetwork);

	return {
		input: parsed.address,
		sourceNetwork: parsed.network,
		targetNetwork: normalizedTarget,
		format: parsed.format,
		kind: parsed.kind,
		output: encodeByNetwork(parsed, normalizedTarget),
	};
}

/**
 * 输入一个 BTC 地址，返回主网/测试网/回归网三种格式。
 *
 * @param {string} addressInput 输入地址
 * @returns {{
 *   input: string,
 *   sourceNetwork: string,
 *   format: string,
 *   kind: string,
 *   mainnet: string,
 *   testnet: string,
 *   regtest: string,
 * }}
 */
export function convertBtcAddressAllNetworks(addressInput) {
	const parsed = parseBtcAddress(addressInput);

	return {
		input: parsed.address,
		sourceNetwork: parsed.network,
		format: parsed.format,
		kind: parsed.kind,
		mainnet: encodeByNetwork(parsed, "mainnet"),
		testnet: encodeByNetwork(parsed, "testnet"),
		regtest: encodeByNetwork(parsed, "regtest"),
	};
}

export {
	normalizeBtcAddressNetworkName,
};

export default {
	parseBtcAddress,
	convertBtcAddressNetwork,
	convertBtcAddressAllNetworks,
	normalizeBtcAddressNetworkName,
};
