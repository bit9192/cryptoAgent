import { offchainPost } from "./../request.js";
import { networks as evmNetworks } from "../../../config/networks.ts";

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
  trx: "tron-mainnet",
  trx_testnet: "tron-testnet",
  btc: "bitcoin-mainnet",
  btc_testnet: "bitcoin-testnet"
})

function normalizeNetwork(networkInput) {
  const network = String(networkInput ?? "").trim().toLowerCase();
  if (!network) {
    throw new Error("network 不能为空");
  }
  return network;
}

function normalizeAddress(addressInput) {
  const address = String(addressInput ?? "").trim();
  if (!EVM_ADDRESS_RE.test(address)) {
    throw new Error(`非法 EVM 地址: ${addressInput}`);
  }
  return address;
}

function resolveApiKey(options = {}) {
  const key = String(
    options.apiKey
    ?? process.env.ALCHEMY_API_KEY
    ?? "",
  ).trim();
  return key || null;
}

function normalizeDataNetworks(networksInput) {
  if (!Array.isArray(networksInput) || networksInput.length === 0) {
    throw new Error("networks 必传，且必须是非空数组");
  }

  const normalized = networksInput
    .map((item) => String(item ?? "").trim().toLowerCase())
    .filter(Boolean)
    .map((item) => ALCHEMY_NETWORK_SEGMENT[item] ?? item);

  if (normalized.length === 0) {
    throw new Error("networks 必传，且不能为空");
  }

  return [...new Set(normalized)];
}

function normalizeRequestedNetworks(networksInput) {
  if (!Array.isArray(networksInput) || networksInput.length === 0) {
    throw new Error("networks 必传，且必须是非空数组");
  }

  return [...new Set(
    networksInput
      .map((item) => String(item ?? "").trim().toLowerCase())
      .filter(Boolean),
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
  if (value === null || value === undefined) return null;
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

  const next = {
    ...rawAsset,
    ...(mappedNetwork ? { network: mappedNetwork } : {}),
  };

  if (Array.isArray(rawAsset.networks)) {
    next.networks = rawAsset.networks.map((item) => {
      const raw = String(item ?? "").trim().toLowerCase();
      return segmentInputMap.get(raw) ?? raw;
    });
  }

  const tokenBalance = toBigIntSafe(rawAsset.tokenBalance);
  if (tokenBalance !== null) {
    next.tokenBalance = tokenBalance;
  }

  const tokenBalances = toBigIntSafe(rawAsset.tokenBalances);
  if (tokenBalances !== null) {
    next.tokenBalances = tokenBalances;
  }

  return next;
}

function resolveDataApiUrl(options = {}) {
  const apiKey = resolveApiKey(options);
  if (!apiKey) {
    throw new Error("缺少 Alchemy API Key，请设置 ALCHEMY_API_KEY 或 options.apiKey");
  }

  const baseUrl = String(options.dataApiBaseUrl ?? "https://api.g.alchemy.com/data/v1").trim().replace(/\/+$/, "");
  return `${baseUrl}/${apiKey}/assets/tokens/by-address`;
}

function resolveRpcUrl(networkInput, options = {}) {
  const network = normalizeNetwork(networkInput);

  if (options.rpcUrl) {
    return String(options.rpcUrl).trim();
  }

  const rpcByNetwork = options.rpcByNetwork && typeof options.rpcByNetwork === "object"
    ? options.rpcByNetwork
    : null;
  if (rpcByNetwork?.[network]) {
    return String(rpcByNetwork[network]).trim();
  }

  const envKey = `ALCHEMY_${network.replace(/[^a-z0-9]/gi, "_").toUpperCase()}_RPC_URL`;
  const envRpc = String(process.env[envKey] ?? "").trim();
  if (envRpc) {
    return envRpc;
  }

  const apiKey = resolveApiKey(options);
  const segment = ALCHEMY_NETWORK_SEGMENT[network] ?? null;
  if (segment && apiKey) {
    return `https://${segment}.g.alchemy.com/v2/${apiKey}`;
  }

  // 最后回退到项目 EVM 网络 RPC，方便多链统一接入
  const fallback = String(evmNetworks?.[network]?.rpc ?? "").trim();
  if (fallback) {
    return fallback;
  }

  throw new Error(
    `未找到 network=${network} 的 Alchemy RPC。` +
    "请设置 ALCHEMY_API_KEY + 可识别网络，或传入 options.rpcUrl / options.rpcByNetwork。",
  );
}

export async function alchemyRpc(networkInput, methodInput, params = [], options = {}) {
  const network = normalizeNetwork(networkInput);
  const method = String(methodInput ?? "").trim();
  if (!method) {
    throw new Error("method 不能为空");
  }

  const rpcUrl = resolveRpcUrl(network, options);
  const payload = {
    jsonrpc: "2.0",
    id: Number(options.id ?? Date.now()),
    method,
    params: Array.isArray(params) ? params : [],
  };

  const res = await offchainPost(rpcUrl, payload, {
    timeoutMs: Number(options.timeoutMs ?? 15_000),
    headers: options.headers ?? {},
  });
  const data = res?.data ?? null;
  if (!data || typeof data !== "object") {
    throw new Error(`Alchemy RPC 响应无效: network=${network}, method=${method}`);
  }

  if (data.error) {
    const code = data.error?.code ?? "UNKNOWN";
    const message = data.error?.message ?? "request failed";
    throw new Error(`Alchemy RPC 错误 [${network}] ${method}: (${code}) ${message}`);
  }

  return {
    network,
    rpcUrl,
    result: data.result,
  };
}

export async function alchemyGetAddressAssets(addressInput, networksInput, options = {}) {
  const address = normalizeAddress(addressInput);
  const requestedNetworks = normalizeRequestedNetworks(networksInput);
  const networks = normalizeDataNetworks(networksInput);
  const segmentInputMap = buildSegmentInputMap(requestedNetworks);
  const url = resolveDataApiUrl(options);

  const payload = {
    addresses: [
      {
        address,
        networks,
      },
    ],
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
    if (Array.isArray(row?.tokens)) {
      return row.tokens
        .map((asset) => normalizeAssetRow(asset, segmentInputMap))
        .filter(Boolean);
    }
    if (Array.isArray(row?.tokenBalances)) {
      return row.tokenBalances
        .map((asset) => normalizeAssetRow(asset, segmentInputMap))
        .filter(Boolean);
    }
    return [];
  });

  return {
    ok: true,
    source: "alchemy-data",
    address,
    networks: requestedNetworks,
    pageKey: data?.pageKey ?? payloadData?.pageKey ?? null,
    total: assets.length,
    error: null,
    assets,
    rows,
    raw: data,
  };
}

export { resolveRpcUrl as resolveAlchemyRpcUrl };

export default {
  alchemyRpc,
  alchemyGetAddressAssets,
  resolveAlchemyRpcUrl: resolveRpcUrl,
};