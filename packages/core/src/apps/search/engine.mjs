
import {
	ADDRESS_CONTEXT_CHECKERS,
	createDefaultSearchProviders,
} from "./chain-providers.mjs";
import { resolveAddressCheck } from "./address-check.mjs";

function notImplemented(name) {
	return async function pendingImplementation() {
		throw new Error(`${name} not implemented yet`);
	};
}

export function createSearchEngine(options = {}) {
	const providers = Array.isArray(options.providers)
		? [...options.providers]
		: createDefaultSearchProviders();
	const addressContextCheckers = options.addressContextCheckers
		&& typeof options.addressContextCheckers === "object"
		? options.addressContextCheckers
		: ADDRESS_CONTEXT_CHECKERS;

	async function addressCheck(input = {}) {
		return await resolveAddressCheck(input, {
			providers,
			checkers: addressContextCheckers,
		});
	}

	return {
		addressCheck,
		asset: {
			byAddress: notImplemented("engine.asset.byAddress"),
		},
		balance: {
			batch: notImplemented("engine.balance.batch"),
		},
		trade: {
			search: notImplemented("engine.trade.search"),
		},
		token: {
			search: notImplemented("engine.token.search"),
		},
	};
}

export function createDefaultSearchEngine(options = {}) {
	return createSearchEngine(options);
}

export default {
	createSearchEngine,
	createDefaultSearchEngine,
};