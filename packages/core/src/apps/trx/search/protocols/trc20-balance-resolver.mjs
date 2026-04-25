import { getTrxTokenBook } from "../../config/tokens.js";
import { queryTrxTokenBalance } from "../../trc20.mjs";

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
    },
  };
}

export function createTrc20BalanceResolver(options = {}) {
  const tokenBookReader = options.tokenBookReader ?? getTrxTokenBook;
  const tokenBalanceGetter = options.tokenBalanceGetter ?? queryTrxTokenBalance;

  async function resolve(input = {}) {
    const address = String(input?.address ?? "").trim();
    const network = String(input?.network ?? "mainnet").trim().toLowerCase() || "mainnet";

    const { tokens } = tokenBookReader({ network });
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
        return createTrc20Item(address, network, token, rawBalance);
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
