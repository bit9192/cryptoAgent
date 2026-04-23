import { evmNetworks } from "../../evm/configs/networks.js";
import { offchainGet } from "../request.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeNetworkName(networkName) {
  const raw = String(networkName ?? "eth").trim().toLowerCase();
  if (raw === "ethmain" || raw === "ethereum") return "eth";
  return raw || "eth";
}

function resolveNetworkConfig(networkName) {
  const normalized = normalizeNetworkName(networkName);
  const config = evmNetworks[normalized];
  if (!config?.etherscan?.apiURL) {
    throw new Error(`EVM explorer 未配置网络: ${normalized}`);
  }
  return { normalized, config };
}

function withQuery(url, params = {}) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || String(value).trim() === "") continue;
    u.searchParams.set(key, String(value));
  }
  return u.toString();
}

function wrapExplorerResult(meta = {}, response = {}) {
  return {
    ok: Boolean(response.ok),
    chain: String(meta.chain ?? "").trim() || null,
    network: String(meta.network ?? "").trim() || null,
    source: String(meta.source ?? "explorer").trim(),
    data: response.ok ? response.data : null,
    error: response.ok ? null : response.error,
    raw: {
      data: response.data ?? null,
      httpStatus: response.httpStatus ?? null,
      headers: response.headers ?? {},
    },
  };
}

async function requestExplorer(url, options = {}) {
  try {
    const response = await offchainGet(url, {
      headers: options.headers ?? {},
      timeoutMs: Number(options.timeoutMs ?? 15000),
      retryCount: Number(options.retryCount ?? 1),
    });
    return {
      ok: true,
      data: response?.data ?? null,
      httpStatus: response?.status ?? null,
      headers: response?.headers ?? {},
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      httpStatus: Number(error?.status ?? 0) || null,
      headers: {},
      error: error?.message ?? String(error),
    };
  }
}

function isExplorerRateLimited(payload) {
  const text = String(payload?.result ?? payload?.message ?? "").toLowerCase();
  return text.includes("rate limit");
}

async function callExplorerApi(config, params, options = {}) {
  const maxAttempts = Number(options.maxAttempts ?? 3);
  const retryDelayMs = Number(options.retryDelayMs ?? 450);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const url = withQuery(config.etherscan.apiURL, params);
    const res = await requestExplorer(url, { timeoutMs: options.timeoutMs });
    if (!res.ok) {
      return res;
    }

    const payload = res.data;
    if (String(payload?.status ?? "") === "0" && isExplorerRateLimited(payload) && attempt < maxAttempts) {
      await sleep(retryDelayMs * attempt);
      continue;
    }

    return res;
  }

  return {
    ok: false,
    data: null,
    error: "explorer 请求失败",
    httpStatus: null,
    headers: {},
  };
}

export async function getContractAbi(address, options = {}) {
  const target = String(address ?? "").trim();
  if (!target) throw new Error("address 不能为空");

  const { normalized, config } = resolveNetworkConfig(options.network);
  const apiKey = options.apiKey ?? config.etherscan.apiKey ?? process.env.ETHERSCAN_API_KEY ?? "";
  const res = await callExplorerApi(config, {
    module: "contract",
    action: "getabi",
    address: target,
    apikey: apiKey,
  }, options);

  let parsedAbi = null;
  if (res.ok) {
    const rawAbi = res.data?.result;
    if (typeof rawAbi === "string" && rawAbi.trim()) {
      try {
        parsedAbi = JSON.parse(rawAbi);
      } catch {
        parsedAbi = rawAbi;
      }
    } else {
      parsedAbi = rawAbi ?? null;
    }
  }

  let implementation = null;
  let implementationAbi = null;
  const shouldResolveImplementation = options.resolveImplementation !== false;

  if (res.ok && shouldResolveImplementation) {
    const sourceInfo = await callExplorerApi(config, {
      module: "contract",
      action: "getsourcecode",
      address: target,
      apikey: apiKey,
    }, options);

    const meta = Array.isArray(sourceInfo?.data?.result) ? sourceInfo.data.result[0] : null;
    const implementationAddress = String(meta?.Implementation ?? "").trim();
    const isProxy = String(meta?.Proxy ?? "0") === "1";

    if (isProxy && implementationAddress) {
      implementation = implementationAddress;
      const implAbiRes = await callExplorerApi(config, {
        module: "contract",
        action: "getabi",
        address: implementationAddress,
        apikey: apiKey,
      }, options);

      if (implAbiRes.ok) {
        const rawImplAbi = implAbiRes.data?.result;
        if (typeof rawImplAbi === "string" && rawImplAbi.trim()) {
          try {
            implementationAbi = JSON.parse(rawImplAbi);
          } catch {
            implementationAbi = rawImplAbi;
          }
        } else {
          implementationAbi = rawImplAbi ?? null;
        }
      }
    }
  }

  return wrapExplorerResult(
    { chain: "evm", network: normalized, source: "etherscan" },
    {
      ...res,
      data: res.ok
        ? {
            address: target,
            abi: parsedAbi,
            implementation,
            implementationAbi,
            status: res.data?.status ?? null,
            message: res.data?.message ?? null,
          }
        : null,
    },
  );
}

export async function getContractSource(address, options = {}) {
  const target = String(address ?? "").trim();
  if (!target) throw new Error("address 不能为空");

  const { normalized, config } = resolveNetworkConfig(options.network);
  const apiKey = options.apiKey ?? config.etherscan.apiKey ?? process.env.ETHERSCAN_API_KEY ?? "";
  const res = await callExplorerApi(config, {
    module: "contract",
    action: "getsourcecode",
    address: target,
    apikey: apiKey,
  }, options);

  const row = Array.isArray(res?.data?.result) ? (res.data.result[0] ?? null) : null;
  const sourceCode = String(row?.SourceCode ?? "");
  const implementation = String(row?.Implementation ?? "").trim() || null;
  const isProxy = String(row?.Proxy ?? "0") === "1";
  const isOpenSource = sourceCode.trim().length > 0;

  return wrapExplorerResult(
    { chain: "evm", network: normalized, source: "etherscan" },
    {
      ...res,
      data: res.ok
        ? {
            address: target,
            contractName: String(row?.ContractName ?? "").trim() || null,
            compilerVersion: String(row?.CompilerVersion ?? "").trim() || null,
            optimizationUsed: String(row?.OptimizationUsed ?? "").trim() || null,
            runs: String(row?.Runs ?? "").trim() || null,
            licenseType: String(row?.LicenseType ?? "").trim() || null,
            constructorArguments: String(row?.ConstructorArguments ?? "").trim() || null,
            isProxy,
            implementation,
            isOpenSource,
            sourceCode,
            status: res.data?.status ?? null,
            message: res.data?.message ?? null,
          }
        : null,
    },
  );
}

export default {
  getContractAbi,
  getContractSource,
};
