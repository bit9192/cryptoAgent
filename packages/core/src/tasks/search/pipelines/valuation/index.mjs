import { buildEvmAssetValuationInput } from "../../../../apps/evm/search/valuation.mjs";
import { buildBtcAssetValuationInput } from "../../../../apps/btc/search/valuation.mjs";
import { buildTrxAssetValuationInput } from "../../../../apps/trx/search/valuation.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

const VALUATION_BUILDERS = Object.freeze({
  evm: buildEvmAssetValuationInput,
  btc: buildBtcAssetValuationInput,
  trx: buildTrxAssetValuationInput,
});

export function buildAssetValuationInput(chain, asset = {}, network = null) {
  const builder = VALUATION_BUILDERS[normalizeLower(chain)];
  if (typeof builder === "function") return builder(asset, network);

  return {
    quantity: 0,
    priceQuery: "",
    priceNetwork: null,
  };
}

export default {
  buildAssetValuationInput,
};
