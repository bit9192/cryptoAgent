import { getAddress } from "ethers";

import { EvmContract, getContract } from "../contracts/deploy.mjs";
import { resolveEvmContract } from "../configs/contracts.js";
import { multiCall, MULTICALL_REQUEST_SYMBOL } from "../multicall.mjs";

const ERC20_METADATA_ABI = [
	"function name() view returns (string)",
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
];

function normalizeTokenAddress(tokenAddress) {
	const raw = String(tokenAddress ?? "").trim();
	if (!raw) {
		throw new Error("tokenAddress 不能为空");
	}
	return getAddress(raw);
}

function resolveMulticallClient(options = {}) {
	if (options.multicall && typeof options.multicall.call === "function") {
		return options.multicall;
	}
	const explicitAddress = getAddress(resolveEvmContract({
		key: "multicall3",
		network: options.networkName ?? options.network,
		chainId: options.chainId,
		forkSourceChainId: options.forkSourceChainId,
		overrides: options.contractOverrides,
	}));
	const config = {
		getContract: typeof options.getContract === "function"
			? options.getContract
			: async (_config, resolveArgs = {}) => await getContract("Multicall3", explicitAddress, resolveArgs),
	};
	return multiCall(config);
}

function buildMetadataCallRequest(tokenAddress, method) {
	const token = new EvmContract(tokenAddress, ERC20_METADATA_ABI, null);
	const request = token.calls[method]();
	request[MULTICALL_REQUEST_SYMBOL] = true;
	return request;
}

function normalizeMetadataItems(input) {
	if (!Array.isArray(input)) {
		throw new Error("batch 输入必须是数组");
	}
	return input.map((item) => {
		const tokenRef = (item && typeof item === "object")
			? (item.token ?? item.tokenAddress)
			: item;
		return {
			tokenAddress: normalizeTokenAddress(tokenRef),
		};
	});
}

function normalizeMetadataNumber(value) {
	if (value == null) {
		return null;
	}
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
}

function normalizeMetadataRow(row = {}) {
	return {
		chain: "evm",
		tokenAddress: row.tokenAddress,
		name: String(row.name ?? "").trim() || null,
		symbol: String(row.symbol ?? "").trim() || null,
		decimals: normalizeMetadataNumber(row.decimals),
	};
}

function normalizeMetadataQueryInput(input = {}) {
	if (Array.isArray(input)) {
		return {
			items: normalizeMetadataItems(input),
			options: {},
			isBatch: true,
		};
	}

	if (!input || typeof input !== "object") {
		throw new Error("input 必须是对象或数组");
	}

	if (Array.isArray(input.items)) {
		const { items, ...options } = input;
		return {
			items: normalizeMetadataItems(items),
			options,
			isBatch: true,
		};
	}

	if (Array.isArray(input.tokens)) {
		const { tokens, ...options } = input;
		return {
			items: normalizeMetadataItems(tokens),
			options,
			isBatch: true,
		};
	}

	const tokenRef = input.token ?? input.tokenAddress;
	return {
		items: [{ tokenAddress: normalizeTokenAddress(tokenRef) }],
		options: input,
		isBatch: false,
	};
}

export async function queryEvmTokenMetadata(input = {}) {
	const parsed = normalizeMetadataQueryInput(input);
	const result = await queryEvmTokenMetadataBatch(parsed.items, parsed.options);

	if (parsed.isBatch) {
		return result;
	}

	return result.items[0] ?? {
		chain: "evm",
		tokenAddress: parsed.items[0]?.tokenAddress,
		name: null,
		symbol: null,
		decimals: null,
	};
}

export async function queryEvmTokenMetadataBatch(items = [], options = {}) {
	const normalizedItems = normalizeMetadataItems(items);
	if (normalizedItems.length === 0) {
		return {
			ok: true,
			items: [],
		};
	}
	const multicallClient = resolveMulticallClient(options);
	const requestShape = normalizedItems.map((item) => ({
		tokenAddress: item.tokenAddress,
		name: buildMetadataCallRequest(item.tokenAddress, "name"),
		symbol: buildMetadataCallRequest(item.tokenAddress, "symbol"),
		decimals: buildMetadataCallRequest(item.tokenAddress, "decimals"),
	}));
	const rows = await multicallClient.call(requestShape, options);

	const normalizedRows = rows.map((row) => normalizeMetadataRow(row));

	return {
		ok: true,
		items: normalizedRows,
	};
}

export default {
	queryEvmTokenMetadata,
	queryEvmTokenMetadataBatch,
};
