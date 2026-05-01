import { runBtcBatchBalance } from "./batch-balance.mjs";

export function createBtcBalanceProvider(options = {}) {
  const runner = typeof options?.batchRunner === "function"
    ? options.batchRunner
    : runBtcBatchBalance;

  return {
    id: "btc-balance",
    chain: "btc",
    networks: ["mainnet", "testnet", "regtest"],
    capabilities: ["balance"],
    async batchBalance(rows, providerOptions = {}) {
      return await runner(rows, providerOptions);
    },
  };
}

export default { createBtcBalanceProvider };
