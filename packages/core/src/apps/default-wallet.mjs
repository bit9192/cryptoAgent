import { createWallet } from "./wallet/index.mjs";
import { createEvmProvider } from "./evm/provider.mjs";
import { createBtcProvider } from "./btc/provider.mjs";
import { createTrxProvider } from "./trx/provider.mjs";

function resolveProvider(input, factory, name) {
  if (input === false) {
    return null;
  }

  if (input && typeof input === "object" && typeof input.createSigner === "function") {
    return input;
  }

  if (input && typeof input === "object") {
    return factory(input);
  }

  if (input === undefined || input === null || input === true) {
    return factory();
  }

  throw new Error(`无效的 ${name} provider 配置`);
}

export async function createDefaultWallet(options = {}) {
  const wallet = createWallet(options.walletOptions ?? options.wallet ?? {});
  const allowOverride = Boolean(options.allowOverride);

  const providerDefs = [
    ["evm", resolveProvider(options.evm, createEvmProvider, "evm")],
    ["btc", resolveProvider(options.btc, createBtcProvider, "btc")],
    ["trx", resolveProvider(options.trx, createTrxProvider, "trx")],
  ];

  for (const [_chain, provider] of providerDefs) {
    if (!provider) continue;
    await wallet.registerProvider({ provider, allowOverride });
  }

  return wallet;
}

export default createDefaultWallet;
