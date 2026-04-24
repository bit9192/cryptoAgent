import { Interface, getAddress } from "ethers";

import { resolveEvmContract } from "../configs/contracts.js";
import { EvmContract } from "../contracts/deploy.mjs";
import { createErc20 } from "../erc20.mjs";
import { multiCall, MULTICALL_REQUEST_SYMBOL } from "../multicall.mjs";

const NATIVE_TOKEN_ADDRESS = "native";
const ERC20_BALANCE_ABI = [
	"function balanceOf(address) view returns (uint256)",
];
const MULTICALL_NATIVE_BALANCE_INTERFACE = new Interface([
	"function getEthBalance(address) view returns (uint256)",
]);

function normalizeAddress(value, fieldName) {
	const raw = String(value ?? "").trim();
	if (!raw) {
		throw new Error(`${fieldName} 不能为空`);
	}
	return getAddress(raw);
}

function resolveMulticallClient(options = {}) {
	if (options.multicall && typeof options.multicall.call === "function") {
		return options.multicall;
	}
	const config = typeof options.getContract === "function"
		? { getContract: options.getContract }
		: {};
	return multiCall(config);
}

function resolveMulticallAddress(options = {}) {
	const explicit = String(options.multicallAddress ?? "").trim();
	if (explicit) {
		return normalizeAddress(explicit, "multicallAddress");
	}
	return getAddress(resolveEvmContract({
		key: "multicall3",
		network: options.networkName ?? options.network,
		chainId: options.chainId,
		forkSourceChainId: options.forkSourceChainId,
		overrides: options.contractOverrides,
	}));
}

function buildBalanceCallRequest(tokenAddress, ownerAddress) {
	const token = new EvmContract(tokenAddress, ERC20_BALANCE_ABI, null);
	const request = token.calls.balanceOf(ownerAddress);
	request[MULTICALL_REQUEST_SYMBOL] = true;
	return request;
}

function buildNativeBalanceCallRequest(multicallAddress, ownerAddress) {
	const fragment = MULTICALL_NATIVE_BALANCE_INTERFACE.getFunction("getEthBalance");
	return {
		target: multicallAddress,
		iface: MULTICALL_NATIVE_BALANCE_INTERFACE,
		fragment,
		method: "getEthBalance",
		args: [ownerAddress],
		callData: MULTICALL_NATIVE_BALANCE_INTERFACE.encodeFunctionData(fragment, [ownerAddress]),
		[MULTICALL_REQUEST_SYMBOL]: true,
	};
}

function normalizeTokenRef(tokenValue) {
	const raw = String(tokenValue ?? "").trim();
	if (!raw) {
		throw new Error("token 不能为空");
	}
	if (raw.toLowerCase() === NATIVE_TOKEN_ADDRESS) {
		return NATIVE_TOKEN_ADDRESS;
	}
	return normalizeAddress(raw, "token");
}

function normalizeBalancePairs(input = []) {
	if (!Array.isArray(input)) {
		throw new Error("batch 输入必须是数组");
	}
	return input.map((item) => ({
		chain: "evm",
		ownerAddress: normalizeAddress(item?.address, "address"),
		tokenAddress: normalizeTokenRef(item?.token),
	}));
}

export async function queryEvmTokenBalance(input = {}) {
	const ownerAddress = normalizeAddress(input.ownerAddress, "ownerAddress");
	const tokenAddress = normalizeAddress(input.tokenAddress, "tokenAddress");
	const token = createErc20({
		...input,
		address: tokenAddress,
	});
	const balance = await token.balanceOf(ownerAddress);

	return {
		chain: "evm",
		tokenAddress,
		ownerAddress,
		balance,
	};
}

export async function queryEvmTokenBalanceBatch(input = [], options = {}) {
	const pairs = normalizeBalancePairs(input);
	if (pairs.length === 0) {
		return {
			ok: true,
			items: [],
		};
	}
	const multicallClient = resolveMulticallClient(options);
	const multicallAddress = resolveMulticallAddress(options);
	const requestShape = pairs.map((pair) => ({
		...pair,
		balance: pair.tokenAddress === NATIVE_TOKEN_ADDRESS
			? buildNativeBalanceCallRequest(multicallAddress, pair.ownerAddress)
			: buildBalanceCallRequest(pair.tokenAddress, pair.ownerAddress),
	}));
	const rows = await multicallClient.call(requestShape, options);
	const items = rows.map((row) => ({
		chain: row.chain,
		tokenAddress: row.tokenAddress,
		ownerAddress: row.ownerAddress,
		balance: row.balance,
	}));

	return {
		ok: true,
		items,
	};
}

export default {
	queryEvmTokenBalance,
	queryEvmTokenBalanceBatch,
};
