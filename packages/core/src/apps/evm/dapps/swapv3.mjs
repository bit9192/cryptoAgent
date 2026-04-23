/**
 * Uniswap V3 DApp Interface
 * 
 * 提供 UniswapV3 合约获取和部署接口：
 * - 按候选合约名获取 Router / Factory / Pool / Quoter / PositionManager / WETH
 * - 一键部署完整 V3 套件
 */

import { buildDappGetters, getContractByNames, deployDappSuite } from "./dapp-resolver.mjs";

// ─── 候选合约名配置 ────────────────────────────────────────────────

const SWAP_V3_CONTRACTS = {
	router: {
		names: ["SwapRouter", "RouterV3"],
	},
	factory: {
		names: ["UniswapV3Factory", "FactoryV3"],
	},
	pool: {
		names: ["UniswapV3Pool", "PairV3"],
	},
	quoter: {
		names: ["Quoter"],
	},
	quoterV2: {
		names: ["QuoterV2"],
	},
	positionManager: {
		names: ["NonfungiblePositionManager"],
	},
	weth: {
		names: ["WETH"],
	},
};

// 构建 getters
const getters = buildDappGetters(SWAP_V3_CONTRACTS);

// ─── 公开接口 ────────────────────────────────────────────────────

/**
 * 获取 UniswapV3 Router 合约实例。
 * 
 * @param {string} address - 合约地址
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<Contract>}
 */
export async function routerV3(address, options = {}) {
	return getters.router(address, options);
}

/**
 * 获取 UniswapV3 Factory 合约实例。
 * 
 * @param {string} address - 合约地址
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<Contract>}
 */
export async function factoryV3(address, options = {}) {
	return getters.factory(address, options);
}

/**
 * 获取 UniswapV3 Pool 合约实例。
 * 
 * pool 地址必须传入（由 factory 动态创建）。
 * 
 * @param {string} address - Pool 合约地址
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<Contract>}
 * @throws {Error} - 当 address 未提供时
 */
export async function poolV3(address, options = {}) {
	if (!address) {
		throw new Error("poolV3 需要传入 pool 地址；V3 pool 通常由 factory 动态创建");
	}
	return getters.pool(address, options);
}

/**
 * 获取 UniswapV3 Quoter (v1) 合约实例。
 * 
 * @param {string} address - Quoter 合约地址
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<Contract>}
 */
export async function quoterV3(address, options = {}) {
	return getters.quoter(address, options);
}

/**
 * 获取 UniswapV3 Quoter (v2) 合约实例。
 * 
 * @param {string} address - QuoterV2 合约地址
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<Contract>}
 */
export async function quoterV3_2(address, options = {}) {
	return getters.quoterV2(address, options);
}

/**
 * 获取 UniswapV3 NonFungiblePositionManager 合约实例。
 * 
 * @param {string} address - NonfungiblePositionManager 合约地址
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<Contract>}
 */
export async function positionManagerV3(address, options = {}) {
	return getters.positionManager(address, options);
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
 * 一键部署完整 UniswapV3 套件（WETH + Factory + Router + Quoter + QuoterV2 + PositionManager）。
 * 
 * 仅在 dev 模式（Hardhat）下可用。
 *
 * @param {object} [config] - 透传给 deploy 的配置
 * @returns {Promise<object>} - { weth, factory, router, quoter, quoterV2, positionManager, contracts: { ... } }
 * 
 * @example
 * const result = await deploySwapV3({ network: "hardhat" });
 */
export async function deploySwapV3(config = {}) {
	const { netProvider, ...deployConfig } = config;
	const contractOptions = netProvider ? { netProvider } : {};

	// 使用 deployDappSuite 按顺序部署
	const deployResult = await deployDappSuite(
		[
			{ name: "WETH", key: "weth" },
			{ name: "UniswapV3Factory", key: "factory" },
			{ name: "SwapRouter", key: "router", args: ["${factory.address}", "${weth.address}"] },
			{ name: "Quoter", key: "quoter", args: ["${factory.address}"] },
			{ name: "QuoterV2", args: ["${factory.address}"] },
			{ name: "NonfungiblePositionManager", key: "positionManager", args: ["${factory.address}", "${weth.address}"] },
		],
		deployConfig
	);

	// 获取部署的合约引用
	const weth = deployResult.weth;
	const factory = deployResult.factory;
	const router = deployResult.router;
	const quoter = deployResult.quoter;
	const quoterV2 = deployResult.quoterV2;
	const positionManager = deployResult.positionManager;

	// 获取合约实例
	return {
		weth,
		factory,
		router,
		quoter,
		quoterV2,
		positionManager,
		contracts: {
			weth: await wethContract(weth.address, contractOptions).catch(() => null),
			factory: await factoryV3(factory.address, contractOptions),
			router: await routerV3(router.address, contractOptions),
			quoter: await quoterV3(quoter.address, contractOptions),
			quoterV2: await quoterV3_2(quoterV2.address, contractOptions),
			positionManager: await positionManagerV3(positionManager.address, contractOptions),
		},
	};
}

export default {
	routerV3,
	factoryV3,
	poolV3,
	quoterV3,
	quoterV3_2,
	positionManagerV3,
	wethContract,
	deploySwapV3,
};
