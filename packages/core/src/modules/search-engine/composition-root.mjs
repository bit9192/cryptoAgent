import { resolveEvmToken } from "../../apps/evm/configs/tokens.js";
import { resolveBtcToken } from "../../apps/btc/config/tokens.js";
import { resolveTrxToken } from "../../apps/trx/config/tokens.js";
import { normalizeTrxNetworkName } from "../../apps/trx/config/networks.js";
import { createEvmDexScreenerTradeProvider } from "../../apps/evm/search/trade-provider.mjs";

export function createDefaultSearchProviders() {
  return [
    {
      id: "btc-config",
      chain: "btc",
      networks: ["mainnet"],
      capabilities: ["token"],
      async searchToken(input) {
        try {
          const token = resolveBtcToken({
            key: input.query,
            network: "mainnet",
          });
          return [{
            chain: "btc",
            network: "mainnet",
            tokenAddress: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            source: "config",
            confidence: 0.95,
          }];
        } catch {
          return [];
        }
      },
    },
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
    {
      id: "trx-config",
      chain: "trx",
      networks: ["mainnet", "nile", "shasta", "local"],
      capabilities: ["token"],
      async searchToken(input) {
        try {
          const requested = String(input.network ?? "").trim();
          const network = requested
            ? (requested === "trx" ? "mainnet" : normalizeTrxNetworkName(requested))
            : "mainnet";

          const token = resolveTrxToken({
            key: input.query,
            network,
          });
          return [{
            chain: "trx",
            network,
            tokenAddress: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            source: "config",
            confidence: 0.92,
          }];
        } catch {
          return [];
        }
      },
    },
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
