/**
 * Coinpaprika BRC20 trade source（免费兜底）
 *
 * 覆盖范围：主流 BRC20（ORDI/SATS 等已上 Coinpaprika 的 token）
 * 无需 key，永远可用。尾部 token 无收录时返回 null（不抛错）。
 *
 * 流程：
 *   1. GET /v1/search?q={ticker} → 找到 Coinpaprika coin ID
 *   2. GET /v1/tickers/{id}?quotes=USD → 取价格
 */

const COINPAPRIKA_BASE = "https://api.coinpaprika.com";

/**
 * 从搜索结果中找最匹配的 BRC20 coin ID
 * 优先 symbol 完全匹配的 ordinals/brc20 类型 token
 */
function findBestMatch(currencies = [], ticker) {
  const upper = ticker.toUpperCase();
  // 精确匹配 symbol
  const exact = currencies.filter(
    (c) => String(c?.symbol ?? "").toUpperCase() === upper,
  );
  if (exact.length === 0) return null;
  // 优先选活跃 token
  const active = exact.filter((c) => c.is_active !== false);
  const pool = active.length > 0 ? active : exact;
  // 按 rank 升序（rank=0 表示未排名，放最后）
  pool.sort((a, b) => {
    const ra = Number(a.rank ?? 0) || Infinity;
    const rb = Number(b.rank ?? 0) || Infinity;
    return ra - rb;
  });
  return pool[0]?.id ?? null;
}

function mapTickerDataToTradeItem(data, ticker, network) {
  const symbol = String(data?.symbol ?? ticker).toUpperCase();
  const quotes = data?.quotes?.USD ?? {};
  return {
    domain: "trade",
    chain: "btc",
    network,
    id: `trade:btc:${network}:${symbol.toLowerCase()}`,
    title: `${symbol} (BRC20 Market)`,
    symbol,
    source: "coinpaprika",
    confidence: 0.75,
    extra: {
      protocol: "brc20",
      floorPrice: null, // Coinpaprika 没有 sat floor price
      volume24h: null,
      holders: null,
      listed: null,
      priceUsd: Number(quotes.price ?? 0) || null,
      volume24hUsd: Number(quotes.volume_24h ?? 0) || null,
      marketCapUsd: Number(quotes.market_cap ?? 0) || null,
      percentChange24h: Number(quotes.percent_change_24h ?? 0) || null,
    },
  };
}

/**
 * @returns {{ fetch(ticker, network): Promise<TradeItem|null> }}
 */
export function createCoinpaprikaTradeSource() {
  return {
    name: "coinpaprika",

    /**
     * @param {string} ticker  BRC20 ticker，如 "ordi"
     * @param {string} network BTC network name
     * @returns {Promise<TradeItem|null>}
     */
    async fetch(ticker, network) {
      const normalizedTicker = String(ticker ?? "").trim().toLowerCase();
      if (!normalizedTicker) return null;

      try {
        // Step 1: 搜索，找到 coin ID
        const searchUrl = new URL(`${COINPAPRIKA_BASE}/v1/search`);
        searchUrl.searchParams.set("q", normalizedTicker);
        searchUrl.searchParams.set("limit", "10");
        searchUrl.searchParams.set("c", "currencies");

        const searchRes = await fetch(searchUrl.toString(), {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(6000),
        });
        if (!searchRes.ok) return null;

        const searchData = await searchRes.json();
        const coinId = findBestMatch(searchData?.currencies ?? [], normalizedTicker);
        if (!coinId) return null;

        // Step 2: 取价格
        const tickerUrl = new URL(`${COINPAPRIKA_BASE}/v1/tickers/${encodeURIComponent(coinId)}`);
        tickerUrl.searchParams.set("quotes", "USD");

        const tickerRes = await fetch(tickerUrl.toString(), {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(6000),
        });
        if (!tickerRes.ok) return null;

        const tickerData = await tickerRes.json();
        if (!tickerData?.symbol) return null;

        return mapTickerDataToTradeItem(tickerData, ticker, network);
      } catch {
        return null; // 网络错误优雅降级
      }
    },
  };
}

export default { createCoinpaprikaTradeSource };
