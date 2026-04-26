function normalizeNetwork(value) {
  return String(value ?? "mainnet").trim().toLowerCase() || "mainnet";
}

function normalizeApiBase(value) {
  const raw = String(value ?? "https://apilist.tronscanapi.com").trim();
  return raw.replace(/\/+$/, "");
}

function normalizeAddress(value) {
  return String(value ?? "").trim();
}

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

function looksLikeTrxAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value ?? "").trim());
}

function normalizeHoldingRow(row = {}) {
  const tokenType = String(row?.tokenType ?? row?.type ?? "").trim().toLowerCase();
  const contractAddress = String(
    row?.tokenId
      ?? row?.contractAddress
      ?? row?.tokenAddress
      ?? row?.token
      ?? row?.token_id
      ?? "",
  ).trim();
  const rawBalance = toBigIntSafe(row?.balance ?? row?.amount ?? row?.quant ?? row?.balanceStr ?? row?.balance_str);
  if (tokenType && tokenType !== "trc20") {
    return null;
  }
  if (!looksLikeTrxAddress(contractAddress) || rawBalance <= 0n) {
    return null;
  }

  const symbol = String(row?.tokenAbbr ?? row?.symbol ?? "").trim();
  const name = String(row?.tokenName ?? row?.name ?? symbol ?? "").trim();
  const decimalsRaw = row?.tokenDecimal ?? row?.decimals;
  const decimals = Number.isFinite(Number(decimalsRaw)) ? Number(decimalsRaw) : null;

  return {
    contractAddress,
    rawBalance,
    token: {
      symbol,
      name,
      decimals,
    },
  };
}

export function createTronscanAccountTokensSource(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  async function fetch(address, input = {}) {
    const network = normalizeNetwork(input?.network ?? options.network);
    if (network !== "mainnet") {
      return [];
    }

    const targetAddress = normalizeAddress(address ?? input?.address);
    if (!targetAddress) {
      return [];
    }

    const apiBase = normalizeApiBase(input?.apiBase ?? options.apiBase ?? process.env.TRXSCAN_API_BASE);
    const apiKey = String(
      input?.apiKey
        ?? options.apiKey
        ?? process.env.TRXERSCAN_API_KEY
        ?? process.env.TRX_MAINNET_API_KEY
        ?? process.env.TRX_API_KEY
        ?? "",
    ).trim();
    if (!apiKey) {
      return [];
    }

    const url = new URL(`${apiBase}/api/accountv2`);
    url.searchParams.set("address", targetAddress);

    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "TRON-PRO-API-KEY": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Tronscan request failed: HTTP ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const list = Array.isArray(json?.withPriceTokens)
      ? json.withPriceTokens
      : Array.isArray(json?.tokenBalances)
        ? json.tokenBalances
        : Array.isArray(json?.trc20token_balances)
          ? json.trc20token_balances
          : [];
    return list.map((item) => normalizeHoldingRow(item)).filter(Boolean);
  }

  return {
    fetch,
  };
}

export default {
  createTronscanAccountTokensSource,
};