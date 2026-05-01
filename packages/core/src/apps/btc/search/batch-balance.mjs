import { brc20BalanceBatchGet } from "../assets/brc20-balance-batch.mjs";
import { convertBtcAddressNetwork } from "../address.mjs";
import { normalizeBtcNetworkName } from "../config/networks.js";

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
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const groupedRows = new Map();
  rows.forEach((row, index) => {
    const rawNetwork = String(row?.network ?? "").trim();
    if (!rawNetwork) {
      throw new TypeError(`rows[${index}].network 不能为空`);
    }

    const network = normalizeBtcNetworkName(rawNetwork);
    const rawAddress = String(row?.address ?? "").trim();
    if (!rawAddress) {
      throw new TypeError(`rows[${index}].address 不能为空`);
    }

    const normalizedAddress = convertBtcAddressNetwork(rawAddress, network).output;
    if (!groupedRows.has(network)) {
      groupedRows.set(network, []);
    }
    groupedRows.get(network).push({
      row,
      index,
      normalizedAddress,
    });
  });

  const groupedResults = await Promise.all(
    [...groupedRows.entries()].map(async ([network, entries]) => {
      const payload = entries.map(({ normalizedAddress, row }) => ({
        address: normalizedAddress,
        token: row.token,
      }));
      const res = await reader(payload, network);
      const items = Array.isArray(res?.items) ? res.items : [];

      return entries.map(({ row, index, normalizedAddress }, i) => {
        const item = items[i] ?? null;
        return {
          index,
          value: {
            ok: item?.ok !== false,
            chain: "btc",
            network: row.network,
            address: row.address,
            token: row.token,
            ownerAddress: item?.address ?? normalizedAddress,
            tokenAddress: item?.tokenAddress ?? row.token,
            rawBalance: normalizeBalanceValue(item?.balance),
            error: item?.ok === false ? (item?.error ?? "unknown") : null,
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
  runBtcBatchBalance,
};