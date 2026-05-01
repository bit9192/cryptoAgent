
import {
	ADDRESS_CONTEXT_CHECKERS,
	createDefaultSearchProviders,
} from "./chain-providers.mjs";
import { resolveAddressCheck } from "./address-check.mjs";
import { searchTokenWithProviders } from "./token-search.mjs";
import { resolveTokenRisk } from "./token-risk.mjs";
import { searchAddressWithProviders } from "./address-search.mjs";
import { searchTradeWithProviders } from "./trade-search.mjs";
import { batchBalanceWithProviders } from "./batch-balance.mjs";

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

	async function tokenSearch(input = {}) {
		return await searchTokenWithProviders(input, {
			providers,
		});
	}

	async function assetByAddress(input = {}) {
		return await searchAddressWithProviders(input, {
			providers,
		});
	}

	async function tradeSearch(input = {}) {
		return await searchTradeWithProviders(input, {
			providers,
		});
	}

	async function balanceBatch(rows) {
		return await batchBalanceWithProviders(rows, {
			providers,
		});
	}

	return {
		addressCheck,
		asset: {
			byAddress: assetByAddress,
		},
		balance: {
			batch: balanceBatch,
		},
		trade: {
			search: tradeSearch,
		},
		token: {
			search: tokenSearch,
			risk: resolveTokenRisk,
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