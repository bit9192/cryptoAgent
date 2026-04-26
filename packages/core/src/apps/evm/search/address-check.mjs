import { getAddress } from "ethers";

import { evmNetworks } from "../configs/networks.js";

function resolveProviderIds(providerList = [], normalizeLower) {
  return providerList
    .filter((provider) => normalizeLower(provider.chain) === "evm")
    .map((provider) => provider.id);
}

function resolveAvailableNetworks(providerList = [], normalizeLower) {
  const configured = new Set(Object.keys(evmNetworks));
  const available = new Set();

  for (const provider of providerList) {
    if (normalizeLower(provider.chain) !== "evm") continue;
    for (const network of provider.networks || []) {
      const normalized = String(network ?? "").trim();
      if (configured.has(normalized)) {
        available.add(normalized);
      }
    }
  }

  return [...available];
}

function resolveMainnetNetworks(networks = []) {
  const input = Array.isArray(networks) ? networks : [];
  return input.filter((network) => evmNetworks[String(network ?? "").trim()]?.isMainnet === true);
}

export function checkEvmAddressContext(rawQuery, addressProviders = [], helpers = {}) {
  const normalizeLower = typeof helpers.normalizeLower === "function"
    ? helpers.normalizeLower
    : (value) => String(value ?? "").trim().toLowerCase();

  const providerIds = resolveProviderIds(addressProviders, normalizeLower);
  if (providerIds.length === 0) return null;

  const networks = resolveAvailableNetworks(addressProviders, normalizeLower);
  return {
    kind: "address-context",
    chain: "evm",
    addressType: "hex",
    normalizedAddress: getAddress(rawQuery),
    detectedNetwork: null,
    networks,
    mainnetNetworks: resolveMainnetNetworks(networks),
    availableNetworks: networks,
    providerIds,
    confidence: 1,
  };
}

export default {
  checkEvmAddressContext,
};
