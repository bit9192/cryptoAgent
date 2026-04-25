import { offchainPost } from "../../offchain/request.mjs";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const ALCHEMY_NETWORK_SEGMENT = Object.freeze({
  eth: "eth-mainnet",
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  polygon: "polygon-mainnet",
  arbitrum: "arb-mainnet",
  arb: "arb-mainnet",
  optimism: "opt-mainnet",
  opt: "opt-mainnet",
  sepolia: "eth-sepolia",
  base_sepolia: "base-sepolia",
  arb_sepolia: "arb-sepolia",
  opt_sepolia: "opt-sepolia",
  bsc: "bnb-mainnet",
});

function normalizeAddress(addressInput) {
  const address = String(addressInput ?? "").trim();
  if (!EVM_ADDRESS_RE.test(address)) {
    throw new Error(`非法 EVM 地址: ${addressInput ?? ""}`);
  }
  return address;
}

function normalizeNetwork(networkInput) {
  const network = String(networkInput ?? "").trim().toLowerCase();
  if (!network) {
    throw new Error("network 不能为空");
  }
  return network;
}

function resolveApiKey(options = {}) {
  const key = String(options.apiKey ?? process.env.ALCHEMY_API_KEY ?? "").trim();
  return key || null;
}

function resolveDataApiUrl(options = {}) {
  const apiKey = resolveApiKey(options);
  if (!apiKey) {
    throw new Error("缺少 Alchemy API Key，请设置 ALCHEMY_API_KEY 或 options.apiKey");
  }

  const baseUrl = String(options.dataApiBaseUrl ?? "https://api.g.alchemy.com/data/v1")
    .trim()
    .replace(/\/+$/, "");
  return `${baseUrl}/${apiKey}/assets/tokens/by-address`;
}

function normalizeRequestedNetworks(networksInput) {
  if (!Array.isArray(networksInput) || networksInput.length === 0) {
    throw new Error("networks 必传，且必须是非空数组");
  }

  const normalized = networksInput
    .map((item) => normalizeNetwork(item))
    .filter(Boolean);

  return [...new Set(normalized)];
}

function normalizeDataNetworks(requestedNetworks = []) {
  return [...new Set(
    requestedNetworks.map((item) => ALCHEMY_NETWORK_SEGMENT[item] ?? item),
  )];
}

function buildSegmentInputMap(requestedNetworks = []) {
  const map = new Map();
  for (const name of requestedNetworks) {
    const segment = ALCHEMY_NETWORK_SEGMENT[name] ?? name;
    if (!map.has(segment)) {
      map.set(segment, name);
    }
  }
  return map;
}

function toBigIntSafe(value) {
  if (typeof value === "bigint") return value;
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  try {
    return BigInt(text);
  } catch {
    return null;
  }
}

function normalizeAssetRow(rawAsset, segmentInputMap) {
  if (!rawAsset || typeof rawAsset !== "object") return null;
  const networkRaw = String(rawAsset.network ?? "").trim().toLowerCase();
  const mappedNetwork = networkRaw ? (segmentInputMap.get(networkRaw) ?? networkRaw) : null;

  const tokenBalance = toBigIntSafe(rawAsset.tokenBalance ?? rawAsset.tokenBalances ?? null);

  return {
    ...rawAsset,
    ...(mappedNetwork ? { network: mappedNetwork } : {}),
    ...(tokenBalance != null ? { tokenBalance } : {}),
  };
}

export async function alchemyGetAddressAssets(addressInput, networksInput, options = {}) {
  const address = normalizeAddress(addressInput);
  const requestedNetworks = normalizeRequestedNetworks(networksInput);
  const networks = normalizeDataNetworks(requestedNetworks);
  const segmentInputMap = buildSegmentInputMap(requestedNetworks);
  const url = resolveDataApiUrl(options);

  const payload = {
    addresses: [{ address, networks }],
  };

  const res = await offchainPost(url, payload, {
    timeoutMs: Number(options.timeoutMs ?? 15_000),
    headers: options.headers ?? {},
  });

  const data = res?.data ?? null;
  if (!data || typeof data !== "object") {
    throw new Error("Alchemy Data API 响应无效");
  }

  const payloadData = data?.data;
  const rows = Array.isArray(payloadData)
    ? payloadData
    : (payloadData && typeof payloadData === "object" ? [payloadData] : []);

  const assets = rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    if (Array.isArray(row.tokens)) {
      return row.tokens.map((asset) => normalizeAssetRow(asset, segmentInputMap)).filter(Boolean);
    }
    if (Array.isArray(row.tokenBalances)) {
      return row.tokenBalances.map((asset) => normalizeAssetRow(asset, segmentInputMap)).filter(Boolean);
    }
    return [];
  });

  return {
    ok: true,
    source: "alchemy-data",
    address,
    networks: requestedNetworks,
    total: assets.length,
    pageKey: data?.pageKey ?? payloadData?.pageKey ?? null,
    assets,
    rows,
  };
}

export default {
  alchemyGetAddressAssets,
};
