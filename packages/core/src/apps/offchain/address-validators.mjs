import { getAddress } from "ethers";
import { toTrxHexAddress } from "../trx/address-codec.mjs";

export function isEvmAddress(value) {
  try {
    getAddress(String(value ?? "").trim());
    return true;
  } catch {
    return false;
  }
}

export function isTrxAddress(value) {
  try {
    toTrxHexAddress(String(value ?? "").trim());
    return true;
  } catch {
    return false;
  }
}

export function isBtcAddress(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return /^(bc1|tb1|bcrt1)[0-9ac-hj-np-z]{11,87}$/i.test(text)
    || /^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,35}$/.test(text);
}

export function detectAddressKind(value) {
  if (isEvmAddress(value)) return "evm";
  if (isTrxAddress(value)) return "trx";
  if (isBtcAddress(value)) return "btc";
  return null;
}

export default {
  isEvmAddress,
  isTrxAddress,
  isBtcAddress,
  detectAddressKind,
};