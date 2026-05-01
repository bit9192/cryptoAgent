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
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const groupedRows = new Map();
  rows.forEach((row, index) => {
    const network = String(row?.network ?? "").trim().toLowerCase();
    if (!network) {
      throw new TypeError(`rows[${index}].network 不能为空`);
    }
    if (!groupedRows.has(network)) {
      groupedRows.set(network, []);
    }
    groupedRows.get(network).push({ row, index });
  });

  const groupedResults = await Promise.all(
    [...groupedRows.entries()].map(async ([network, entries]) => {
      const payload = entries.map(({ row }) => ({
        address: row.address,
        token: row.token,
      }));
      const res = await reader(payload, { network });
      const items = Array.isArray(res?.items) ? res.items : [];

      return entries.map(({ row, index }, i) => {
        const item = items[i] ?? null;
        return {
          index,
          value: {
            ok: true,
            chain: "evm",
            network: row.network,
            address: row.address,
            token: row.token,
            ownerAddress: item?.ownerAddress ?? row.address,
            tokenAddress: item?.tokenAddress ?? row.token,
            rawBalance: normalizeBalanceValue(item?.balance),
            error: null,
          },
        };
      });
    }),
  );

  const output = new Array(rows.length);
  groupedResults.forEach((entries) => {
    entries.forEach(({ index, value }) => {
      output[index] = value;
    });
  });

  return output;
}

export default {
  runEvmBatchBalance,
};