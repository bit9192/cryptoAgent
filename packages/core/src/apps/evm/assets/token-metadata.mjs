import { Interface, getAddress } from "ethers";

import { resolveEvmNetProvider } from "../netprovider.mjs";

const ERC20_METADATA_INTERFACE = new Interface([
	"function name() view returns (string)",
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
]);

function unwrapAdapterResult(value) {
	if (!value || typeof value !== "object") {
		return value;
	}
	if (value.ok === true && Object.prototype.hasOwnProperty.call(value, "result")) {
		return value.result;
	}
	return value;
}

function normalizeTokenAddress(tokenAddress) {
	const raw = String(tokenAddress ?? "").trim();
	if (!raw) {
		throw new Error("tokenAddress 不能为空");
	}
	return getAddress(raw);
}

function resolveCallRunner(options = {}) {
	if (options.runner && typeof options.runner.call === "function") {
		return options.runner;
	}
	if (options.provider && typeof options.provider.call === "function") {
		return options.provider;
	}

	const networkRef = options.networkNameOrProvider
		?? options.netProvider
		?? options.networkName
		?? options.network
		?? null;
	if (!networkRef) {
		throw new Error("缺少可用 EVM provider（请传入 runner/provider/networkNameOrProvider）");
	}

	const netProvider = resolveEvmNetProvider(networkRef, options);
	if (!netProvider?.provider || typeof netProvider.provider.call !== "function") {
		throw new Error("无法解析可用的 EVM call provider");
	}
	return netProvider.provider;
}

async function callRead(runner, tokenAddress, method) {
	const tx = {
		to: tokenAddress,
		data: ERC20_METADATA_INTERFACE.encodeFunctionData(method, []),
	};
	const raw = unwrapAdapterResult(await runner.call(tx));
	const decoded = ERC20_METADATA_INTERFACE.decodeFunctionResult(method, raw);
	return decoded[0];
}

export async function queryEvmTokenMetadata(input = {}) {
	const tokenAddress = normalizeTokenAddress(input.tokenAddress);
	const runner = resolveCallRunner(input);

	const [name, symbol, decimalsRaw] = await Promise.all([
		callRead(runner, tokenAddress, "name"),
		callRead(runner, tokenAddress, "symbol"),
		callRead(runner, tokenAddress, "decimals"),
	]);

	return {
		chain: "evm",
		tokenAddress,
		name: String(name ?? "").trim() || null,
		symbol: String(symbol ?? "").trim() || null,
		decimals: Number(decimalsRaw),
	};
}

export async function queryEvmTokenMetadataBatch(input = {}) {
	const tokenAddresses = Array.isArray(input.tokenAddresses) ? input.tokenAddresses : [];
	if (tokenAddresses.length === 0) {
		return {
			ok: true,
			items: [],
		};
	}

	const items = await Promise.all(
		tokenAddresses.map(async (tokenAddress) => await queryEvmTokenMetadata({
			...input,
			tokenAddress,
		})),
	);

	return {
		ok: true,
		items,
	};
}

export default {
	queryEvmTokenMetadata,
	queryEvmTokenMetadataBatch,
};
