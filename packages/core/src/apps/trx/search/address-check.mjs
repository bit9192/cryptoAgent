import { toTrxBase58Address } from "../address-codec.mjs";
import { trxNetworks } from "../config/networks.js";

function looksLikeTrxAddress(value) {
  const raw = String(value ?? "").trim();
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw) || /^41[0-9a-fA-F]{40}$/.test(raw);
}

export function checkTrxAddressContext(rawQuery, addressProviders = [], helpers = {}) {
  const normalizeLower = typeof helpers.normalizeLower === "function"
    ? helpers.normalizeLower
    : (value) => String(value ?? "").trim().toLowerCase();

  if (!looksLikeTrxAddress(rawQuery)) {
    throw new Error("not-trx-address");
  }

  const providerIds = addressProviders
    .filter((provider) => normalizeLower(provider.chain) === "trx")
    .map((provider) => provider.id);

  if (providerIds.length === 0) return null;

  const configured = new Set(Object.keys(trxNetworks));
  const available = new Set();

  for (const provider of addressProviders) {
    if (normalizeLower(provider.chain) !== "trx") continue;
    for (const network of provider.networks || []) {
      const normalized = String(network ?? "").trim();
      if (configured.has(normalized)) {
        available.add(normalized);
      }
    }
  }

  const networks = [...available];
  const mainnetNetworks = networks.filter((network) => {
    return trxNetworks[String(network ?? "").trim()]?.isMainnet === true;
  });

  return {
    kind: "address-context",
    chain: "trx",
    addressType: "base58",
    normalizedAddress: toTrxBase58Address(rawQuery),
    detectedNetwork: null,
    networks,
    mainnetNetworks,
    availableNetworks: networks,
    providerIds,
    confidence: 1,
  };
}

export default {
  checkTrxAddressContext,
};
