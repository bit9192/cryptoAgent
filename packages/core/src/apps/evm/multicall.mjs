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

function normalizeCallResultEntry(entry) {
	if (Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === "boolean") {
		return {
			success: entry[0],
			returnData: entry[1],
		};
	}

	if (entry && typeof entry === "object" && typeof entry.success === "boolean") {
		return {
			success: entry.success,
			returnData: entry.returnData,
		};
	}

	return {
		success: true,
		returnData: entry,
	};
}

function decodeResults(requests, rawResults, options = {}) {
	if (!Array.isArray(rawResults) || rawResults.length !== requests.length) {
		throw new Error("Multicall 返回结果数量与请求数量不一致");
	}

	return requests.map((request, index) => {
		const outcome = normalizeCallResultEntry(rawResults[index]);
		if (!outcome.success) {
			if (options.requireSuccess === true) {
				throw new Error(`Multicall 子调用失败（index=${index}）`);
			}
			return null;
		}

		const data = outcome.returnData;
		if (typeof request.decode === "function") {
			try {
				return request.decode(data);
			} catch (error) {
				if (options.requireSuccess === true) {
					throw error;
				}
				return null;
			}
		}

		const fragment = request.fragment
			?? (request.iface && request.method ? request.iface.getFunction(request.method) : null);
		if (!request.iface || !fragment) {
			throw new Error("Multicall 请求缺少 decode 信息");
		}

		try {
			const decoded = request.iface.decodeFunctionResult(fragment, data);
			return normalizeDecodedResult(decoded, fragment?.outputs ?? []);
		} catch (error) {
			if (options.requireSuccess === true) {
				throw error;
			}
			return null;
		}
	});
}

async function executeMulticall(multicall, calls, options = {}) {
	if (multicall?.tryAggregate && typeof multicall.tryAggregate.staticCall === "function") {
		return multicall.tryAggregate.staticCall(options.requireSuccess === true, calls);
	}

	if (multicall?.aggregate && typeof multicall.aggregate.staticCall === "function") {
		const result = await multicall.aggregate.staticCall(calls);
		return Array.isArray(result) ? result[1] : result.returnData;
	}

	throw new Error("Multicall 合约缺少可用聚合方法（tryAggregate/aggregate）");
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

	const fallbackNames = ["Multicall3", "MultiCall"];
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
			const rawResults = await executeMulticall(multicall, calls, options);
			const decodedValues = decodeResults(requests, rawResults, options);

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
