/**
 * DApp Contract Resolver - 通用接口抽象
 * 
 * 为 Uniswap V2/V3 等 DApp 提供通用的合约获取和部署模式：
 * 1. 按候选合约名尝试获取合约实例
 * 2. 统一的部署接口
 * 3. 支持链接多个相关合约的规范
 */

import { Contract } from "ethers";
import deploy from "../contracts/deploy.mjs";
import { loadContractArtifact } from "../contracts/load.mjs";

/**
 * 按候选名列表依次尝试获取合约。第一个成功则返回，全失败抛出聚合错误。
 * 
 * 通过尝试加载合约 ABI，然后使用 ethers Contract 类构造实例。
 * 
 * @param {Array<string>} candidates - 合约名候选列表（按优先级排序）
 * @param {string} address - 合约地址
 * @param {string} label - 用于错误消息的标签（如 "RouterV2"）
 * @param {object} options - 透传给合约实例的选项
 *   - runner: ethers Signer 或 Provider
 *   - provider: ethers Provider（如果没有 runner）
 * @returns {Promise<Contract>} - ethers Contract 实例
 * @throws {Error} - 当所有候选名都失败时
 */
export async function getContractByNames(candidates, address, label, options = {}) {
	if (!Array.isArray(candidates) || candidates.length === 0) {
		throw new Error(`${label}: 候选合约名列表不能为空`);
	}

	const errors = [];
	for (const contractName of candidates) {
		try {
			// 尝试加载合约 ABI
			const artifact = await loadContractArtifact({
				contractName,
				sourceName: options.sourceName,
				manifestPath: options.manifestPath,
			});

			const abi = artifact?.abi;
			if (!Array.isArray(abi) || abi.length === 0) {
				errors.push(`  - ${contractName}: ABI 为空`);
				continue;
			}

			// 使用 ethers Contract 构造实例
			const runner = options.runner || options.provider || null;
			const contractInstance = new Contract(address, abi, runner);
			return contractInstance;
		} catch (error) {
			errors.push(`  - ${contractName}: ${error.message}`);
		}
	}

	throw new Error(
		`${label} 获取失败，已尝试: ${candidates.join(", ")}。\n${errors.join("\n")}`
	);
}

/**
 * 为一组相关合约创建 getters。
 * 
 * @param {object} specs - 合约规范对象，key 为 getter 函数名，value 为:
 *   { names: Array<string>, address?: string, required?: boolean }
 *   - names: 候选合约名列表
 *   - address: 合约地址（可选，由调用方提供）
 *   - required: 是否必需（默认 true）
 * 
 * @example
 * const getters = buildDappGetters({
 *   router: { names: ["SwapRouter", "RouterV3"] },
 *   factory: { names: ["UniswapV3Factory", "FactoryV3"] },
 *   quoter: { names: ["Quoter"], required: true }
 * });
 * 
 * const router = await getters.router(address, options);
 */
export function buildDappGetters(specs = {}) {
	const getters = {};

	for (const [methodName, spec] of Object.entries(specs)) {
		const { names: candidates, required = true } = spec;
		
		if (!Array.isArray(candidates) || candidates.length === 0) {
			throw new Error(`buildDappGetters: spec.${methodName}.names 必须是非空数组`);
		}

		getters[methodName] = async (address, options = {}) => {
			if (!address) {
				if (required) {
					throw new Error(`${methodName} 需要传入地址`);
				}
				return null;
			}

			return getContractByNames(
				candidates,
				address,
				methodName.charAt(0).toUpperCase() + methodName.slice(1),
				options
			);
		};
	}

	return getters;
}

/**
 * 一键部署 DApp 合约套件。
 * 
 * @param {Array<{name: string, args: Array, key?: string}>} deploymentPlan - 部署计划
 *   - name: 合约名
 *   - args: 构造函数参数（可包含对先前部署结果的引用）
 *   - key: 结果中的键名（默认为 name 的小驼峰写法）
 * 
 * @param {object} options - 透传给 deploy 的选项
 * @returns {Promise<object>} - { <key>: {...deployResult, contract}, ... }
 * 
 * @example
 * const result = await deployDappSuite([
 *   { name: "WETH" },
 *   { name: "UniFactory", args: ["address of factory owner"] },
 *   { name: "Router", args: ["${factory.address}", "${weth.address}"] }
 * ], options);
 */
export async function deployDappSuite(deploymentPlan, options = {}) {
	if (!Array.isArray(deploymentPlan)) {
		throw new Error("deploymentPlan 必须是数组");
	}

	const results = {};

	for (const step of deploymentPlan) {
		const { name, args = [], key: explicitKey } = step;
		const key = explicitKey || (name.charAt(0).toLowerCase() + name.slice(1));

		// 处理参数中的引用（如 "${factory.address}" -> factory.address）
		const resolvedArgs = (args || []).map(arg => {
			if (typeof arg === "string" && arg.startsWith("${") && arg.endsWith("}")) {
				const path = arg.slice(2, -1); // 去掉 ${ 和 }
				let value = results;
				for (const segment of path.split(".")) {
					value = value?.[segment];
				}
				return value;
			}
			return arg;
		});

		// 调用 deploy
		const deployResult = await deploy(name, resolvedArgs, options);

		results[key] = {
			...deployResult,
			contract: deployResult.contract ?? deployResult, // 处理返回值可能是 Contract 或对象
		};
	}

	return results;
}

export default {
	getContractByNames,
	buildDappGetters,
	deployDappSuite,
};
