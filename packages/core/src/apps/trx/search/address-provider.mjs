import { createAddressResolver } from "./address-resolver.mjs";

function normalizeAddress(value) {
  const address = String(value ?? "").trim();
  if (!address) {
    throw new TypeError("address 不能为空");
  }
  return address;
}

function normalizeNetwork(value) {
  return String(value ?? "mainnet").trim().toLowerCase() || "mainnet";
}

export function createTrxAddressSearchProvider(options = {}) {
  const resolver = options.resolver ?? createAddressResolver(options);

  async function searchAddress(input = {}) {
    const address = normalizeAddress(input?.address);
    const network = normalizeNetwork(input?.network);

    try {
      return await resolver.resolve({ address, network });
    } catch (error) {
      if (error instanceof TypeError) {
        throw error;
      }
      return [];
    }
  }

  return {
    id: "trx-address",
    chain: "trx",
    networks: ["mainnet", "nile", "shasta", "local"],
    capabilities: ["address"],
    searchAddress,
  };
}

export default {
  createTrxAddressSearchProvider,
};
