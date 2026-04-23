import { getContract } from "./contracts/deploy.mjs";

const MULTICALL_REQUEST_SYMBOL = Symbol.for("contractHelper.multicallRequest");

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMulticallRequest(value) {
	if (!value || typeof value !== "object") {
		return false;
	}
	if (value[MULTICALL_REQUEST_SYMBOL] === true) {
		return true;
	}
	return value._isMethods === true && typeof value.decode === "function";
}

function collectRequests(input, store = []) {
	if (isMulticallRequest(input)) {
		store.push(input);
		return store;
	}

	if (Array.isArray(input)) {
		for (const item of input) {
			collectRequests(item, store);
		}
		return store;
	}

	if (isPlainObject(input)) {
		for (const value of Object.values(input)) {
			collectRequests(value, store);
		}
	}

	return store;
}

function rebuildShape(input, valuesRef) {
	if (isMulticallRequest(input)) {
		const nextValue = valuesRef.values[valuesRef.index];
		valuesRef.index += 1;
		return nextValue;
	}

	if (Array.isArray(input)) {
		return input.map((item) => rebuildShape(item, valuesRef));
	}

	if (isPlainObject(input)) {
		const result = {};
		for (const [key, value] of Object.entries(input)) {
			result[key] = rebuildShape(value, valuesRef);
		}
		return result;
	}

	return input;
}

function normalizeDecodedResult(decoded, outputs = []) {
	if (!Array.isArray(outputs) || outputs.length === 0) {
		return undefined;
	}
	if (outputs.length === 1) {
		return decoded[0];
	}
	return Array.from(decoded);
}

function buildCalls(requests) {
	return requests.map((request) => ({
		target: request.target ?? request[0],
		callData: request.callData ?? request.data ?? request[1],
	}));
}

function decodeResults(requests, returnData) {
	if (!Array.isArray(returnData) || returnData.length !== requests.length) {
		throw new Error("Multicall 返回结果数量与请求数量不一致");
	}

	return requests.map((request, index) => {
		const data = returnData[index];
		if (typeof request.decode === "function") {
			return request.decode(data);
		}

		const fragment = request.fragment
			?? (request.iface && request.method ? request.iface.getFunction(request.method) : null);
		if (!request.iface || !fragment) {
			throw new Error("Multicall 请求缺少 decode 信息");
		}

		const decoded = request.iface.decodeFunctionResult(fragment, data);
		return normalizeDecodedResult(decoded, fragment?.outputs ?? []);
	});
}

async function resolveMulticallContract(config = {}, options = {}) {
	const resolveArgs = {
		...config,
		...options,
	};

	const address = String(resolveArgs.address ?? "").trim();
	if (address) {
		return getContract("Multicall3", address, resolveArgs);
	}

	const explicitContractName = String(resolveArgs.contractName ?? "").trim();
	if (explicitContractName) {
		return getContract(explicitContractName, null, resolveArgs);
	}

	const fallbackNames = ["MultiCall", "Multicall3"];
	let lastError = null;
	for (const name of fallbackNames) {
		try {
			return await getContract(name, null, resolveArgs);
		} catch (error) {
			lastError = error;
		}
	}

	if (lastError) {
		throw lastError;
	}
	throw new Error("未找到可用 Multicall 合约");
}

export function multiCall(config = {}) {
	const getMulticall = typeof config.getContract === "function"
		? config.getContract
		: resolveMulticallContract;

	return {
		async call(input, options = {}) {
			const requests = collectRequests(input, []);
			if (requests.length === 0) {
				return input;
			}

			const multicall = await getMulticall(config, options);
			const calls = buildCalls(requests);
			const result = await multicall.aggregate.staticCall(calls);
			const returnData = Array.isArray(result) ? result[1] : result.returnData;
			const decodedValues = decodeResults(requests, returnData);

			return rebuildShape(input, {
				index: 0,
				values: decodedValues,
			});
		},
	};
}

export {
	MULTICALL_REQUEST_SYMBOL,
	collectRequests,
	buildCalls,
	decodeResults,
	isMulticallRequest,
};

export default {
	multiCall,
	MULTICALL_REQUEST_SYMBOL,
	collectRequests,
	buildCalls,
	decodeResults,
	isMulticallRequest,
};
