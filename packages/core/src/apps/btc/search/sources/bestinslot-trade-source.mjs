/**
 * BestInSlot BRC20 trade source
 *
 * 覆盖范围：全量 BRC20（含尾部 token）
 * 依赖：BESTINSLOT_API_KEY 环境变量（无 key → 跳过，返回 null）
 *
 * API: GET https://api.bestinslot.xyz/v3/brc20/ticker_info?ticker={ticker}
 */

const BESTINSLOT_BASE = "https://api.bestinslot.xyz";

function resolveApiKey(override) {
  return String(override ?? process.env.BESTINSLOT_API_KEY ?? "").trim();
}

function mapTickerInfoToTradeItem(data, ticker, network) {
  const symbol = String(data?.ticker ?? ticker).toUpperCase();
  return {
    domain: "trade",
    chain: "btc",
    network,
    id: `trade:btc:${network}:${symbol.toLowerCase()}`,
    title: `${symbol} (BRC20 Market)`,
    symbol,
    source: "bestinslot",
    confidence: 0.88,
    extra: {
      protocol: "brc20",
      floorPrice: Number(data?.floor_price ?? data?.floorPrice ?? 0) || null,
      volume24h: Number(data?.volume_24h ?? data?.volume24h ?? 0) || null,
      holders: Number(data?.holders_count ?? data?.holdersCount ?? 0) || null,
      listed: Number(data?.listed_count ?? data?.listedCount ?? 0) || null,
      // USD 价格 BestInSlot 以 sat 为单位，留给上层换算
      priceUsd: null,
    },
  };
}

/**
 * @returns {{ fetch(ticker, network, options?): Promise<TradeItem|null> }}
 */
export function createBestInSlotTradeSource() {
  return {
    name: "bestinslot",

    /**
     * @param {string} ticker  BRC20 ticker，如 "ordi"
     * @param {string} network BTC network name
     * @param {object} [options]
     * @param {string} [options.apiKey]  覆盖环境变量
     * @returns {Promise<TradeItem|null>}  null 表示无结果或无权限（不抛错）
     */
    async fetch(ticker, network, options = {}) {
      const apiKey = resolveApiKey(options.apiKey);
      if (!apiKey) return null; // 无 key → 跳过，触发降级

      const normalizedTicker = String(ticker ?? "").trim().toLowerCase();
      if (!normalizedTicker) return null;

      try {
        const url = new URL(`${BESTINSLOT_BASE}/v3/brc20/ticker_info`);
        url.searchParams.set("ticker", normalizedTicker);

        const res = await fetch(url.toString(), {
          headers: {
            accept: "application/json",
            "x-api-key": apiKey,
          },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) return null;

        const json = await res.json();
        const data = json?.data ?? json;
        if (!data || !data.ticker) return null;

        return mapTickerInfoToTradeItem(data, ticker, network);
      } catch {
        return null; // 网络错误优雅降级
      }
    },
  };
}

export default { createBestInSlotTradeSource };
