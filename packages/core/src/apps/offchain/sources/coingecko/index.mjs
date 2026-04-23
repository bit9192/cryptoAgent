/**
 * CoinGecko 数据源实现
 *
 * 功能：
 * - 获取代币价格
 * - 获取 Token 信息
 * - 获取市场数据
 */

import { DataSourceBase } from "../base.mjs";

export class CoinGeckoSource extends DataSourceBase {
  metadata = {
    name: "coingecko",
    version: "1.0.0",
    description: "CoinGecko - Token prices, market data, historical data",
    capabilities: ["getPrice", "getTokenInfo", "getMarketData"],
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

  /**
   * 获取代币价格
   *
   * @param {string|string[]} tokens - 代币 ID（如 'bitcoin', 'ethereum'）
   * @param {string} vsCurrency - 对标货币（如 'usd', 'jpy'）
   */
  async getPrice(tokens, vsCurrency = "usd") {
    const tokenList = Array.isArray(tokens) ? tokens.join(",") : tokens;

    const url = new URL(`${this.baseUrl}/simple/price`);
    url.searchParams.append("ids", tokenList);
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

    // 转换格式
    const result = Array.isArray(tokens) ? data : { [tokens]: data[tokens] };
    return result;
  }

  /**
   * 获取 Token 信息
   *
   * @param {string} tokenId - 代币 ID
   */
  async getTokenInfo(tokenId) {
    const url = `${this.baseUrl}/coins/${tokenId}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Token 不存在
      }
      throw new Error(`CoinGecko API 错误: ${response.status}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      symbol: data.symbol?.toUpperCase(),
      name: data.name,
      image: data.image?.large,
      description: data.description?.en,
      website: data.links?.homepage?.[0],
      marketCap: data.market_data?.market_cap?.usd,
      volume24h: data.market_data?.total_volume?.usd,
      circSupply: data.market_data?.circulating_supply,
      totalSupply: data.market_data?.total_supply,
    };
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
