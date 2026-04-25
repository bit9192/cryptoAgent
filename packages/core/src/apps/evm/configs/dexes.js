import "../../../load-env.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeQuotes(quotes = []) {
  return [...new Set((Array.isArray(quotes) ? quotes : [])
    .map((v) => String(v ?? "").trim().toUpperCase())
    .filter(Boolean))];
}

const EVM_DEX_CONFIGS = Object.freeze({
  eth: Object.freeze([
    Object.freeze({
      id: "uniswap-v2",
      name: "Uniswap V2",
      factory: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f",
      router: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
      priority: 10,
      quotes: Object.freeze(["USDT", "USDC", "WETH"]),
      enabled: true,
    }),
    Object.freeze({
      id: "sushiswap-v2",
      name: "SushiSwap V2",
      factory: "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac",
      router: "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f",
      priority: 20,
      quotes: Object.freeze(["USDT", "USDC", "WETH"]),
      enabled: true,
    }),
  ]),
  bsc: Object.freeze([
    Object.freeze({
      id: "pancakeswap-v2",
      name: "PancakeSwap V2",
      factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
      router: "0x10ed43c718714eb63d5aa57b78b54704e256024e",
      priority: 10,
      quotes: Object.freeze(["USDT", "USDC", "WBNB"]),
      enabled: true,
    }),
    Object.freeze({
      id: "biswap-v2",
      name: "BiSwap",
      factory: "0x858e3312ed3a876947ea49d572a7c42de08af7ee",
      router: "0x3a6d8ca21d1cf76f653a67577fa0d27453350dd8",
      priority: 20,
      quotes: Object.freeze(["USDT", "USDC", "WBNB"]),
      enabled: true,
    }),
    Object.freeze({
      id: "apeswap-v2",
      name: "ApeSwap",
      factory: "0x0841bd0b734e4f5853f0ddae7aedadd4fb83fd7c",
      router: "0xc0788a3ad43d79aa53b09c2eacc313a787d1d607",
      priority: 30,
      quotes: Object.freeze(["USDT", "USDC", "WBNB"]),
      enabled: true,
    }),
  ]),
});

export function getEvmDexConfigs(input = {}) {
  const network = normalizeLower(input.network || "eth") || "eth";
  const includeDisabled = input.includeDisabled === true;

  const rows = Array.isArray(EVM_DEX_CONFIGS[network]) ? EVM_DEX_CONFIGS[network] : [];
  return rows
    .filter((row) => includeDisabled || row.enabled !== false)
    .map((row) => ({
      id: String(row.id ?? "").trim() || null,
      name: String(row.name ?? "").trim() || null,
      factory: String(row.factory ?? "").trim() || null,
      router: String(row.router ?? "").trim() || null,
      priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : 100,
      quotes: normalizeQuotes(row.quotes),
      enabled: row.enabled !== false,
    }))
    .filter((row) => row.id)
    .sort((a, b) => a.priority - b.priority);
}

export { EVM_DEX_CONFIGS };
