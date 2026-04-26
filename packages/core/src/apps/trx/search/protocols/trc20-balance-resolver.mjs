import { getTrxTokenBook } from "../../config/tokens.js";
import { queryTrxTokenBalance } from "../../trc20.mjs";
import { queryTrxTokenMetadataBatch } from "../../assets/token-metadata.mjs";
import { resolveTrxNetProvider } from "../../netprovider.mjs";
import { toTrxHexAddress } from "../../address-codec.mjs";
import { createTronscanAccountTokensSource } from "../sources/tronscan-account-tokens-source.mjs";

function toBigIntSafe(value) {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.max(0, Math.floor(value)));
    if (typeof value === "string" && value.trim() !== "") return BigInt(value.trim());
  } catch {
    // ignore
  }
  return 0n;
}

function formatUnits(value, decimals) {
  const d = Number(decimals ?? 0);
  const base = 10n ** BigInt(Math.max(0, d));
  const whole = value / base;
  const fraction = value % base;

  if (fraction === 0n) {
    return whole.toString();
  }

  const padded = fraction.toString().padStart(d, "0").replace(/0+$/, "");
  return `${whole.toString()}.${padded}`;
}

function normalizeNetwork(value) {
  return String(value ?? "mainnet").trim().toLowerCase() || "mainnet";
}

function normalizeAddress(value) {
  return String(value ?? "").trim();
}

function normalizeTrc20Holdings(raw = {}) {
  const rows = [];
  if (!raw || typeof raw !== "object") {
    return rows;
  }

  const list = Array.isArray(raw?.trc20) ? raw.trc20 : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    for (const [contractAddress, balanceRaw] of Object.entries(item)) {
      const address = String(contractAddress ?? "").trim();
      if (!address) continue;
      const balance = toBigIntSafe(balanceRaw);
      if (balance <= 0n) continue;
      rows.push({
        contractAddress: address,
        rawBalance: balance,
      });
    }
  }

  return rows;
}

async function queryTrxAccountTrc20HoldingsV1(input = {}) {
  const address = normalizeAddress(input?.address);
  const network = normalizeNetwork(input?.network);
  if (!address) {
    return [];
  }

  const provider = resolveTrxNetProvider(network);
  const baseUrl = String(provider?.rpcUrl ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return [];
  }

  const url = `${baseUrl}/v1/accounts/${encodeURIComponent(address)}`;
  const headerVariants = [];
  if (provider?.apiKey) {
    headerVariants.push({ accept: "application/json", "TRON-PRO-API-KEY": provider.apiKey });
  }
  headerVariants.push({ accept: "application/json" });

  for (const headers of headerVariants) {
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const response = await fetch(url, { method: "GET", headers });
      if (response.ok) {
        const json = await response.json();
        const account = Array.isArray(json?.data) ? json.data[0] : null;
        return normalizeTrc20Holdings(account ?? {});
      }

      if (response.status !== 429 || attempt >= maxRetries) {
        break;
      }

      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 400 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  return [];
}

async function queryTrxAccountTrc20HoldingsWallet(input = {}) {
  const address = normalizeAddress(input?.address);
  const network = normalizeNetwork(input?.network);
  if (!address) {
    return [];
  }

  const provider = resolveTrxNetProvider(network);
  const hexAddress = toTrxHexAddress(address);
  try {
    const raw = await provider.walletCall("getaccount", { address: hexAddress });
    const fromWallet = normalizeTrc20Holdings(raw);
    if (fromWallet.length > 0) {
      return fromWallet;
    }
  } catch {
    // wallet/getaccount 失败时，继续尝试 v1/accounts 回退。
  }

  return [];
}

async function queryTrxAccountTrc20Holdings(input = {}, options = {}) {
  const address = normalizeAddress(input?.address);
  const network = normalizeNetwork(input?.network);
  if (!address) {
    return [];
  }

  const v1HoldingsGetter = options.v1HoldingsGetter ?? queryTrxAccountTrc20HoldingsV1;
  const tronscanHoldingsGetter = options.tronscanHoldingsGetter
    ?? createTronscanAccountTokensSource(options).fetch;
  const walletHoldingsGetter = options.walletHoldingsGetter ?? queryTrxAccountTrc20HoldingsWallet;

  try {
    const fromTronscan = await tronscanHoldingsGetter(address, { address, network });
    if (Array.isArray(fromTronscan) && fromTronscan.length > 0) {
      return fromTronscan;
    }
  } catch {
    // ignore
  }

  try {
    const fromV1 = await v1HoldingsGetter({ address, network });
    if (Array.isArray(fromV1) && fromV1.length > 0) {
      return fromV1;
    }
  } catch {
    // ignore
  }

  try {
    const fromWallet = await walletHoldingsGetter({ address, network });
    if (Array.isArray(fromWallet) && fromWallet.length > 0) {
      return fromWallet;
    }
  } catch {
    // ignore
  }

  return [];
}

function createTrc20Item(address, network, token, rawBalance) {
  const symbol = String(token?.symbol ?? "").trim().toUpperCase();
  const name = String(token?.name ?? "").trim();
  const contractAddress = String(token?.address ?? "").trim();
  const decimals = Number(token?.decimals ?? 0);

  return {
    domain: "address",
    chain: "trx",
    network,
    id: `address:trx:${network}:${address}:${contractAddress}`,
    title: `${name || symbol} (${symbol})`,
    symbol,
    address,
    source: "trongrid",
    confidence: 0.9,
    extra: {
      protocol: "trc20",
      contractAddress,
      balance: formatUnits(rawBalance, decimals),
      decimals,
      sourceMeta: String(token?.sourceMeta ?? "").trim() || "metadata/fallback",
    },
  };
}

function normalizeHoldingToken(holding, metadata, bookToken, contractAddress) {
  const holdingToken = holding?.token ?? {};
  const symbol = String(
    holdingToken?.symbol
      ?? metadata?.symbol
      ?? bookToken?.symbol
      ?? contractAddress,
  ).trim();
  const name = String(
    holdingToken?.name
      ?? metadata?.name
      ?? metadata?.symbol
      ?? bookToken?.name
      ?? symbol
      ?? contractAddress,
  ).trim();
  const decimalsCandidate = holdingToken?.decimals ?? metadata?.decimals ?? bookToken?.decimals;
  const decimals = Number.isFinite(Number(decimalsCandidate)) ? Number(decimalsCandidate) : 0;

  return {
    symbol,
    name,
    decimals,
    address: contractAddress,
    sourceMeta: hasDirectTokenMeta(holding) ? "accountv2/direct" : "metadata/fallback",
  };
}

function hasDirectTokenMeta(holding) {
  const token = holding?.token;
  if (!token || typeof token !== "object") {
    return false;
  }
  const hasNameLike = String(token.name ?? token.symbol ?? "").trim() !== "";
  const hasDecimals = Number.isFinite(Number(token.decimals));
  return hasNameLike && hasDecimals;
}

export function createTrc20BalanceResolver(options = {}) {
  const tokenBookReader = options.tokenBookReader ?? getTrxTokenBook;
  const tokenBalanceGetter = options.tokenBalanceGetter ?? queryTrxTokenBalance;
  const tokenMetadataBatchReader = options.tokenMetadataBatchReader ?? queryTrxTokenMetadataBatch;
  const tokenHoldingsGetter = options.tokenHoldingsGetter
    ?? ((input) => queryTrxAccountTrc20Holdings(input, options));

  async function resolve(input = {}) {
    const address = normalizeAddress(input?.address);
    const network = normalizeNetwork(input?.network);
    const { tokens } = tokenBookReader({ network });
    const tokenBookMap = new Map(
      Object.values(tokens ?? {})
        .filter((token) => token?.address)
        .map((token) => [String(token.address).toLowerCase(), token]),
    );

    // 优先走远程账户持仓，避免仅受 tokenBook 范围约束。
    try {
      const holdings = await tokenHoldingsGetter({ address, network });
      if (Array.isArray(holdings) && holdings.length > 0) {
        const missingMetaAddresses = holdings
          .filter((item) => !hasDirectTokenMeta(item))
          .map((item) => String(item?.contractAddress ?? "").trim())
          .filter(Boolean);

        const metadataMap = new Map();
        if (missingMetaAddresses.length > 0) {
          const metadataResult = await tokenMetadataBatchReader(
            missingMetaAddresses,
            {
              network,
              callerAddress: address,
            },
          );

          const metadataItems = Array.isArray(metadataResult?.items) ? metadataResult.items : [];
          for (const item of metadataItems) {
            if (!item?.ok || !item?.tokenAddress) continue;
            metadataMap.set(String(item.tokenAddress).toLowerCase(), item);
          }
        }

        const rows = holdings.map((item) => {
          const contractAddress = String(item.contractAddress).trim();
          const meta = metadataMap.get(contractAddress.toLowerCase());
          const bookToken = tokenBookMap.get(contractAddress.toLowerCase());
          const token = normalizeHoldingToken(item, meta, bookToken, contractAddress);
          return createTrc20Item(address, network, token, toBigIntSafe(item.rawBalance));
        });

        return rows;
      }
    } catch {
      // 远程持仓失败时降级到 tokenBook 扫描路径。
    }

    const list = Object.values(tokens ?? {});
    if (list.length === 0) {
      return [];
    }

    const rows = await Promise.all(list.map(async (token) => {
      try {
        const result = await tokenBalanceGetter({
          address,
          token: token.address,
          network,
        });
        const rawBalance = toBigIntSafe(result?.balance);
        if (rawBalance <= 0n) {
          return null;
        }
        return createTrc20Item(address, network, {
          ...token,
          sourceMeta: "tokenBook/scan",
        }, rawBalance);
      } catch {
        return null;
      }
    }));

    return rows.filter(Boolean);
  }

  return {
    resolve,
  };
}

export default {
  createTrc20BalanceResolver,
};
