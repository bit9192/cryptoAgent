import { DexScreenerSource } from "../../offchain/sources/dexscreener/index.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeNetworkHint(value) {
  const raw = normalizeLower(value);
  if (!raw) return "";
  if (["eth", "ethereum", "mainnet", "evm"].includes(raw)) return raw;
  if (["trx", "tron"].includes(raw)) return "trx";
  if (["btc", "bitcoin"].includes(raw)) return "btc";
  return raw;
}

function mapDexChainIdToEvmNetwork(chainId, fallbackNetwork = "eth") {
  const raw = normalizeLower(chainId);
  if (["ethereum", "eth"].includes(raw)) return "eth";
  if (["bsc", "binance-smart-chain"].includes(raw)) return "bsc";
  return fallbackNetwork;
}

function createDexScreenerFacade() {
  const source = new DexScreenerSource();
  let initPromise = null;

  async function ensureInit() {
    if (!initPromise) {
      initPromise = source.init();
    }
    await initPromise;
  }

  return {
    async getTokenInfo(query, options) {
      await ensureInit();
      return await source.getTokenInfo(query, options);
    },
  };
}

export function createEvmDexScreenerTradeProvider(options = {}) {
  const dexscreener = options.dexscreener ?? createDexScreenerFacade();

  return {
    id: "evm-trade-dexscreener",
    chain: "evm",
    networks: ["eth", "bsc"],
    capabilities: ["trade"],
    async searchTrade(input) {
      const query = String(input?.query ?? "").trim();
      if (!query) return [];

      const requestedNetwork = normalizeNetworkHint(input?.network) || "eth";
      const info = await dexscreener.getTokenInfo(query, {
        network: requestedNetwork,
      });
      if (!info || !info.pairAddress) return [];

      const network = mapDexChainIdToEvmNetwork(info.chainId, requestedNetwork);
      const baseSymbol = String(info?.baseToken?.symbol ?? "").trim();
      const quoteSymbol = String(info?.quoteToken?.symbol ?? "").trim();
      const dexId = String(info?.dexId ?? "dex").trim();
      const pairAddress = String(info.pairAddress).trim();

      return [{
        domain: "trade",
        chain: "evm",
        network,
        id: `trade:evm:${network}:${normalizeLower(pairAddress)}`,
        title: `${baseSymbol || "TOKEN"}/${quoteSymbol || "QUOTE"} @ ${dexId}`,
        address: pairAddress,
        source: "remote",
        confidence: 0.86,
        extra: {
          dexId,
          chainId: info.chainId ?? null,
          pairAddress,
          baseToken: info.baseToken ?? null,
          quoteToken: info.quoteToken ?? null,
          priceUsd: info.priceUsd ?? null,
          liquidityUsd: info.liquidityUsd ?? null,
          volume24h: info.volume24h ?? null,
          routeSummary: `${dexId}:${baseSymbol || "TOKEN"}/${quoteSymbol || "QUOTE"}`,
        },
      }];
    },
  };
}

export default {
  createEvmDexScreenerTradeProvider,
};
