import { resolveAddressPipelineConfig } from "./config.mjs";
import { runEvmAddressPipeline } from "./evm.mjs";
import { runTrxAddressPipeline } from "./trx.mjs";
import { runBtcAddressPipeline } from "./btc.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

const ADDRESS_PIPELINE_RUNNERS = Object.freeze({
  evm: runEvmAddressPipeline,
  trx: runTrxAddressPipeline,
  btc: runBtcAddressPipeline,
});

export async function runAddressPipeline(input = {}) {
  const chain = normalizeLower(input?.chain);
  if (!chain) return null;

  const runner = ADDRESS_PIPELINE_RUNNERS[chain];
  if (typeof runner !== "function") {
    return null;
  }

  const config = resolveAddressPipelineConfig(chain);
  return await runner({
    ...input,
    config,
  });
}

export default {
  runAddressPipeline,
};
