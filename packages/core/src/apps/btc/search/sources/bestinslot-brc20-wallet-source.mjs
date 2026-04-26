const BESTINSLOT_BASE = "https://api.bestinslot.xyz";

function resolveApiKey(override) {
  return String(override ?? process.env.BESTINSLOT_API_KEY ?? "").trim();
}

function normalizeWalletBalanceRow(row = {}) {
  return {
    ticker: String(row.ticker ?? "").trim().toUpperCase(),
    overallBalance: String(row.overall_balance ?? row.overallBalance ?? "0"),
    availableBalance: String(row.available_balance ?? row.availableBalance ?? "0"),
    transferableBalance: String(row.transferrable_balance ?? row.transferable_balance ?? row.transferableBalance ?? "0"),
    decimals: 18,
  };
}

/**
 * BestInSlot BRC20 wallet balances source
 * API: GET /v3/brc20/wallet_balances?address={address}
 */
export function createBestInSlotBrc20WalletSource() {
  return {
    name: "bestinslot-brc20-wallet",

    async fetch(address, options = {}) {
      const walletAddress = String(address ?? "").trim();
      if (!walletAddress) {
        return { ok: false, rows: [], error: "address is required" };
      }

      const apiKey = resolveApiKey(options.apiKey);
      if (!apiKey) {
        return { ok: false, rows: [], error: "BESTINSLOT_API_KEY is missing" };
      }

      try {
        const url = new URL(`${BESTINSLOT_BASE}/v3/brc20/wallet_balances`);
        url.searchParams.set("address", walletAddress);

        const res = await fetch(url.toString(), {
          headers: {
            accept: "application/json",
            "x-api-key": apiKey,
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          return { ok: false, rows: [], error: `BestInSlot API error: HTTP ${res.status}` };
        }

        const json = await res.json();
        const rows = Array.isArray(json?.data) ? json.data.map(normalizeWalletBalanceRow) : [];
        return { ok: true, rows };
      } catch (error) {
        return { ok: false, rows: [], error: `BestInSlot request failed: ${error?.message ?? error}` };
      }
    },
  };
}

export default {
  createBestInSlotBrc20WalletSource,
};
