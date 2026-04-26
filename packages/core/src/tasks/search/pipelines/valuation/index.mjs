import { buildEvmAssetValuationInput } from "./evm.mjs";
import { buildBtcAssetValuationInput } from "./btc.mjs";
import { buildTrxAssetValuationInput } from "./trx.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function buildAssetValuationInput(chain, asset = {}, network = null) {
  const c = normalizeLower(chain);
  if (c === "evm") return buildEvmAssetValuationInput(asset, network);
  if (c === "btc") return buildBtcAssetValuationInput(asset, network);
  if (c === "trx") return buildTrxAssetValuationInput(asset, network);

  return {
    quantity: 0,
    priceQuery: "",
    priceNetwork: null,
  };
}

export default {
  buildAssetValuationInput,
};
