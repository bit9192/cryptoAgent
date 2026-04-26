const OKLINK_BASE = "https://www.oklink.com";

function resolveApiBase(override) {
  return String(override ?? process.env.OKLINK_API_BASE ?? OKLINK_BASE).trim().replace(/\/+$/, "");
}

function resolveApiKey(override) {
  return String(override ?? process.env.OKLINK_API_KEY ?? "").trim();
}

function pickTicker(row = {}) {
  const ticker = String(
    row?.ticker
    ?? row?.symbol
    ?? row?.token
    ?? row?.tokenSymbol
    ?? row?.tick
    ?? "",
  ).trim().toUpperCase();
  return ticker;
}

function pickBalance(row = {}) {
  return String(
    row?.overallBalance
    ?? row?.balance
    ?? row?.totalBalance
    ?? row?.holdingAmount
    ?? row?.amount
    ?? "0",
  ).trim();
}

function pickAvailable(row = {}, fallbackBalance = "0") {
  return String(
    row?.availableBalance
    ?? row?.available
    ?? row?.transferable
    ?? fallbackBalance,
  ).trim();
}

function toRows(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.hits)) return payload.data.hits;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.hits)) return payload.hits;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeRow(row = {}) {
  const overallBalance = pickBalance(row);
  const availableBalance = pickAvailable(row, overallBalance);
  return {
    ticker: pickTicker(row),
    overallBalance,
    availableBalance,
    transferableBalance: availableBalance,
    decimals: 18,
    source: "oklink",
  };
}

/**
 * OKLink BTC inscription token holder list fallback source.
 */
export function createOklinkBrc20WalletSource() {
  return {
    name: "oklink-brc20-wallet",

    async fetch(address, options = {}) {
      const walletAddress = String(address ?? "").trim();
      if (!walletAddress) {
        return { ok: false, rows: [], error: "address is required" };
      }

      const apiKey = resolveApiKey(options.apiKey);
      if (!apiKey) {
        return { ok: false, rows: [], error: "OKLINK_API_KEY is missing" };
      }

      try {
        const apiBase = resolveApiBase(options.apiBase);
        const url = new URL(`${apiBase}/api/explorer/v2/btc/inscription/token-holder/list`);
        url.searchParams.set("address", walletAddress);
        url.searchParams.set("t", String(Date.now()));

        const res = await fetch(url.toString(), {
          headers: {
            accept: "application/json",
            "x-apikey": apiKey,
            "x-locale": String(process.env.OKLINK_LOCALE ?? "zh_CN"),
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          return { ok: false, rows: [], error: `OKLink API error: HTTP ${res.status}` };
        }

        const json = await res.json();
        const bizCode = Number(json?.code ?? 0);
        if (Number.isFinite(bizCode) && bizCode !== 0) {
          return {
            ok: false,
            rows: [],
            error: `OKLink error: ${json?.msg ?? "unknown"}${json?.detailMsg ? ` (${json.detailMsg})` : ""}`,
          };
        }
        const list = toRows(json);
        const rows = list
          .map(normalizeRow)
          .filter((row) => row.ticker);
        return { ok: true, rows };
      } catch (error) {
        return { ok: false, rows: [], error: `OKLink request failed: ${error?.message ?? error}` };
      }
    },
  };
}

export default {
  createOklinkBrc20WalletSource,
};
