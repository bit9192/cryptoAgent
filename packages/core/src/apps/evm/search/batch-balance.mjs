import { queryEvmTokenBalanceBatch } from "../assets/balance-batch.mjs";

function normalizeBalanceValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export async function runEvmBatchBalance(rows, options = {}) {
  const reader = typeof options?.batchReader === "function"
    ? options.batchReader
    : queryEvmTokenBalanceBatch;
  const payload = rows.map((row) => ({
    address: row.address,
    token: row.token,
  }));
  const res = await reader(payload, { network: rows[0]?.network || options?.defaultNetwork || "eth" });
  const items = Array.isArray(res?.items) ? res.items : [];

  return rows.map((row, i) => {
    const item = items[i] ?? null;
    return {
      ok: true,
      chain: "evm",
      network: row.network,
      address: row.address,
      token: row.token,
      ownerAddress: item?.ownerAddress ?? row.address,
      tokenAddress: item?.tokenAddress ?? row.token,
      rawBalance: normalizeBalanceValue(item?.balance),
      error: null,
    };
  });
}

export default {
  runEvmBatchBalance,
};