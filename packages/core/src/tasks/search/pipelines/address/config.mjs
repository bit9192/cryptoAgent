function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

export const ADDRESS_PIPELINE_CONFIG = Object.freeze({
  evm: Object.freeze({
    defaultNetwork: "eth",
    // network 未指定时按优先级尝试。
    networkPriority: Object.freeze(["eth", "bsc", "base", "arb", "op", "polygon"]),
    fallbackWhenNetworkSpecified: false,
  }),
  trx: Object.freeze({
    defaultNetwork: "mainnet",
    fallbackWhenNetworkSpecified: false,
  }),
  btc: Object.freeze({
    defaultNetwork: "mainnet",
    fallbackWhenNetworkSpecified: false,
  }),
});

export function resolveAddressPipelineConfig(chain) {
  return ADDRESS_PIPELINE_CONFIG[normalizeLower(chain)] ?? null;
}

export default {
  ADDRESS_PIPELINE_CONFIG,
  resolveAddressPipelineConfig,
};
