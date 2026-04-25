import { resolveEvmToken } from "../../apps/evm/configs/tokens.js";
import { resolveBtcToken } from "../../apps/btc/config/tokens.js";
import { createEvmDexScreenerTradeProvider } from "../../apps/evm/search/trade-provider.mjs";
import { createEvmAddressSearchProvider } from "../../apps/evm/search/address-provider.mjs";
import { createBtcTokenSearchProvider } from "../../apps/btc/search/token-provider.mjs";
import { createBtcAddressSearchProvider } from "../../apps/btc/search/address-provider.mjs";
import { createBtcTradeSearchProvider } from "../../apps/btc/search/trade-provider.mjs";
import { createTrxTokenSearchProvider } from "../../apps/trx/search/token-provider.mjs";
import { createTrxAddressSearchProvider } from "../../apps/trx/search/address-provider.mjs";
import { createTrxTradeSearchProvider } from "../../apps/trx/search/trade-provider.mjs";

export function createDefaultSearchProviders() {
  return [
    createBtcTokenSearchProvider(),
    createBtcAddressSearchProvider(),
    createBtcTradeSearchProvider(),
    {
      id: "evm-config",
      chain: "evm",
      networks: ["eth"],
      capabilities: ["token"],
      async searchToken(input) {
        try {
          const token = resolveEvmToken({
            key: input.query,
            network: "eth",
          });
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            source: "config",
            confidence: 0.9,
          }];
        } catch {
          return [];
        }
      },
    },
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
