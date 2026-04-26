import {
  queryAddressCheck,
  queryAddressBalance,
} from "./address-search.mjs";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function shortenAddress(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Token";
  if (normalizeLower(text) === "native") return "ETH";
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function groupAssetsByNetwork(assets = [], fallbackNetwork = "eth") {
  const rows = new Map();
  const list = Array.isArray(assets) ? assets : [];
  const defaultNetwork = String(fallbackNetwork ?? "eth").trim().toLowerCase() || "eth";

  for (const asset of list) {
    const network = String(asset?.extra?.network ?? defaultNetwork).trim().toLowerCase() || defaultNetwork;
    const row = rows.get(network) ?? [];
    row.push(asset);
    rows.set(network, row);
  }

  return [...rows.entries()].map(([network, groupedAssets]) => ({ network, assets: groupedAssets }));
}

function mapAddressCheckToSearchItems(checkResult = {}) {
  if (!checkResult?.ok) {
    return [];
  }

  const { address, network, chain, addressType } = checkResult;
  const assets = Array.isArray(checkResult.assets) ? checkResult.assets : [];

  if (assets.length === 0) {
    return [];
  }

  return assets.map((asset) => ({
    domain: "address",
    chain,
    network,
    id: `address:evm:${normalizeLower(network)}:${normalizeLower(address)}:${normalizeLower(asset.address)}`,
    title: `${asset.symbol || asset.name || "Token"} @ ${address.slice(0, 6)}...${address.slice(-4)}`,
    address,
    source: "evm-address-search",
    confidence: 0.85,
    extra: {
      addressType,
      asset: {
        address: asset.address,
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals,
        assetType: asset.assetType,
        ...((asset.extra && typeof asset.extra === "object") ? { ...asset.extra } : {}),
      },
    },
  }));
}

function mapAddressBalanceToSearchItems(balanceResult = {}) {
  if (!balanceResult?.ok) {
    return [];
  }

  const { address, network, chain } = balanceResult;
  const balances = Array.isArray(balanceResult.balances) ? balanceResult.balances : [];
  const nonZeroBalances = balances.filter((asset) => {
    try {
      return BigInt(asset?.rawBalance ?? 0n) > 0n;
    } catch {
      return false;
    }
  });

  return nonZeroBalances.map((asset) => ({
    domain: "address",
    chain,
    network,
    id: `address:evm:${normalizeLower(network)}:${normalizeLower(address)}:${normalizeLower(asset.address)}`,
    title: asset.symbol || asset.name || shortenAddress(asset.address),
    address,
    tokenAddress: asset.address,
    symbol: asset.symbol,
    name: asset.name,
    decimals: asset.decimals,
    source: "evm-address-search",
    confidence: 0.9,
    extra: {
      asset: {
        address: asset.address,
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals,
        assetType: asset.assetType,
        rawBalance: asset.rawBalance,
        formatted: asset.formatted,
        ...(asset.extra && typeof asset.extra === "object" ? { ...asset.extra } : {}),
      },
    },
  }));
}

export function createEvmAddressSearchProvider(options = {}) {
  async function searchAddress(input = {}) {
    const query = String(input?.query ?? input?.address ?? "").trim();
    const requestedNetwork = String(input?.network ?? "").trim().toLowerCase();

    if (!query || !/^0x[a-fA-F0-9]{40}$/.test(query)) {
      return [];
    }

    try {
      const checkResult = await queryAddressCheck({
        address: query,
        ...(requestedNetwork ? { network: requestedNetwork } : {}),
      }, options);

      const grouped = requestedNetwork
        ? [{ network: checkResult.network, assets: checkResult.assets }]
        : groupAssetsByNetwork(checkResult.assets, checkResult.network);

      const balancePayload = grouped.map((row) => ({
        address: checkResult.address,
        network: row.network,
        assets: row.assets,
      }));

      const balanceResult = await queryAddressBalance(balancePayload, options);
      const balanceRows = Array.isArray(balanceResult?.items) ? balanceResult.items : [];
      const mergedItems = balanceRows.flatMap((row) => mapAddressBalanceToSearchItems(row));

      if (balanceRows.length > 0) {
        return mergedItems;
      }

      return mapAddressCheckToSearchItems(checkResult);
    } catch {
      return [];
    }
  }

  return {
    id: "evm-address",
    chain: "evm",
    networks: ["eth", "bsc", "fork", "hardhat"],
    capabilities: ["address"],
    searchAddress,
  };
}

export default {
  createEvmAddressSearchProvider,
};
