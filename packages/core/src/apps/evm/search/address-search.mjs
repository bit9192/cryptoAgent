import { getAddress } from "ethers";

import { getEvmNetworkConfig } from "../configs/networks.js";
import { queryEvmTokenMetadata } from "../assets/token-metadata.mjs";
import { queryEvmTokenBalanceBatch } from "../assets/balance-batch.mjs";
import { alchemyGetAddressAssets } from "./alchemy-assets.mjs";
import { searchToken as searchEvmToken } from "./token-provider.mjs";
import { resolveEvmTokenCandidates } from "./token-resolver.mjs";

const NATIVE_TOKEN_ADDRESS = "native";
const DEFAULT_ALCHEMY_DISCOVERY_NETWORKS = Object.freeze(["eth", "bsc", "base", "arb", "op", "polygon"]);

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toFiniteNumberOrNull(value) {
  if (value == null || String(value).trim?.() === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeAddress(value, fieldName) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return getAddress(raw);
}

function normalizeNetwork(value, fieldName = "network") {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return raw;
}

function normalizeNetworkList(value = []) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list
    .map((item) => String(item ?? "").trim().toLowerCase())
    .filter(Boolean))];
}

function resolveAlchemyDiscoveryNetworks(input = {}, options = {}) {
  const explicit = String(input?.network ?? "").trim().toLowerCase();
  if (explicit) {
    return [explicit];
  }

  if (Array.isArray(options.assetDiscoveryNetworks) && options.assetDiscoveryNetworks.length > 0) {
    return normalizeNetworkList(options.assetDiscoveryNetworks);
  }

  if (Array.isArray(options.networkPriority) && options.networkPriority.length > 0) {
    return normalizeNetworkList(options.networkPriority);
  }

  return [...DEFAULT_ALCHEMY_DISCOVERY_NETWORKS];
}

function normalizeAssetItem(item = {}) {
  const assetTypeRaw = String(item?.assetType ?? "erc20").trim().toLowerCase();
  const assetType = assetTypeRaw || "erc20";
  const rawAddress = String(item?.address ?? "").trim();

  const address = normalizeLower(rawAddress) === NATIVE_TOKEN_ADDRESS
    ? NATIVE_TOKEN_ADDRESS
    : normalizeAddress(rawAddress, "asset.address");

  const decimals = toFiniteNumberOrNull(item?.decimals);

  return {
    assetType,
    address,
    symbol: String(item?.symbol ?? "").trim() || null,
    name: String(item?.name ?? "").trim() || null,
    decimals,
    extra: item?.extra && typeof item.extra === "object" ? { ...item.extra } : undefined,
  };
}

function tryResolveAssetAddress(rawAsset = {}) {
  const candidateList = [
    rawAsset?.tokenAddress,
    rawAsset?.contractAddress,
    rawAsset?.token?.address,
    rawAsset?.address,
  ];

  for (const value of candidateList) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    if (normalizeLower(raw) === NATIVE_TOKEN_ADDRESS) {
      return NATIVE_TOKEN_ADDRESS;
    }
    try {
      return normalizeAddress(raw, "asset.address");
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeAlchemyAssetRows(rows = [], ownerAddress = null) {
  const input = Array.isArray(rows) ? rows : [];
  const assets = [];
  const owner = ownerAddress ? normalizeLower(ownerAddress) : null;
  for (const row of input) {
    const address = tryResolveAssetAddress(row);
    if (!address || normalizeLower(address) === NATIVE_TOKEN_ADDRESS) continue;
    if (owner && normalizeLower(address) === owner) continue;
    const tokenBalanceRaw = row?.tokenBalance ?? row?.tokenBalances ?? null;
    const tokenBalance = tokenBalanceRaw == null
      ? null
      : String(tokenBalanceRaw).trim();
    assets.push({
      assetType: String(row?.assetType ?? "erc20").trim().toLowerCase() || "erc20",
      address,
      symbol: String(row?.symbol ?? row?.tokenSymbol ?? "").trim() || null,
      name: String(row?.name ?? row?.tokenName ?? "").trim() || null,
      decimals: toFiniteNumberOrNull(row?.decimals),
      extra: {
        source: "alchemy-data",
        network: String(row?.network ?? "").trim() || null,
        ...(tokenBalance ? { alchemyTokenBalance: tokenBalance } : {}),
      },
    });
  }
  return assets;
}

function normalizeAssetList(input = [], options = {}) {
  const includeNative = options.includeNative !== false;
  const list = Array.isArray(input) ? input : [];
  const normalized = list.map((item) => normalizeAssetItem(item));
  const hasNative = normalized.some((item) => normalizeLower(item.address) === NATIVE_TOKEN_ADDRESS);

  if (includeNative && !hasNative) {
    normalized.unshift({
      assetType: "native",
      address: NATIVE_TOKEN_ADDRESS,
      symbol: null,
      name: null,
      decimals: null,
    });
  }

  const dedup = new Map();
  for (const item of normalized) {
    const key = `${normalizeLower(item.assetType)}:${normalizeLower(item.address)}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }
  return [...dedup.values()];
}

async function enrichMissingAssetMetadata(assets = [], network, options = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const localResolved = list.map((asset) => {
    const address = normalizeLower(asset?.address);
    if (!address || address === NATIVE_TOKEN_ADDRESS) return asset;

    const matched = resolveEvmTokenCandidates({
      query: asset.address,
      queryKind: "address",
      network,
    })[0] ?? null;
    if (!matched) return asset;

    return {
      ...asset,
      symbol: asset.symbol ?? matched.symbol ?? null,
      name: asset.name ?? matched.name ?? null,
      decimals: asset.decimals ?? toFiniteNumberOrNull(matched.decimals),
    };
  });

  const targets = localResolved.filter((asset) => {
    const address = normalizeLower(asset?.address);
    if (!address || address === NATIVE_TOKEN_ADDRESS) return false;
    return asset?.symbol == null || asset?.name == null || asset?.decimals == null;
  });

  if (targets.length === 0) {
    return localResolved;
  }

  const queryMetadataBatch = typeof options.queryMetadataBatch === "function"
    ? options.queryMetadataBatch
    : queryEvmTokenMetadata;

  let metadataItems = [];
  try {
    const metadataRes = await queryMetadataBatch({
      items: targets.map((asset) => ({ tokenAddress: asset.address })),
      network,
      ...options,
    });
    metadataItems = Array.isArray(metadataRes?.items) ? metadataRes.items : [];
  } catch {
    return list;
  }

  const metadataMap = new Map(
    metadataItems.map((item) => [normalizeLower(item?.tokenAddress), item]),
  );

  const mergedByMulticall = localResolved.map((asset) => {
    const metadata = metadataMap.get(normalizeLower(asset?.address));
    if (!metadata) return asset;
    return {
      ...asset,
      symbol: asset.symbol ?? metadata.symbol ?? null,
      name: asset.name ?? metadata.name ?? null,
      decimals: asset.decimals ?? metadata.decimals ?? null,
    };
  });

  const fallbackTargets = mergedByMulticall.filter((asset) => {
    const address = normalizeLower(asset?.address);
    if (!address || address === NATIVE_TOKEN_ADDRESS) return false;
    return asset?.symbol == null || asset?.name == null || asset?.decimals == null;
  });

  if (fallbackTargets.length === 0) {
    return mergedByMulticall;
  }

  const tokenSearch = typeof options.tokenSearch === "function" ? options.tokenSearch : searchEvmToken;
  const fallbackRows = await Promise.all(fallbackTargets.map(async (asset) => {
   
    try {
      const rows = await tokenSearch({
        query: asset.address,
        network,
        limit: 1,
      }, options);
      const first = Array.isArray(rows) ? rows[0] : null;
      if (!first) return null;
      return {
        tokenAddress: asset.address,
        symbol: String(first?.symbol ?? "").trim() || null,
        name: String(first?.name ?? "").trim() || null,
        decimals: toFiniteNumberOrNull(first?.decimals),
      };
    } catch {
      return null;
    }
  }));

  const fallbackMap = new Map(
    fallbackRows
      .filter(Boolean)
      .map((item) => [normalizeLower(item?.tokenAddress), item]),
  );

  return mergedByMulticall.map((asset) => {
    const fallback = fallbackMap.get(normalizeLower(asset?.address));
    if (!fallback) return asset;
    return {
      ...asset,
      symbol: asset.symbol ?? fallback.symbol ?? null,
      name: asset.name ?? fallback.name ?? null,
      decimals: asset.decimals ?? fallback.decimals ?? null,
    };
  });
}

function toCheckBatchInput(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray(input.items)) return input.items;
  throw new Error("batch 输入必须是数组");
}

function toBalanceByNetworkBatchInput(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && Array.isArray(input.items)) return input.items;
  throw new Error("batch 输入必须是数组");
}

function resolveGasTokenSymbol(network) {
  try {
    const cfg = getEvmNetworkConfig(network);
    return String(cfg?.gasToken ?? "").trim() || null;
  } catch {
    return null;
  }
}

function formatUnitsString(rawBalance, decimals) {
  const value = BigInt(rawBalance ?? 0n);
  const unit = Number.isFinite(Number(decimals)) ? Number(decimals) : 0;
  if (unit <= 0) return value.toString();

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(unit);
  const whole = abs / base;
  const fraction = abs % base;
  if (fraction === 0n) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }
  const fractionText = fraction.toString().padStart(unit, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}.${fractionText}`;
}

function toBigIntOrNull(value) {
  if (typeof value === "bigint") return value;
  if (value == null) return null;
  try {
    const text = String(value).trim();
    if (!text) return null;
    return BigInt(text);
  } catch {
    return null;
  }
}

function extractPreloadedRawBalance(asset = {}) {
  const extra = asset?.extra && typeof asset.extra === "object" ? asset.extra : {};
  return toBigIntOrNull(
    extra?.rawBalance
    ?? extra?.alchemyTokenBalance
    ?? extra?.balance,
  );
}

async function resolveAddressType(input = {}, options = {}) {
  if (typeof options.addressTypeResolver === "function") {
    return String(await options.addressTypeResolver(input, options) ?? "unknown").trim().toLowerCase() || "unknown";
  }

  const provider = options.provider;
  if (!provider || typeof provider.getCode !== "function") {
    return "unknown";
  }

  try {
    const code = await provider.getCode(input.address);
    if (!code || code === "0x") return "eoa";
  } catch {
    return "unknown";
  }

  try {
    const metadata = await queryEvmTokenMetadata({
      tokenAddress: input.address,
      network: input.network,
      ...(options.tokenMetadataOptions && typeof options.tokenMetadataOptions === "object" ? options.tokenMetadataOptions : {}),
    });
    if (metadata?.symbol || metadata?.name || Number.isFinite(Number(metadata?.decimals))) {
      return "erc20";
    }
    return "contract";
  } catch {
    return "contract";
  }
}

async function resolveAssetsForAddress(input = {}, addressType = "unknown", options = {}) {
  const baseAssets = [];
  if (addressType === "erc20") {
    try {
      const metadata = await queryEvmTokenMetadata({
        tokenAddress: input.address,
        network: input.network,
        ...(options.tokenMetadataOptions && typeof options.tokenMetadataOptions === "object" ? options.tokenMetadataOptions : {}),
      });
      baseAssets.push({
        assetType: "erc20",
        address: input.address,
        symbol: String(metadata?.symbol ?? "").trim() || null,
        name: String(metadata?.name ?? "").trim() || null,
        decimals: toFiniteNumberOrNull(metadata?.decimals),
      });
    } catch {
      baseAssets.push({
        assetType: "erc20",
        address: input.address,
        symbol: null,
        name: null,
        decimals: null,
      });
    }
  }

  let externalAssets = [];
  if (typeof options.assetListResolver === "function") {
    try {
      const resolved = await options.assetListResolver({ ...input, addressType }, options);
      externalAssets = Array.isArray(resolved) ? resolved : [];
    } catch {
      externalAssets = [];
    }
  } else if (options.enableAlchemyAssetDiscovery !== false) {
    try {
      const resolver = typeof options.alchemyGetAddressAssets === "function"
        ? options.alchemyGetAddressAssets
        : alchemyGetAddressAssets;
      const networks = Array.isArray(input?.discoveryNetworks) && input.discoveryNetworks.length > 0
        ? input.discoveryNetworks
        : [input.network];
      const alchemyRes = await resolver(input.address, networks, options.alchemyOptions ?? options);
      
      externalAssets = normalizeAlchemyAssetRows(alchemyRes?.assets ?? [], input.address);
    } catch {
      externalAssets = [];
    }
  }
  
  return normalizeAssetList([...baseAssets, ...externalAssets], options);
}

export async function queryAddressCheck(input = {}, options = {}) {
  const address = normalizeAddress(input?.address, "address");
  const explicitNetwork = String(input?.network ?? "").trim();
  const network = explicitNetwork ? normalizeNetwork(explicitNetwork, "network") : null;
  const primaryNetwork = network ?? "eth";

  const normalized = { address, network: primaryNetwork, chain: "evm" };
  let addressType = "unknown";
  try {
    addressType = await resolveAddressType(normalized, options);
  } catch {
    addressType = "unknown";
  }

  const assets = await resolveAssetsForAddress(
    {
      ...normalized,
      discoveryNetworks: resolveAlchemyDiscoveryNetworks(input, options),
    },
    addressType,
    options,
  );
  
  return {
    ok: true,
    chain: "evm",
    network: primaryNetwork,
    address,
    addressType,
    assets,
  };
}

export async function queryAddressCheckBatch(input = [], options = {}) {
  const rows = toCheckBatchInput(input);
  const items = await Promise.all(rows.map((item) => queryAddressCheck(item, options)));
  return { ok: true, items };
}

function normalizeBalanceQueryItem(item = {}, network) {
  const address = normalizeAddress(item?.address, "address");
  const rawAssets = Array.isArray(item?.assets)
    ? item.assets
    : (Array.isArray(item?.assest) ? item.assest : []);
  const assets = normalizeAssetList(rawAssets, item);
  return {
    chain: "evm",
    network,
    address,
    assets,
  };
}

export async function queryAddressBalanceByNetwork(input = [], network, options = {}) {
  const rows = toBalanceByNetworkBatchInput(input);
  const networkName = normalizeNetwork(network, "network");
  const gasToken = resolveGasTokenSymbol(networkName);
   
  const normalizedRows = await Promise.all(
    rows.map(async (item) => {
      const normalized = normalizeBalanceQueryItem(item, networkName);
      return {
        ...normalized,
        assets: await enrichMissingAssetMetadata(normalized.assets, networkName, options),
      };
    }),
  );

   

  const pairRows = [];
  const preloadedBalanceMap = new Map();
  for (const row of normalizedRows) {
    for (const asset of row.assets) {
      const ownerAddress = row.address;
      const tokenAddress = asset.address;
      const key = `${normalizeLower(ownerAddress)}:${normalizeLower(tokenAddress)}`;
      const preloaded = extractPreloadedRawBalance(asset);

      if (preloaded != null) {
        preloadedBalanceMap.set(key, preloaded);
        continue;
      }

      pairRows.push({
        address: ownerAddress,
        token: tokenAddress,
      });
    }
  }

  const queryBalanceBatch = typeof options.queryBalanceBatch === "function"
    ? options.queryBalanceBatch
    : queryEvmTokenBalanceBatch;

  let balanceItems = [];
  if (pairRows.length > 0) {
    const balanceRes = await queryBalanceBatch(pairRows, {
      ...options,
      network: networkName,
    });
    balanceItems = Array.isArray(balanceRes?.items) ? balanceRes.items : [];
  }

  const balanceMap = new Map(preloadedBalanceMap);
  for (const row of balanceItems) {
    const key = `${normalizeLower(row?.ownerAddress)}:${normalizeLower(row?.tokenAddress)}`;
    const amount = row?.balance == null ? 0n : BigInt(row.balance);
    balanceMap.set(key, amount);
  }

  const items = normalizedRows.map((row) => {
    const balances = row.assets.map((asset) => {
      const key = `${normalizeLower(row.address)}:${normalizeLower(asset.address)}`;
      const rawBalance = balanceMap.get(key) ?? 0n;
      const decimals = toFiniteNumberOrNull(asset?.decimals) != null
        ? Number(asset.decimals)
        : (normalizeLower(asset.address) === NATIVE_TOKEN_ADDRESS ? 18 : null);
      return {
        assetType: asset.assetType,
        address: asset.address,
        symbol: asset.symbol ?? (normalizeLower(asset.address) === NATIVE_TOKEN_ADDRESS ? gasToken : null),
        name: asset.name,
        decimals,
        rawBalance,
        formatted: formatUnitsString(rawBalance, decimals ?? 0),
        ...(asset.extra && typeof asset.extra === "object" ? { extra: { ...asset.extra } } : {}),
      };
    });

    return {
      ok: true,
      chain: "evm",
      network: row.network,
      address: row.address,
      balances,
    };
  });

  return {
    ok: true,
    chain: "evm",
    network: networkName,
    items,
  };
}

export async function queryAddressBalance(input = [], options = {}) {
  const rows = toBalanceByNetworkBatchInput(input);
  const indexed = rows.map((item, index) => {
    const network = normalizeNetwork(item?.network, "network");
    return { item, index, network };
  });

  const groups = new Map();
  for (const row of indexed) {
    if (!groups.has(row.network)) groups.set(row.network, []);
    groups.get(row.network).push(row);
  }

  const groupedResults = await Promise.all([...groups.entries()].map(async ([network, groupRows]) => {
    const payload = groupRows.map((row) => row.item);
    const result = await queryAddressBalanceByNetwork(payload, network, options);
    return {
      network,
      groupRows,
      items: Array.isArray(result?.items) ? result.items : [],
    };
  }));

  const output = new Array(rows.length);
  for (const group of groupedResults) {
    for (let i = 0; i < group.groupRows.length; i += 1) {
      const index = group.groupRows[i].index;
      output[index] = group.items[i] ?? {
        ok: true,
        chain: "evm",
        network: group.network,
        address: normalizeAddress(group.groupRows[i].item?.address, "address"),
        balances: [],
      };
    }
  }

  return {
    ok: true,
    items: output,
  };
}

export default {
  queryAddressCheck,
  queryAddressCheckBatch,
  queryAddressBalanceByNetwork,
  queryAddressBalance,
};
