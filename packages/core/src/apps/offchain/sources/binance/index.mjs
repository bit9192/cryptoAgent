import { DataSourceBase } from "../base.mjs";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBaseSymbol(token) {
  const raw = normalizeLower(token);
  if (!raw) return null;

  const aliases = {
    bitcoin: "BTC",
    btc: "BTC",
    ethereum: "ETH",
    eth: "ETH",
    binancecoin: "BNB",
    bnb: "BNB",
    wbnb: "BNB",
    tron: "TRX",
    trx: "TRX",
    tether: "USDT",
    usdt: "USDT",
    usdcoin: "USDC",
    usdc: "USDC",
    dai: "DAI",
    fdusd: "FDUSD",
  };

  if (aliases[raw]) return aliases[raw];

  // Skip obvious address-like tokens; Binance uses symbols, not chain addresses.
  if (/^0x[a-f0-9]{40}$/i.test(raw) || /^T[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(raw)) {
    return null;
  }

  if (/^[a-z0-9]{2,12}$/i.test(raw)) {
    return raw.toUpperCase();
  }

  return null;
}

export class BinanceTickerSource extends DataSourceBase {
  metadata = {
    name: "binance",
    version: "1.0.0",
    description: "Binance public ticker prices (batch)",
    capabilities: ["getPrice"],
    rateLimit: { requests: 20, period: 60000 },
    cacheTTL: 30000,
  };

  constructor(options = {}) {
    super(options);
    this.baseUrl = options.baseUrl ?? "https://api.binance.com";
    this.timeout = options.timeout ?? 5000;
  }

  async init(config = {}) {
    this.baseUrl = config.baseUrl ?? this.baseUrl;
    this.timeout = config.timeout ?? this.timeout;
    this.state = DataSourceBase.State.HEALTHY;
  }

  async requestJson(url) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Binance API 错误: ${response.status}`);
    }

    return response.json();
  }

  async healthCheck() {
    const start = Date.now();
    await this.requestJson(`${this.baseUrl}/api/v3/ping`);
    this.recordSuccess(Date.now() - start);
    return { ok: true };
  }

  async getPrice(tokens) {
    const start = Date.now();
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];

    const allTickerRows = await this.requestJson(`${this.baseUrl}/api/v3/ticker/price`);
    const symbolToPrice = new Map();
    for (const row of Array.isArray(allTickerRows) ? allTickerRows : []) {
      const symbol = normalizeString(row?.symbol).toUpperCase();
      const price = toNumberOrNull(row?.price);
      if (!symbol || !Number.isFinite(price)) continue;
      symbolToPrice.set(symbol, price);
    }

    const out = {};
    for (const token of tokenList) {
      const base = toBaseSymbol(token);
      const key = String(token);
      if (!base) {
        out[key] = null;
        continue;
      }

      if (base === "USDT") {
        out[key] = {
          usd: 1,
          symbol: "USDTUSDT",
          source: "binance",
        };
        continue;
      }

      const pair = `${base}USDT`;
      const usd = symbolToPrice.get(pair);
      out[key] = Number.isFinite(usd)
        ? {
          usd,
          symbol: pair,
          source: "binance",
        }
        : null;
    }

    this.recordSuccess(Date.now() - start);
    return out;
  }
}

export default BinanceTickerSource;
