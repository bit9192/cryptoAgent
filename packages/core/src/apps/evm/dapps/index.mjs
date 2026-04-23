/**
 * EVM DApps - 去中心化应用合约接口集合
 * 
 * 包含常见 DApp（Uniswap V2/V3 等）的合约获取和部署接口
 */

export * as swapV2 from "./swapv2.mjs";
export * as swapV3 from "./swapv3.mjs";
export { default as dappResolver } from "./dapp-resolver.mjs";
export { buildDappGetters, getContractByNames, deployDappSuite } from "./dapp-resolver.mjs";

export default {
	swapV2: (await import("./swapv2.mjs")).default,
	swapV3: (await import("./swapv3.mjs")).default,
	dappResolver: (await import("./dapp-resolver.mjs")).default,
};
