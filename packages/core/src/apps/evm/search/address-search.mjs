import { getAddress } from "ethers";

import { getEvmNetworkConfig } from "../configs/networks.js";
import { queryEvmTokenMetadata } from "../assets/token-metadata.mjs";
import { queryEvmTokenBalanceBatch } from "../assets/balance-batch.mjs";
import { alchemyGetAddressAssets } from "./alchemy-assets.mjs";

const NATIVE_TOKEN_ADDRESS = "native";

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
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

function normalizeAssetItem(item = {}) {
  const assetTypeRaw = String(item?.assetType ?? "erc20").trim().toLowerCase();
  const assetType = assetTypeRaw || "erc20";
  const rawAddress = String(item?.address ?? "").trim();

  const address = normalizeLower(rawAddress) === NATIVE_TOKEN_ADDRESS
    ? NATIVE_TOKEN_ADDRESS
    : normalizeAddress(rawAddress, "asset.address");

  const decimals = Number.isFinite(Number(item?.decimals)) ? Number(item.decimals) : null;

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
    assets.push({
      assetType: String(row?.assetType ?? "erc20").trim().toLowerCase() || "erc20",
      address,
      symbol: String(row?.symbol ?? row?.tokenSymbol ?? "").trim() || null,
      name: String(row?.name ?? row?.tokenName ?? "").trim() || null,
      decimals: Number.isFinite(Number(row?.decimals)) ? Number(row.decimals) : null,
      extra: {
        source: "alchemy-data",
        network: String(row?.network ?? "").trim() || null,
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
        decimals: Number.isFinite(Number(metadata?.decimals)) ? Number(metadata.decimals) : null,
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
      const alchemyRes = await resolver(input.address, [input.network], options.alchemyOptions ?? options);
      externalAssets = normalizeAlchemyAssetRows(alchemyRes?.assets ?? [], input.address);
    } catch {
      externalAssets = [];
    }
  }

  return normalizeAssetList([...baseAssets, ...externalAssets], options);
}

export async function queryAddressCheck(input = {}, options = {}) {
  const address = normalizeAddress(input?.address, "address");
  const network = normalizeNetwork(input?.network, "network");

  const normalized = { address, network, chain: "evm" };
  let addressType = "unknown";
  try {
    addressType = await resolveAddressType(normalized, options);
  } catch {
    addressType = "unknown";
  }

  const assets = await resolveAssetsForAddress(normalized, addressType, options);

  return {
    ok: true,
    chain: "evm",
    network,
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

  const normalizedRows = rows.map((item) => normalizeBalanceQueryItem(item, networkName));

  const pairRows = [];
  const pairMeta = [];
  for (const row of normalizedRows) {
    for (const asset of row.assets) {
      pairRows.push({
        address: row.address,
        token: asset.address,
      });
      pairMeta.push({
        ownerAddress: row.address,
        tokenAddress: asset.address,
        asset,
      });
    }
  }

  const queryBalanceBatch = typeof options.queryBalanceBatch === "function"
    ? options.queryBalanceBatch
    : queryEvmTokenBalanceBatch;

  const balanceRes = await queryBalanceBatch(pairRows, {
    ...options,
    network: networkName,
  });
  const balanceItems = Array.isArray(balanceRes?.items) ? balanceRes.items : [];

  const balanceMap = new Map();
  for (const row of balanceItems) {
    const key = `${normalizeLower(row?.ownerAddress)}:${normalizeLower(row?.tokenAddress)}`;
    const amount = row?.balance == null ? 0n : BigInt(row.balance);
    balanceMap.set(key, amount);
  }

  const items = normalizedRows.map((row) => {
    const balances = row.assets.map((asset) => {
      const key = `${normalizeLower(row.address)}:${normalizeLower(asset.address)}`;
      const rawBalance = balanceMap.get(key) ?? 0n;
      const decimals = Number.isFinite(Number(asset?.decimals))
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
