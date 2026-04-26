import { parseBtcAddress } from "../address.mjs";
import { btcNetworks } from "../config/networks.js";

function resolveBtcAddressType(parsed = {}) {
  if (parsed.format === "base58") {
    return parsed.kind;
  }
  if (parsed.witnessVersion === 0) return "p2wpkh";
  if (parsed.witnessVersion === 1) return "p2tr";
  return `segwit_v${parsed.witnessVersion}`;
}

export function checkBtcAddressContext(rawQuery, addressProviders = [], helpers = {}) {
  const normalizeLower = typeof helpers.normalizeLower === "function"
    ? helpers.normalizeLower
    : (value) => String(value ?? "").trim().toLowerCase();

  const parsed = parseBtcAddress(rawQuery);
  const providerIds = addressProviders
    .filter((provider) => normalizeLower(provider.chain) === "btc")
    .map((provider) => provider.id);

  if (providerIds.length === 0) return null;

  const configured = new Set(Object.keys(btcNetworks));
  const available = new Set();

  for (const provider of addressProviders) {
    if (normalizeLower(provider.chain) !== "btc") continue;
    for (const network of provider.networks || []) {
      const normalized = String(network ?? "").trim();
      if (configured.has(normalized)) {
        available.add(normalized);
      }
    }
  }

  const networks = [...available];
  const mainnetNetworks = networks.filter((network) => {
    return btcNetworks[String(network ?? "").trim()]?.isMainnet === true;
  });

  return {
    kind: "address-context",
    chain: "btc",
    addressType: resolveBtcAddressType(parsed),
    normalizedAddress: parsed.address,
    detectedNetwork: parsed.network,
    networks,
    mainnetNetworks,
    availableNetworks: networks,
    providerIds,
    confidence: 1,
  };
}

export default {
  checkBtcAddressContext,
};
