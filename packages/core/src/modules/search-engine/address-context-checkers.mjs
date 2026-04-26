import { checkBtcAddressContext } from "../../apps/btc/search/address-check.mjs";
import { checkEvmAddressContext } from "../../apps/evm/search/address-check.mjs";
import { checkTrxAddressContext } from "../../apps/trx/search/address-check.mjs";

export const ADDRESS_CONTEXT_CHECKERS = Object.freeze({
  btc: checkBtcAddressContext,
  trx: checkTrxAddressContext,
  evm: checkEvmAddressContext,
});
