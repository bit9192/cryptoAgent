import { getTrxNetworkConfig } from "./config/networks.js";

const DEFAULT_TIMEOUT_MS = 15000;

function buildEndpoint(baseRpcUrl, segment) {
  const base = String(baseRpcUrl ?? "").replace(/\/$/, "");
  const suffix = String(segment ?? "").trim().replace(/^\/+/, "");
  return suffix ? `${base}/${suffix}` : base;
}

async function postJson(url, payload, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { "content-type": "application/json" };
    if (options.apiKey) headers["TRON-PRO-API-KEY"] = options.apiKey;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      throw new Error(`TRX 请求失败: HTTP ${response.status} ${response.statusText}`);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`TRX 请求超时: ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function createTrxNetProvider(input = {}) {
  const networkName = String(input.networkName ?? input.network ?? "mainnet").trim() || "mainnet";
  const timeoutMs = Number(input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const config = getTrxNetworkConfig(networkName);

  const walletEndpoint = buildEndpoint(config.rpcUrl, "wallet");
  const walletSolidityEndpoint = buildEndpoint(config.rpcUrl, "walletsolidity");

  const walletCall = async (method, payload = {}) => (
    postJson(buildEndpoint(walletEndpoint, method), payload, { timeoutMs, apiKey: config.apiKey })
  );

  const solidityCall = async (method, payload = {}) => (
    postJson(buildEndpoint(walletSolidityEndpoint, method), payload, { timeoutMs, apiKey: config.apiKey })
  );

  return Object.freeze({
    networkName: config.networkName,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    grpcUrl: config.grpcUrl,
    explorerUrl: config.explorerUrl,
    apiKey: config.apiKey,
    isLocal: Boolean(config.isLocal),
    providerType: String(config.providerType || "trongrid"),
    walletEndpoint,
    walletSolidityEndpoint,
    walletCall,
    solidityCall,
    async healthcheck() {
      return walletCall("getnodeinfo", {});
    },
  });
}

export function defaultTrxNetProvider() {
  return createTrxNetProvider({
    networkName: process.env.TRX_DEFAULT_NETWORK ?? process.env.TRX_NETWORK ?? "mainnet",
  });
}

export function resolveTrxNetProvider(networkNameOrProvider, fallbackOptions = {}) {
  if (networkNameOrProvider && typeof networkNameOrProvider === "object") {
    if (typeof networkNameOrProvider.walletCall === "function") return networkNameOrProvider;
    const networkName = networkNameOrProvider.networkName ?? networkNameOrProvider.network ?? fallbackOptions.networkName;
    return createTrxNetProvider({ ...fallbackOptions, ...networkNameOrProvider, networkName });
  }
  if (typeof networkNameOrProvider === "string") {
    return createTrxNetProvider({ ...fallbackOptions, networkName: networkNameOrProvider });
  }
  return defaultTrxNetProvider();
}

export default {
  createTrxNetProvider,
  defaultTrxNetProvider,
  resolveTrxNetProvider,
};
