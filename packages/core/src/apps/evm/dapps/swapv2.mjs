/**
 * Uniswap V2 DApp Interface
 * 
 * 提供 UniswapV2 合约获取和部署接口：
 * - 按候选合约名获取 Router / Factory / Pair / WETH
 * - 一键部署完整 V2 套件
 */

import { buildDappGetters, getContractByNames, deployDappSuite } from "./dapp-resolver.mjs";

// ─── 候选合约名配置 ────────────────────────────────────────────────

const SWAP_V2_CONTRACTS = {
	router: {
		names: ["Router", "MockUniswapV2Router02"],
	},
	factory: {
		names: ["UniFactory", "MockUniswapV2Factory"],
	},
	pair: {
		names: ["MockUniswapV2FactoryUniswapV2Pair", "UniswapV2Pair", "PairV2"],
	},
	weth: {
		names: ["WETH"],
	},
};

// 构建 getters
const getters = buildDappGetters(SWAP_V2_CONTRACTS);

// ─── 公开接口 ────────────────────────────────────────────────────

/**
 * 获取 UniswapV2 Router 合约实例。
 * 
 * @param {string} address - 合约地址
 * @param {object} options - 透传给 deploy 的选项（支持 netProvider, runner, chainId 等）
 * @returns {Promise<Contract>}
 */
export async function routerV2(address, options = {}) {
	return getters.router(address, options);
}

/**
 * 获取 UniswapV2 Factory 合约实例。
 * 
 * @param {string} address - 合约地址
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<Contract>}
 */
export async function factoryV2(address, options = {}) {
	return getters.factory(address, options);
}

/**
 * 获取 UniswapV2 Pair 合约实例。
 * 
 * pair 地址必须传入（由 factory 动态创建）。
 * 
 * @param {string} address - Pair 合约地址
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<Contract>}
 * @throws {Error} - 当 address 未提供时
 */
export async function pairV2(address, options = {}) {
	if (!address) {
		throw new Error("pairV2 需要传入 pair 地址；V2 pair 通常由 factory 动态创建");
	}
	return getters.pair(address, options);
}

/**
 * 获取 WETH 合约实例。
 * 
 * @param {string} address - WETH 合约地址
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<Contract>}
 */
export async function wethContract(address, options = {}) {
	return getters.weth(address, options);
}

/**
 * 一键部署完整 UniswapV2 套件（WETH + Factory + Router）。
 * 
 * 仅在 dev 模式（Hardhat）下可用，因为需要编译和部署合约。
 *
 * config 中与部署无关的 netProvider 会在部署完成后
 * 传递给合约实例的获取调用，用于绑定指定 provider。
 *
 * @param {string|number} [feeTo] - factory 手续费接收地址
 *                                   默认使用 signer[0]（传 0 表示索引）
 * @param {object} [config] - 透传给 deploy 的配置
 * @returns {Promise<object>} - { weth, factory, router, contracts: { ... } }
 * 
 * @example
 * const result = await deploySwapV2(
 *   "0x1234...", // feeTo address
 *   { network: "hardhat" }
 * );
 */
export async function deploySwapV2(feeTo, config = {}) {
	const factoryOwner = feeTo ?? config.feeTo ?? 0;
	const { netProvider, ...deployConfig } = config;
	const contractOptions = netProvider ? { netProvider } : {};

	// 使用 deployDappSuite 按顺序部署
	const deployResult = await deployDappSuite(
		[
			{ name: "WETH", key: "weth" },
			{ name: "UniFactory", key: "factory", args: [factoryOwner] },
			{ name: "Router", args: ["${factory.address}", "${weth.address}"] },
		],
		deployConfig
	);

	// 获取部署的合约地址
	const weth = deployResult.weth;
	const factory = deployResult.factory;
	const router = deployResult.router;

	// 获取合约实例
	return {
		weth,
		factory,
		router,
		contracts: {
			weth: await wethContract(weth.address, contractOptions).catch(() => null),
			factory: await factoryV2(factory.address, contractOptions),
			router: await routerV2(router.address, contractOptions),
		},
	};
}

export default {
	routerV2,
	factoryV2,
	pairV2,
	wethContract,
	deploySwapV2,
};
