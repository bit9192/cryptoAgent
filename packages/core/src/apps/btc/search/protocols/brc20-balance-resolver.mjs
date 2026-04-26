import { brc20SummaryGet, brc20TokenInfoGet } from "../../brc20.mjs";
import { BRC20_PRIORITY_TICKERS } from "../../config/brc20-priority-tickers.mjs";
import { getBtcTokenBook } from "../../config/tokens.js";
import { createBestInSlotBrc20WalletSource } from "../sources/bestinslot-brc20-wallet-source.mjs";

const BRC20_STALE_CACHE_TTL_MS = Number.isFinite(Number(process.env.BTC_BRC20_STALE_TTL_MS))
  ? Number(process.env.BTC_BRC20_STALE_TTL_MS)
  : 120000;
const brc20StaleCache = new Map();
const bestInSlotWalletSource = createBestInSlotBrc20WalletSource();

function buildCacheKey(address, network) {
  return `${String(network ?? "mainnet").toLowerCase()}:${String(address ?? "").toLowerCase()}`;
}

function readStaleCache(address, network) {
  const key = buildCacheKey(address, network);
  const row = brc20StaleCache.get(key);
  if (!row) return [];
  if (Date.now() - Number(row.cachedAt ?? 0) > BRC20_STALE_CACHE_TTL_MS) {
    brc20StaleCache.delete(key);
    return [];
  }

  return (Array.isArray(row.items) ? row.items : []).map((item) => ({
    ...item,
    id: `${item.id}:stale`,
    source: "stale-cache",
    confidence: Math.min(Number(item.confidence ?? 0.85), 0.6),
    extra: {
      ...(item?.extra && typeof item.extra === "object" ? item.extra : {}),
      stale: true,
      staleCachedAt: Number(row.cachedAt ?? Date.now()),
    },
  }));
}

function writeStaleCache(address, network, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const key = buildCacheKey(address, network);
  brc20StaleCache.set(key, {
    cachedAt: Date.now(),
    items,
  });
}

function getConfiguredBrc20Tickers(network) {
  const { tokens } = getBtcTokenBook({ network });
  const configured = Object.values(tokens ?? {})
    .filter((token) => String(token?.protocol ?? "").toLowerCase() === "brc20")
    .map((token) => String(token?.key ?? token?.symbol ?? token?.address ?? "").toLowerCase())
    .filter(Boolean);

  const ordered = [];
  const seen = new Set();
  for (const ticker of BRC20_PRIORITY_TICKERS) {
    const normalized = String(ticker ?? "").toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    if (configured.includes(normalized)) {
      ordered.push(normalized);
      seen.add(normalized);
    }
  }
  for (const ticker of configured) {
    if (seen.has(ticker)) continue;
    ordered.push(ticker);
    seen.add(ticker);
  }
  return ordered;
}

function mapBrc20ErrorItem(address, network, message, stage = "unknown") {
  const errorMessage = String(message ?? "unknown error").trim() || "unknown error";
  return {
    domain: "address",
    chain: "btc",
    network,
    id: `address:btc:${network}:${address}:brc20:error:${stage}`,
    title: `BRC20 API ERROR (${stage}) @ ${address.slice(0, 10)}...${address.slice(-6)}`,
    address,
    source: "unisat",
    confidence: 0.2,
    extra: {
      assetType: "error",
      ticker: "BRC20_ERROR",
      errorStage: stage,
      errorMessage,
      balance: "0",
    },
  };
}

/**
 * 映射 brc20SummaryGet row → SearchItem（domain=address，assetType=brc20）
 */
function mapBrc20BalanceItem(row, address, network) {
  const ticker = String(row.ticker ?? row.tick ?? "").toUpperCase();
  return {
    domain: "address",
    chain: "btc",
    network,
    id: `address:btc:${network}:${address}:brc20:${ticker.toLowerCase()}`,
    title: `${ticker} @ ${address.slice(0, 10)}...${address.slice(-6)}`,
    address,
    source: String(row?.source ?? "unisat"),
    confidence: 0.85,
    extra: {
      assetType: "brc20",
      ticker,
      balance: String(row.overallBalance ?? row.balance ?? "0"),
      availableBalance: String(row.availableBalance ?? "0"),
      transferableBalance: String(row.transferableBalance ?? "0"),
      decimals: Number(row.decimals ?? 18),
    },
  };
}

/**
 * BRC20 资产余额 resolver（仅 P2TR / Taproot 地址可用）
 *
 * @returns {{ resolve(input: { address: string, network: string }): Promise<SearchItem[]> }}
 */
export function createBrc20BalanceResolver() {
  return {
    name: "brc20-balance",

    async resolve(input = {}) {
      const { address, network } = input;
      try {
        const errorItems = [];
        const configuredTickers = getConfiguredBrc20Tickers(network);
        const configuredResults = await Promise.allSettled(
          configuredTickers.map((ticker) => brc20TokenInfoGet({ address, ticker }, network)),
        );

        const allRows = [];
        for (let i = 0; i < configuredResults.length; i += 1) {
          const res = configuredResults[i];
          const ticker = configuredTickers[i];
          if (res.status !== "fulfilled") {
            errorItems.push(
              mapBrc20ErrorItem(address, network, res.reason?.message ?? res.reason, `config:${ticker}`),
            );
            continue;
          }

          const info = res.value;
          const balance = String(info.overallBalance ?? "0");
          if (balance !== "0") {
            allRows.push({
              ticker: info.ticker,
              overallBalance: balance,
              availableBalance: String(info.availableBalance ?? "0"),
              transferableBalance: String(info.transferableBalance ?? "0"),
              decimals: 18,
            });
          }
        }

        let summaryMeta = null;
        try {
          summaryMeta = await brc20SummaryGet({ address, excludeZero: true, limit: 100, tickFilter: 0 }, network);
        } catch (error) {
          errorItems.push(
            mapBrc20ErrorItem(address, network, error?.message ?? error, "summary"),
          );
        }

        const rows = summaryMeta && Array.isArray(summaryMeta.rows) ? summaryMeta.rows : [];

        const seenTickers = new Set(allRows.map((row) => String(row?.ticker ?? row?.tick ?? "").toLowerCase()));
        for (const row of rows) {
          const ticker = String(row?.ticker ?? row?.tick ?? "").toLowerCase();
          if (!ticker || seenTickers.has(ticker)) continue;
          allRows.push(row);
          seenTickers.add(ticker);
        }

        // summary 继续分页，补齐剩余未命中的 ticker
        if (summaryMeta && summaryMeta.total > rows.length) {
          let start = rows.length;
          while (start < summaryMeta.total) {
            let page;
            try {
              page = await brc20SummaryGet(
                { address, excludeZero: true, limit: 100, tickFilter: 0, start },
                network,
              );
            } catch (error) {
              // 分页阶段单次失败不清空已获取数据，直接结束分页
              errorItems.push(
                mapBrc20ErrorItem(address, network, error?.message ?? error, `summary-page@${start}`),
              );
              break;
            }
            const pageRows = Array.isArray(page?.rows) ? page.rows : [];
            if (pageRows.length === 0) break;
            for (const row of pageRows) {
              const ticker = String(row?.ticker ?? row?.tick ?? "").toLowerCase();
              if (!ticker || seenTickers.has(ticker)) continue;
              allRows.push(row);
              seenTickers.add(ticker);
            }
            start += pageRows.length;
          }
        }

        // 临时禁用 OKLink，保留 BestInSlot 作为唯一异源托底。
        if (allRows.length === 0) {
          const bisResult = await bestInSlotWalletSource.fetch(address);
          if (bisResult.ok) {
            const bisRows = (Array.isArray(bisResult.rows) ? bisResult.rows : []).filter((row) => {
              const balance = Number(row?.overallBalance ?? 0);
              return Number.isFinite(balance) && balance > 0;
            });
            allRows.push(...bisRows);
          } else {
            errorItems.push(
              mapBrc20ErrorItem(address, network, bisResult.error ?? "BestInSlot fallback failed", "fallback:bestinslot"),
            );
          }
        }

        const mappedItems = allRows.map((row) => mapBrc20BalanceItem(row, address, network));
        if (mappedItems.length > 0) {
          writeStaleCache(address, network, mappedItems);
          return [...mappedItems, ...errorItems];
        }

        const staleItems = readStaleCache(address, network);
        return [...staleItems, ...errorItems];
      } catch (error) {
        // 降级：不再静默，显式输出错误项便于排查，并尽量附带最近一次成功快照
        const staleItems = readStaleCache(address, network);
        return [
          ...staleItems,
          mapBrc20ErrorItem(address, network, error?.message ?? error, "resolver"),
        ];
      }
    },
  };
}

export default {
  createBrc20BalanceResolver,
};
