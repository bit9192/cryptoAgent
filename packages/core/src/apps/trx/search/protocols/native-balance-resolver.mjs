import { trxBalanceGet } from "../../balances.mjs";

function formatTrxAmount(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(6).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function createNativeItem(address, network, payload) {
  return {
    domain: "address",
    chain: "trx",
    network,
    id: `address:trx:${network}:${address}:native`,
    title: "TRX (native)",
    symbol: "TRX",
    address,
    source: "trongrid",
    confidence: 0.95,
    extra: {
      protocol: "native",
      balance: formatTrxAmount(payload?.total ?? 0),
      exists: Boolean(payload?.exists),
    },
  };
}

export function createNativeBalanceResolver(options = {}) {
  const balanceGetter = options.balanceGetter ?? trxBalanceGet;

  async function resolve(input = {}) {
    const address = String(input?.address ?? "").trim();
    const network = String(input?.network ?? "mainnet").trim().toLowerCase() || "mainnet";

    const payload = await balanceGetter(address, network);
    const total = Number(payload?.total ?? 0);
    const exists = Boolean(payload?.exists);

    if (!(total > 0) && !exists) {
      return [];
    }

    return [createNativeItem(address, network, payload)];
  }

  return {
    resolve,
  };
}

export default {
  createNativeBalanceResolver,
};
