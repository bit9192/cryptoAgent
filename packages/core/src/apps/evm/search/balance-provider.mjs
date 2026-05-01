import { runEvmBatchBalance } from "./batch-balance.mjs";

export function createEvmBalanceProvider(options = {}) {
  const runner = typeof options?.batchRunner === "function"
    ? options.batchRunner
    : runEvmBatchBalance;

  return {
    id: "evm-balance",
    chain: "evm",
    networks: ["eth", "bsc"],
    capabilities: ["balance"],
    async batchBalance(rows, providerOptions = {}) {
      return await runner(rows, providerOptions);
    },
  };
}

export default { createEvmBalanceProvider };
