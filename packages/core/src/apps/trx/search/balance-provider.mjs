import { runTrxBatchBalance } from "./batch-balance.mjs";

export function createTrxBalanceProvider(options = {}) {
  const runner = typeof options?.batchRunner === "function"
    ? options.batchRunner
    : runTrxBatchBalance;

  return {
    id: "trx-balance",
    chain: "trx",
    networks: ["mainnet", "nile"],
    capabilities: ["balance"],
    async batchBalance(rows, providerOptions = {}) {
      return await runner(rows, providerOptions);
    },
  };
}

export default { createTrxBalanceProvider };
