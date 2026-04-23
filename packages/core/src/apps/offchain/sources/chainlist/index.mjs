/**
 * ChainList 数据源实现
 *
 * 功能：
 * - 获取链信息
 * - 获取 RPC 端点
 * - 获取块浏览器地址
 */

import { DataSourceBase } from "../base.mjs";

export class ChainListSource extends DataSourceBase {
  metadata = {
    name: "chainlist",
    version: "1.0.0",
    description: "ChainList - Chain RPC endpoints, chain metadata",
    capabilities: ["getChainInfo", "getRpcEndpoints"],
    rateLimit: { requests: 20, period: 60000 },
    cacheTTL: 600000,
  };

  constructor(options = {}) {
    super(options);
    this.baseUrl = options.baseUrl ?? "https://chainid.network";
    this.timeout = options.timeout ?? 5000;
    this.chains = null;
  }

  async init(config = {}) {
    this.timeout = config.timeout ?? this.timeout;
    // 预加载链列表
    await this.loadChains();
    this.state = DataSourceBase.State.HEALTHY;
  }

  async loadChains() {
    const url = `https://chainid.network/chains.json`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`ChainList 加载失败: ${response.status}`);
    }

    this.chains = await response.json();
  }

  async healthCheck() {
    if (!this.chains) {
      await this.loadChains();
    }

    return { ok: true, chainsLoaded: this.chains?.length ?? 0 };
  }

  /**
   * 获取链信息
   *
   * @param {number|string} chainId - 链 ID
   */
  async getChainInfo(chainId) {
    if (!this.chains) {
      await this.loadChains();
    }

    const chain = this.chains.find((c) => c.chainId === Number(chainId));

    if (!chain) {
      return null;
    }

    return {
      chainId: chain.chainId,
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
      rpc: chain.rpc,
      explorers: chain.explorers,
      faucets: chain.faucets,
      infoURL: chain.infoURL,
    };
  }

  /**
   * 获取 RPC 端点
   */
  async getRpcEndpoints(chainId) {
    const chainInfo = await this.getChainInfo(chainId);

    if (!chainInfo) {
      return [];
    }

    // 过滤公开的 RPC 端点
    return chainInfo.rpc.filter((rpc) => !rpc.includes("${") && rpc.includes("http"));
  }

  /**
   * 获取所有链
   */
  async getAllChains() {
    if (!this.chains) {
      await this.loadChains();
    }

    return this.chains;
  }
}

export default ChainListSource;
