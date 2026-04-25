/**
 * CoinGecko 数据源实现
 *
 * 功能：
 * - 获取代币价格
 * - 获取 Token 信息
 * - 获取市场数据
 */

import { DataSourceBase } from "../base.mjs";

function isAddressLike(value) {
  const v = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(v);
}

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

function normalizeNetworkName(network) {
  const raw = normalizeLower(network);
  if (!raw) return null;
  if (raw === "ethereum") return "eth";
  if (raw === "binance-smart-chain") return "bsc";
  if (raw === "trx") return "mainnet";
  return raw;
}

function toCoinGeckoPlatformKey(network) {
  const net = normalizeNetworkName(network);
  if (net === "eth") return "ethereum";
  if (net === "bsc") return "binance-smart-chain";
  if (net === "polygon") return "polygon-pos";
  if (net === "arb" || net === "arbitrum") return "arbitrum-one";
  if (net === "base") return "base";
  if (net === "op" || net === "optimism") return "optimistic-ethereum";
  return null;
}

function mapPlatformToChainNetwork(platformKey) {
  const key = normalizeLower(platformKey);
  if (key === "ethereum") return { chain: "evm", network: "eth" };
  if (key === "binance-smart-chain") return { chain: "evm", network: "bsc" };
  if (key === "polygon-pos") return { chain: "evm", network: "polygon" };
  if (key === "arbitrum-one") return { chain: "evm", network: "arb" };
  if (key === "optimistic-ethereum") return { chain: "evm", network: "op" };
  if (key === "base") return { chain: "evm", network: "base" };
  if (key === "tron") return { chain: "trx", network: "mainnet" };
  return { chain: null, network: null };
}

function extractPlatformAddress(tokenDetails, options = {}) {
  const platforms = tokenDetails?.platforms && typeof tokenDetails.platforms === "object"
    ? tokenDetails.platforms
    : {};
  const preferredPlatformKey = toCoinGeckoPlatformKey(options.network);

  if (preferredPlatformKey) {
    const preferredAddress = normalizeString(platforms[preferredPlatformKey]);
    if (preferredAddress) {
      return {
        platformKey: preferredPlatformKey,
        tokenAddress: preferredAddress,
      };
    }
  }

  for (const [platformKey, address] of Object.entries(platforms)) {
    const tokenAddress = normalizeString(address);
    if (!tokenAddress) continue;
    return { platformKey, tokenAddress };
  }

  return { platformKey: null, tokenAddress: null };
}

function rankSearchCoins(coins = [], query) {
  const keyword = normalizeLower(query);
  return [...coins].sort((a, b) => {
    const exactSymbolA = normalizeLower(a?.symbol) === keyword ? 1 : 0;
    const exactSymbolB = normalizeLower(b?.symbol) === keyword ? 1 : 0;
    if (exactSymbolB !== exactSymbolA) return exactSymbolB - exactSymbolA;

    const exactNameA = normalizeLower(a?.name) === keyword ? 1 : 0;
    const exactNameB = normalizeLower(b?.name) === keyword ? 1 : 0;
    if (exactNameB !== exactNameA) return exactNameB - exactNameA;

    const rankA = Number.isFinite(Number(a?.market_cap_rank)) ? Number(a.market_cap_rank) : Number.MAX_SAFE_INTEGER;
    const rankB = Number.isFinite(Number(b?.market_cap_rank)) ? Number(b.market_cap_rank) : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}

export class CoinGeckoSource extends DataSourceBase {
  metadata = {
    name: "coingecko",
    version: "1.0.0",
    description: "CoinGecko - Token prices, market data, historical data",
    capabilities: ["getPrice", "getTokenInfo", "getTokenCandidates", "getMarketData"],
    rateLimit: { requests: 10, period: 60000 },
    cacheTTL: 60000,
  };

  constructor(options = {}) {
    super(options);
    this.baseUrl = options.baseUrl ?? "https://api.coingecko.com/api/v3";
    this.apiKey = options.apiKey ?? "";
    this.timeout = options.timeout ?? 5000;
  }

  async init(config = {}) {
    this.apiKey = config.apiKey ?? this.apiKey;
    this.state = DataSourceBase.State.HEALTHY;
  }

  async healthCheck() {
    // 测试一个简单的请求
    const response = await fetch(`${this.baseUrl}/ping`, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async searchCoins(query) {
    const keyword = normalizeString(query);
    if (!keyword) return [];

    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.append("query", keyword);
    if (this.apiKey) {
      url.searchParams.append("x_cg_pro_api_key", this.apiKey);
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API 错误: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data?.coins) ? data.coins : [];
  }

  async resolveCoinId(query) {
    const ranked = rankSearchCoins(await this.searchCoins(query), query);
    const first = ranked[0] ?? null;
    return normalizeString(first?.id) || null;
  }

  /**
   * 获取代币价格
   *
   * @param {string|string[]} tokens - 代币 ID（如 'bitcoin', 'ethereum'）
   * @param {string} vsCurrency - 对标货币（如 'usd', 'jpy'）
   */
  async getPrice(tokens, optionsOrVsCurrency = "usd") {
    const options = typeof optionsOrVsCurrency === "string"
      ? { vsCurrency: optionsOrVsCurrency }
      : (optionsOrVsCurrency ?? {});
    const vsCurrency = normalizeString(options.vsCurrency ?? "usd") || "usd";
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];

    const platformKey = toCoinGeckoPlatformKey(options.network);
    const allAddressLike = tokenList.length > 0 && tokenList.every((token) => isAddressLike(token));

    if (allAddressLike && platformKey) {
      const contractAddresses = tokenList.map((token) => normalizeLower(token)).join(",");
      const url = new URL(`${this.baseUrl}/simple/token_price/${platformKey}`);
      url.searchParams.append("contract_addresses", contractAddresses);
      url.searchParams.append("vs_currencies", vsCurrency);
      url.searchParams.append("include_24hr_change", "true");

      if (this.apiKey) {
        url.searchParams.append("x_cg_pro_api_key", this.apiKey);
      }

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API 错误: ${response.status}`);
      }

      const data = await response.json();
      const result = {};
      for (const token of tokenList) {
        const key = normalizeLower(token);
        const row = data?.[key] ?? data?.[token] ?? null;
        result[key] = row
          ? {
            usd: Number(row[vsCurrency]),
            change24h: Number(row[`${vsCurrency}_24h_change`] ?? row["usd_24h_change"] ?? null),
            source: "coingecko",
            platform: platformKey,
            contractAddress: key,
          }
          : null;
      }

      return result;
    }

    const url = new URL(`${this.baseUrl}/simple/price`);
    url.searchParams.append("ids", tokenList.join(","));
    url.searchParams.append("vs_currencies", vsCurrency);
    url.searchParams.append("include_24hr_change", "true");

    if (this.apiKey) {
      url.searchParams.append("x_cg_pro_api_key", this.apiKey);
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API 错误: ${response.status}`);
    }

    const data = await response.json();

    const result = {};
    const missing = [];
    for (const token of tokenList) {
      const key = String(token);
      const row = data?.[key] ?? data?.[normalizeLower(key)] ?? null;
      result[key] = row ?? null;
      if (!row && !isAddressLike(key)) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      const resolvedIds = new Map();
      for (const token of missing) {
        try {
          const coinId = await this.resolveCoinId(token);
          if (coinId) {
            resolvedIds.set(token, coinId);
          }
        } catch {
          // ignore search fallback error for this token
        }
      }

      const uniqueIds = [...new Set([...resolvedIds.values()])];
      if (uniqueIds.length > 0) {
        const fallbackUrl = new URL(`${this.baseUrl}/simple/price`);
        fallbackUrl.searchParams.append("ids", uniqueIds.join(","));
        fallbackUrl.searchParams.append("vs_currencies", vsCurrency);
        fallbackUrl.searchParams.append("include_24hr_change", "true");

        if (this.apiKey) {
          fallbackUrl.searchParams.append("x_cg_pro_api_key", this.apiKey);
        }

        const fallbackResponse = await fetch(fallbackUrl.toString(), {
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!fallbackResponse.ok) {
          throw new Error(`CoinGecko API 错误: ${fallbackResponse.status}`);
        }

        const fallbackData = await fallbackResponse.json();
        for (const [token, coinId] of resolvedIds.entries()) {
          const row = fallbackData?.[coinId] ?? null;
          if (row) {
            result[token] = row;
          }
        }
      }
    }

    return Array.isArray(tokens)
      ? result
      : { [String(tokens)]: result[String(tokens)] ?? null };
  }

  /**
   * 获取 Token 信息
   *
   * @param {string} tokenId - 代币 ID
   */
  async getTokenInfo(tokenId, options = {}) {
    const query = normalizeString(tokenId);
    if (!query) return null;

    // 兼容旧调用：若传入 id，直接读取 coin 详情。
    if (query.includes("-")) {
      return await this.getTokenInfoById(query, options);
    }

    const ranked = rankSearchCoins(await this.searchCoins(query), query);

    for (const coin of ranked.slice(0, Math.max(1, Number(options.lookupLimit ?? 5)))) {
      const details = await this.getTokenInfoById(String(coin.id), options);
      if (!details) continue;
      if (options.network && !details.tokenAddress) continue;
      return details;
    }

    return null;
  }

  async getTokenInfoById(tokenId, options = {}) {
    const id = normalizeString(tokenId);
    if (!id) return null;

    const url = new URL(`${this.baseUrl}/coins/${encodeURIComponent(id)}`);
    url.searchParams.append("localization", "false");
    url.searchParams.append("tickers", "false");
    url.searchParams.append("market_data", "false");
    url.searchParams.append("community_data", "false");
    url.searchParams.append("developer_data", "false");
    url.searchParams.append("sparkline", "false");
    if (this.apiKey) {
      url.searchParams.append("x_cg_pro_api_key", this.apiKey);
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Token 不存在
      }
      throw new Error(`CoinGecko API 错误: ${response.status}`);
    }

    const data = await response.json();

    const selected = extractPlatformAddress(data, options);
    const mapped = mapPlatformToChainNetwork(selected.platformKey);

    return {
      id: data.id,
      symbol: data.symbol?.toUpperCase(),
      name: data.name,
      chain: mapped.chain,
      network: mapped.network,
      tokenAddress: selected.tokenAddress || null,
      platform: selected.platformKey || null,
      image: data.image?.large,
      description: data.description?.en,
      website: data.links?.homepage?.[0],
      marketCap: data.market_data?.market_cap?.usd,
      volume24h: data.market_data?.total_volume?.usd,
      circSupply: data.market_data?.circulating_supply,
      totalSupply: data.market_data?.total_supply,
    };
  }

  async getTokenCandidates(query, options = {}) {
    const keyword = normalizeString(query);
    if (!keyword) return [];

    const coins = await this.searchCoins(keyword);
    const limit = Math.max(1, Number(options.limit ?? 10));
    const ranked = rankSearchCoins(coins, keyword);

    const out = [];
    for (const coin of ranked.slice(0, limit)) {
      const details = await this.getTokenInfoById(String(coin.id), options);
      if (!details) continue;
      out.push({
        source: "coingecko",
        id: details.id,
        chain: details.chain,
        network: details.network,
        tokenAddress: details.tokenAddress,
        symbol: details.symbol,
        name: details.name,
        marketCapRank: toNumberOrNull(coin?.market_cap_rank),
        thumb: coin?.thumb ?? null,
      });
    }

    return out;
  }

  /**
   * 获取市场数据
   */
  async getMarketData(tokenId) {
    const url = `${this.baseUrl}/coins/${tokenId}/market_chart`;

    const response = await fetch(`${url}?vs_currency=usd&days=1`, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API 错误: ${response.status}`);
    }

    const data = await response.json();

    return {
      prices: data.prices,
      volumes: data.volumes,
      marketCaps: data.market_caps,
    };
  }
}

export default CoinGeckoSource;
