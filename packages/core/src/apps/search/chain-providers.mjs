import { createEvmTokenSearchProvider } from "../evm/search/token-provider.mjs";
import { createEvmDexScreenerTradeProvider } from "../evm/search/trade-provider.mjs";
import { createEvmAddressSearchProvider } from "../evm/search/address-provider.mjs";

import { createBtcTokenSearchProvider } from "../btc/search/token-provider.mjs";
import { createBtcAddressSearchProvider } from "../btc/search/address-provider.mjs";
import { createBtcTradeSearchProvider } from "../btc/search/trade-provider.mjs";

import { createTrxTokenSearchProvider } from "../trx/search/token-provider.mjs";
import { createTrxAddressSearchProvider } from "../trx/search/address-provider.mjs";
import { createTrxTradeSearchProvider } from "../trx/search/trade-provider.mjs";

import { checkBtcAddressContext } from "../btc/search/address-check.mjs";
import { checkEvmAddressContext } from "../evm/search/address-check.mjs";
import { checkTrxAddressContext } from "../trx/search/address-check.mjs";

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
