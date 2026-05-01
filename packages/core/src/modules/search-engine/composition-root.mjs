import { createEvmTokenSearchProvider } from "../../apps/evm/search/token-provider.mjs";
import { createEvmDexScreenerTradeProvider } from "../../apps/evm/search/trade-provider.mjs";
import { createEvmAddressSearchProvider } from "../../apps/evm/search/address-provider.mjs";
import { createBtcTokenSearchProvider } from "../../apps/btc/search/token-provider.mjs";
import { createBtcAddressSearchProvider } from "../../apps/btc/search/address-provider.mjs";
import { createBtcTradeSearchProvider } from "../../apps/btc/search/trade-provider.mjs";
import { createTrxTokenSearchProvider } from "../../apps/trx/search/token-provider.mjs";
import { createTrxAddressSearchProvider } from "../../apps/trx/search/address-provider.mjs";
import { createTrxTradeSearchProvider } from "../../apps/trx/search/trade-provider.mjs";
import { checkBtcAddressContext } from "../../apps/btc/search/address-check.mjs";
import { checkEvmAddressContext } from "../../apps/evm/search/address-check.mjs";
import { checkTrxAddressContext } from "../../apps/trx/search/address-check.mjs";

export const ADDRESS_CONTEXT_CHECKERS = Object.freeze({
  btc: checkBtcAddressContext,
  trx: checkTrxAddressContext,
  evm: checkEvmAddressContext,
});

export function createDefaultSearchProviders() {
  return [
    createBtcTokenSearchProvider(),
    createBtcAddressSearchProvider(),
    createBtcTradeSearchProvider(),
    createEvmTokenSearchProvider(),
    createEvmDexScreenerTradeProvider(),
    createEvmAddressSearchProvider(),
    createTrxTokenSearchProvider(),
    createTrxAddressSearchProvider(),
    createTrxTradeSearchProvider(),
  ];
}

export function registerSearchProviders(engine, providers = []) {
  for (const provider of providers) {
    engine.registerProvider(provider);
  }
  return engine;
}

export function registerDefaultSearchProviders(engine) {
  return registerSearchProviders(engine, createDefaultSearchProviders());
}

export default {
  createDefaultSearchProviders,
  registerSearchProviders,
  registerDefaultSearchProviders,
};
