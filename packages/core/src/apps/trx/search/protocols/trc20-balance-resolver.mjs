import { getTrxTokenBook } from "../../config/tokens.js";
import { queryTrxTokenBalance } from "../../trc20.mjs";
import { queryTrxTokenMetadataBatch } from "../../assets/token-metadata.mjs";
import { resolveTrxNetProvider } from "../../netprovider.mjs";
import { toTrxHexAddress } from "../../address-codec.mjs";

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

async function queryTrxAccountTrc20Holdings(input = {}) {
  const address = normalizeAddress(input?.address);
  const network = normalizeNetwork(input?.network);
  if (!address) {
    return [];
  }

  const provider = resolveTrxNetProvider(network);
  const hexAddress = toTrxHexAddress(address);
  const raw = await provider.walletCall("getaccount", { address: hexAddress });
  return normalizeTrc20Holdings(raw);
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
  const tokenMetadataBatchReader = options.tokenMetadataBatchReader ?? queryTrxTokenMetadataBatch;
  const tokenHoldingsGetter = options.tokenHoldingsGetter ?? queryTrxAccountTrc20Holdings;

  async function resolve(input = {}) {
    const address = normalizeAddress(input?.address);
    const network = normalizeNetwork(input?.network);

    // 优先走远程账户持仓，避免仅受 tokenBook 范围约束。
    try {
      const holdings = await tokenHoldingsGetter({ address, network });
      if (Array.isArray(holdings) && holdings.length > 0) {
        const metadataResult = await tokenMetadataBatchReader(
          holdings.map((item) => item.contractAddress),
          {
            network,
            callerAddress: address,
          },
        );

        const metadataItems = Array.isArray(metadataResult?.items) ? metadataResult.items : [];
        const metadataMap = new Map(
          metadataItems
            .filter((item) => item?.ok && item?.tokenAddress)
            .map((item) => [String(item.tokenAddress).toLowerCase(), item]),
        );

        const rows = holdings.map((item) => {
          const contractAddress = String(item.contractAddress).trim();
          const meta = metadataMap.get(contractAddress.toLowerCase());
          const token = {
            symbol: String(meta?.symbol ?? contractAddress).trim(),
            name: String(meta?.name ?? meta?.symbol ?? contractAddress).trim(),
            decimals: Number(meta?.decimals ?? 0),
            address: contractAddress,
          };
          return createTrc20Item(address, network, token, toBigIntSafe(item.rawBalance));
        });

        return rows;
      }
    } catch {
      // 远程持仓失败时降级到 tokenBook 扫描路径。
    }

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
