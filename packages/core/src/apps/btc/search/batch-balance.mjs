import { brc20BalanceBatchGet } from "../assets/brc20-balance-batch.mjs";

function normalizeBalanceValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export async function runBtcBatchBalance(rows, options = {}) {
  const reader = typeof options?.batchReader === "function"
    ? options.batchReader
    : brc20BalanceBatchGet;
  const payload = rows.map((row) => ({
    address: row.address,
    token: row.token,
  }));
  const res = await reader(payload, rows[0]?.network || options?.defaultNetwork || "mainnet");
  const items = Array.isArray(res?.items) ? res.items : [];

  return rows.map((row, i) => {
    const item = items[i] ?? null;
    return {
      ok: item?.ok !== false,
      chain: "btc",
      network: row.network,
      address: row.address,
      token: row.token,
      ownerAddress: item?.address ?? row.address,
      tokenAddress: item?.tokenAddress ?? row.token,
      rawBalance: normalizeBalanceValue(item?.balance),
      error: item?.ok === false ? (item?.error ?? "unknown") : null,
    };
  });
}

export default {
  runBtcBatchBalance,
};