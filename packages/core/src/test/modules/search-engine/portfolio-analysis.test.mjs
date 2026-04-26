import { readFileSync } from "node:fs";
import { createSearchEngine } from "../../../modules/search-engine/index.mjs";
import { queryTokenPrice } from "../../../apps/offchain/token-price/index.mjs";
import { queryTokenPriceLiteBatchByQuery } from "../../../apps/offchain/token-price/query-token-price.mjs";
import { createBtcTokenSearchProvider } from "../../../apps/btc/search/token-provider.mjs";
import { createBtcAddressSearchProvider } from "../../../apps/btc/search/address-provider.mjs";
import { createBtcTradeSearchProvider } from "../../../apps/btc/search/trade-provider.mjs";
import { createEvmTokenSearchProvider } from "../../../apps/evm/search/token-provider.mjs";
import { createEvmDexScreenerTradeProvider } from "../../../apps/evm/search/trade-provider.mjs";
import { createEvmAddressSearchProvider } from "../../../apps/evm/search/address-provider.mjs";
import { createTrxTokenSearchProvider } from "../../../apps/trx/search/token-provider.mjs";
import { createTrxAddressSearchProvider } from "../../../apps/trx/search/address-provider.mjs";
import { createTrxTradeSearchProvider } from "../../../apps/trx/search/trade-provider.mjs";
import { getTrxTokenBook } from "../../../apps/trx/config/tokens.js";
import { queryEvmTokenMetadataBatch } from "../../../apps/evm/assets/token-metadata.mjs";
import { queryTrxTokenMetadataBatch } from "../../../apps/trx/assets/token-metadata.mjs";

// Run manually:
// node src/test/modules/search-engine/portfolio-analysis.test.mjs

/**
 * 投资组合分析全流程测试
 * 
 * 流程：
 * 1. 查询 token 信息
 * 2. 查询 token 价格（trade）
 * 3. 查询地址资产列表（address）
 * 4. 针对地址资产，再次查询价格
 * 5. 计算资产价值 (quantity × price)
 * 6. 标注 EVM 高风险（price=0）token
 * 7. 监测 API 性能指标
 */

// ============================================================================
// 工具函数
// ============================================================================

function parseTestDataMarkdown(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const out = {
    tokens: [],
    bsc: [],
    eth: [],
    trc20: [],
    nile: [],
    addresses: [],
  };
  let section = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("# tokens")) {
      section = "tokens";
      continue;
    }
    if (line.startsWith("# addresses")) {
      section = "addresses";
      continue;
    }
    if (line.startsWith("### bsc")) {
      section = "bsc";
      continue;
    }
    if (line.startsWith("### eth")) {
      section = "eth";
      continue;
    }
    if (line.startsWith("### trc20") || line.startsWith("### trc")) {
      section = "trc20";
      continue;
    }
    if (line.startsWith("### nile")) {
      section = "nile";
      continue;
    }
    if (line.startsWith("#") || line.startsWith("##")) {
      continue;
    }

    const value = line.replace(/^[-*]\s*/, "").trim();
    if (!value) continue;

    if (section && Array.isArray(out[section])) {
      out[section].push(value);
    }
  }

  return out;
}

function selectTestAddresses(dataset) {
  const addresses = {
    trx: [],
    btc: [],
    evm: [],
  };

  const all = dataset.addresses || [];
  for (const addr of all) {
    if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
      addresses.trx.push(addr);
    } else if (/^(bc1|1|3)/i.test(addr)) {
      addresses.btc.push(addr);
    } else if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      addresses.evm.push(addr);
    }
  }

  return addresses;
}

function selectTestTokens(dataset) {
  const tokens = {
    btc: [], // ORDI, SATS
    evm: [], // UNI, USDT, USDC, ARK, SEI, CRV, CVX
    evmAddresses: [],
    trx: [], // SUN, TRX
    trxContracts: [],
  };

  const all = (dataset.tokens || []).map((x) => String(x).toLowerCase());
  for (const token of all) {
    if (["ordi", "sats", "rats", "btc"].includes(token)) {
      tokens.btc.push(token);
    } else if (["uni", "usdt", "usdc", "arkm", "sei", "crv", "cvx", "vusdt", "eth", "bnb"].includes(token)) {
      tokens.evm.push(token);
    } else if (["sun", "trx"].includes(token)) {
      tokens.trx.push(token);
    }
  }

  tokens.trxContracts = Array.isArray(dataset.trc20)
    ? dataset.trc20.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  const evmAddressSet = new Set();
  for (const value of [...(dataset.bsc || []), ...(dataset.eth || [])]) {
    const addr = String(value ?? "").trim();
    if (!isEvmHexAddress(addr)) continue;
    evmAddressSet.add(addr.toLowerCase());
  }
  tokens.evmAddresses = [...evmAddressSet];

  return tokens;
}

function isTrxBase58Address(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value ?? "").trim());
}

function isEvmHexAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

const EVM_NON_FORK_NETWORKS = ["eth", "bsc"];

async function resolveEvmTokenAddressNetworksBatch(addresses = [], monitor = null) {
  const uniqueAddresses = [...new Set(
    (Array.isArray(addresses) ? addresses : [])
      .map((value) => String(value ?? "").trim())
      .filter((value) => isEvmHexAddress(value))
      .map((value) => value.toLowerCase()),
  )];

  const matchedNetworksByAddress = new Map();
  if (uniqueAddresses.length === 0) {
    return matchedNetworksByAddress;
  }

  for (const network of EVM_NON_FORK_NETWORKS) {
    const startTime = Date.now();
    try {
      const metadata = await queryEvmTokenMetadataBatch(uniqueAddresses, { network });
      const rows = Array.isArray(metadata?.items) ? metadata.items : [];
      let matchedCount = 0;

      for (const row of rows) {
        const tokenAddress = String(row?.tokenAddress ?? "").trim().toLowerCase();
        if (!tokenAddress) continue;
        const hasMetadata = Boolean(row?.symbol || row?.name || Number.isFinite(Number(row?.decimals)));
        if (!hasMetadata) continue;

        const found = matchedNetworksByAddress.get(tokenAddress) ?? new Set();
        if (!found.has(network)) matchedCount += 1;
        found.add(network);
        matchedNetworksByAddress.set(tokenAddress, found);
      }

      if (monitor) {
        monitor.recordRequest(
          "token_proof_batch",
          `evm-proof:${network}`,
          network,
          Date.now() - startTime,
          matchedCount,
          null,
        );
      }
    } catch (error) {
      if (monitor) {
        monitor.recordRequest(
          "token_proof_batch",
          `evm-proof:${network}`,
          network,
          Date.now() - startTime,
          0,
          error?.message ?? String(error),
        );
      }
    }
  }

  return matchedNetworksByAddress;
}

async function buildTrxTokenOverrides(dataset, addresses) {
  const contracts = Array.isArray(dataset?.trc20)
    ? dataset.trc20.filter((value) => isTrxBase58Address(value))
    : [];
  const callerAddress = Array.isArray(addresses?.trx) ? addresses.trx[0] : null;

  if (contracts.length === 0 || !callerAddress) {
    return {};
  }

  const metadata = await queryTrxTokenMetadataBatch(contracts, {
    network: "mainnet",
    callerAddress,
  });

  const overrides = {};
  for (const item of metadata.items || []) {
    if (!item?.ok || !item?.tokenAddress) continue;
    const key = normalizeTokenRef(item.symbol || item.tokenAddress);
    overrides[key] = {
      name: item.name || item.symbol || item.tokenAddress,
      symbol: item.symbol || item.tokenAddress,
      decimals: Number(item.decimals ?? 0),
      address: item.tokenAddress,
    };
  }

  return overrides;
}

async function createPortfolioSearchEngine(dataset, addresses) {
  const trxOverrides = await buildTrxTokenOverrides(dataset, addresses);
  const trxTokenBookReader = (input = {}) => {
    const network = String(input?.network ?? input?.networkName ?? "mainnet").trim().toLowerCase() || "mainnet";
    return getTrxTokenBook({
      ...input,
      network,
      overrides: network === "mainnet" ? trxOverrides : {},
    });
  };

  const engine = createSearchEngine();
  const providers = [
    createBtcTokenSearchProvider(),
    createBtcAddressSearchProvider(),
    createBtcTradeSearchProvider(),
    createEvmTokenSearchProvider(),
    createEvmDexScreenerTradeProvider(),
    createEvmAddressSearchProvider(),
    createTrxTokenSearchProvider({ tokenBookReader: trxTokenBookReader }),
    createTrxAddressSearchProvider({ tokenBookReader: trxTokenBookReader }),
    createTrxTradeSearchProvider(),
  ];

  for (const provider of providers) {
    engine.registerProvider(provider);
  }

  return engine;
}

// ============================================================================
// 性能监测
// ============================================================================

class PerformanceMonitor {
  constructor() {
    this.requests = [];
    this.startTime = Date.now();
    this.proofNetworkHits = {};
  }

  recordProofNetworkHit(network) {
    this.proofNetworkHits[network] = (this.proofNetworkHits[network] ?? 0) + 1;
  }

  recordRequest(domain, query, network, duration, resultCount, error = null) {
    this.requests.push({
      domain,
      query,
      network,
      duration,
      resultCount,
      error,
      timestamp: Date.now(),
    });
  }

  getStats() {
    const totalRequests = this.requests.length;
    const errorCount = this.requests.filter((r) => r.error).length;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

    const durations = this.requests.map((r) => r.duration);
    durations.sort((a, b) => a - b);

    const minDuration = durations[0] || 0;
    const maxDuration = durations[durations.length - 1] || 0;
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b) / durations.length : 0;
    const p95Duration = durations[Math.floor(durations.length * 0.95)] || 0;

    const byDomain = {};
    for (const req of this.requests) {
      if (!byDomain[req.domain]) {
        byDomain[req.domain] = { count: 0, errors: 0 };
      }
      byDomain[req.domain].count += 1;
      if (req.error) byDomain[req.domain].errors += 1;
    }

    const totalTime = Date.now() - this.startTime;

    return {
      totalRequests,
      errorCount,
      errorRate: errorRate.toFixed(1),
      minDuration,
      maxDuration,
      avgDuration: avgDuration.toFixed(0),
      p95Duration,
      byDomain,
      totalTime,
    };
  }

  printReport() {
    const stats = this.getStats();
    console.log("\n📊 === API 性能监测报告 ===");
    console.log(`  总请求数: ${stats.totalRequests}`);
    console.log(`  错误数: ${stats.errorCount} (${stats.errorRate}%)`);
    console.log(`  响应时间 - 最小: ${stats.minDuration}ms, 最大: ${stats.maxDuration}ms, 平均: ${stats.avgDuration}ms, P95: ${stats.p95Duration}ms`);
    console.log(`  按 domain 统计:`);
    for (const [domain, info] of Object.entries(stats.byDomain)) {
      console.log(`    ${domain}: ${info.count} 请求, ${info.errors} 错误`);
    }
    const proofEntries = Object.entries(this.proofNetworkHits);
    if (proofEntries.length > 0) {
      const distribution = proofEntries.map(([net, count]) => `${net}=${count}`).join(", ");
      console.log(`  EVM 地址预验证命中网络分布: ${distribution}`);
    }
    console.log(`  总耗时: ${stats.totalTime}ms`);
  }
}

// ============================================================================
// 搜索执行函数
// ============================================================================

async function searchWithMonitoring(engine, monitor, domain, query, network, limit = 5) {
  const startTime = Date.now();
  try {
    const result = await engine.search({
      domain,
      query,
      network,
      limit,
      timeoutMs: 10000,
    });

    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    const duration = Date.now() - startTime;

    monitor.recordRequest(domain, query, network, duration, candidates.length);

    return {
      ok: true,
      duration,
      candidates,
      error: null,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    monitor.recordRequest(domain, query, network, duration, 0, error?.message);

    return {
      ok: false,
      duration,
      candidates: [],
      error: error?.message || String(error),
    };
  }
}

function trimTrailingZeros(value) {
  const text = String(value ?? "0").trim();
  if (!text.includes(".")) {
    return text;
  }
  return text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function pickAssetBalance(asset = {}) {
  const extra = asset.extra && typeof asset.extra === "object" ? asset.extra : {};
  const nestedAsset = extra.asset && typeof extra.asset === "object" ? extra.asset : {};

  if (extra.assetType === "native") {
    return trimTrailingZeros(extra.confirmed ?? 0);
  }
  if (typeof extra.balance === "string" || typeof extra.balance === "number") {
    return trimTrailingZeros(extra.balance);
  }
  if (typeof nestedAsset.formatted === "string" || typeof nestedAsset.formatted === "number") {
    return trimTrailingZeros(nestedAsset.formatted);
  }
  if (typeof nestedAsset.balance === "string" || typeof nestedAsset.balance === "number") {
    return trimTrailingZeros(nestedAsset.balance);
  }
  if (typeof extra.confirmed === "number") {
    return trimTrailingZeros(extra.confirmed);
  }

  return "0";
}

function pickAssetLabel(asset = {}, chain) {
  const extra = asset.extra && typeof asset.extra === "object" ? asset.extra : {};
  const nestedAsset = extra.asset && typeof extra.asset === "object" ? extra.asset : {};
  const tokenAddress = String(asset.tokenAddress || nestedAsset.address || "").trim();

  function shortTokenAddress(value) {
    const text = String(value ?? "").trim();
    if (!text) return "TOKEN";
    if (text.toLowerCase() === "native") {
      return chain === "evm" ? "ETH" : chain === "trx" ? "TRX" : "BTC";
    }
    return `${text.slice(0, 6)}...${text.slice(-4)}`;
  }

  const symbol = String(
    asset.symbol
      || nestedAsset.symbol
      || extra.ticker
      || (chain === "evm" ? shortTokenAddress(tokenAddress) : asset.title)
      || asset.title
      || (chain === "btc" ? "BTC" : chain === "trx" ? "TRX" : "TOKEN"),
  ).trim();

  if (extra.assetType === "native") {
    return "BTC";
  }

  return symbol;
}

function logAssetBalances(assets = [], chain) {
  for (const asset of assets) {
    const label = pickAssetLabel(asset, chain);
    const balance = pickAssetBalance(asset);
    console.log(`      - ${label}: ${balance}`);
  }
}

function parseNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function resolvePriceNetwork(chain, network) {
  if (chain === "btc") return "btc";
  if (chain === "trx") return "trx";
  const normalized = String(network ?? "").trim().toLowerCase();
  return normalized || "eth";
}

function inferPriceQueryKind(query) {
  const value = String(query ?? "").trim();
  if (!value) return "symbol";
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return "address";
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return "address";
  return "symbol";
}

function getNativeAssetSymbol(chain, network) {
  if (chain === "btc") return "BTC";
  if (chain === "trx") return "TRX";
  return String(network ?? "").trim().toLowerCase() === "bsc" ? "BNB" : "ETH";
}

function buildAssetPriceQuery(asset = {}, chain, network, label) {
  const extra = asset.extra && typeof asset.extra === "object" ? asset.extra : {};
  const nestedAsset = extra.asset && typeof extra.asset === "object" ? extra.asset : {};

  if (extra.assetType === "native" || extra.protocol === "native") {
    return getNativeAssetSymbol(chain, network);
  }

  return String(
    asset.tokenAddress
      || extra.contractAddress
      || nestedAsset.address
      || asset.address
      || extra.ticker
      || asset.symbol
      || label,
  ).trim();
}

function shouldUseNativePriceScope(chain, network, query) {
  const token = normalizeTokenRef(query);
  if (token === "btc") return chain === "btc";
  if (token === "trx") return chain === "trx";
  if (token === "eth") return chain === "evm" && String(network ?? "").trim().toLowerCase() === "eth";
  if (token === "bnb") return chain === "evm" && String(network ?? "").trim().toLowerCase() === "bsc";
  return false;
}

async function resolvePreloadPriceQuery(engine, monitor, chain, network, query) {
  const normalizedQuery = String(query ?? "").trim();
  if (!normalizedQuery) return null;

  if (["btc", "trx", "eth", "bnb"].includes(normalizeTokenRef(normalizedQuery))) {
    return shouldUseNativePriceScope(chain, network, normalizedQuery) ? normalizedQuery : null;
  }

  if (chain === "btc" || inferPriceQueryKind(normalizedQuery) === "address") {
    return normalizedQuery;
  }

  const tokenNetwork = chain === "trx" ? "mainnet" : network;
  const tokenResult = await searchWithMonitoring(engine, monitor, "token", normalizedQuery, tokenNetwork, 5);
  if (!tokenResult.ok || tokenResult.candidates.length === 0) {
    return null;
  }

  const exact = tokenResult.candidates.find((candidate) => {
    return normalizeTokenRef(candidate?.chain) === chain
      && normalizeTokenRef(candidate?.network) === normalizeTokenRef(tokenNetwork)
      && normalizeTokenRef(candidate?.symbol) === normalizeTokenRef(normalizedQuery);
  });

  const picked = exact ?? tokenResult.candidates[0];
  return String(picked?.tokenAddress || picked?.address || "").trim() || null;
}

const STABLE_SYMBOLS = new Set(["usdt", "usdc", "dai", "busd", "tusd", "gusd", "usdd", "usdj"]);

function normalizeTokenRef(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getExpectedTradeChainIds(chain, network) {
  if (chain === "evm" && network === "eth") return new Set(["ethereum", "eth"]);
  if (chain === "evm" && network === "bsc") return new Set(["bsc", "binance-smart-chain"]);
  if (chain === "trx") return new Set(["tron", "trx"]);
  if (chain === "btc") return new Set(["btc", "bitcoin"]);
  return null;
}

function matchesTradeSide(side = {}, query) {
  const target = normalizeTokenRef(query);
  if (!target) return false;
  return [side.address, side.symbol, side.name].some((value) => normalizeTokenRef(value) === target);
}

function pickBestTradeCandidate(candidates = [], chain, network, query) {
  const allowedChainIds = getExpectedTradeChainIds(chain, network);
  const rows = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const chainId = normalizeTokenRef(candidate?.extra?.chainId);
    if (!allowedChainIds || !chainId) return true;
    return allowedChainIds.has(chainId);
  });

  const scored = rows.map((candidate) => {
    const extra = candidate.extra && typeof candidate.extra === "object" ? candidate.extra : {};
    const baseToken = extra.baseToken && typeof extra.baseToken === "object" ? extra.baseToken : {};
    const quoteToken = extra.quoteToken && typeof extra.quoteToken === "object" ? extra.quoteToken : {};
    const price = extractTradePrice(candidate, chain);
    const liquidity = parseNumeric(extra.liquidityUsd);
    const baseMatch = matchesTradeSide(baseToken, query);
    const quoteMatch = matchesTradeSide(quoteToken, query);
    const quoteStable = STABLE_SYMBOLS.has(normalizeTokenRef(quoteToken.symbol));
    const symbolMatch = normalizeTokenRef(candidate?.symbol) === normalizeTokenRef(query);

    let score = liquidity;
    let resolvedPrice = price;

    if (baseMatch) {
      score += 1_000_000;
    } else if (quoteMatch && quoteStable) {
      score += 800_000;
      resolvedPrice = 1;
    } else if (quoteMatch) {
      score += 200_000;
    } else if (symbolMatch) {
      score += 100_000;
    }

    if (resolvedPrice > 0) {
      score += 10_000;
    }

    return {
      candidate,
      price: resolvedPrice,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}

function extractTradePrice(candidate = {}, chain) {
  const extra = candidate.extra && typeof candidate.extra === "object" ? candidate.extra : {};
  if (extra.priceUsd != null) return parseNumeric(extra.priceUsd);
  if (extra.price != null) return parseNumeric(extra.price);
  if (candidate.priceUsd != null) return parseNumeric(candidate.priceUsd);
  if (candidate.price != null) return parseNumeric(candidate.price);
  if (chain === "btc" && extra.floorPrice != null) return parseNumeric(extra.floorPrice);
  return 0;
}

function extractAssetQuantity(asset = {}) {
  const extra = asset.extra && typeof asset.extra === "object" ? asset.extra : {};
  const nestedAsset = extra.asset && typeof extra.asset === "object" ? extra.asset : {};

  if (extra.assetType === "native") {
    return parseNumeric(extra.confirmed);
  }
  if (typeof extra.balance === "string" || typeof extra.balance === "number") {
    return parseNumeric(extra.balance);
  }
  if (typeof nestedAsset.formatted === "string" || typeof nestedAsset.formatted === "number") {
    return parseNumeric(nestedAsset.formatted);
  }
  if (typeof nestedAsset.balance === "string" || typeof nestedAsset.balance === "number") {
    return parseNumeric(nestedAsset.balance);
  }
  return 0;
}

function buildPriceKey(chain, network, query) {
  return `${chain}:${resolvePriceNetwork(chain, network)}:${String(query ?? "").trim().toLowerCase()}`;
}

async function resolveTradePrice(engine, monitor, chain, network, query, limit = 3) {
  const startTime = Date.now();
  const priceNetwork = resolvePriceNetwork(chain, network);

  try {
    const result = await queryTokenPrice({
      query,
      network: priceNetwork,
      kind: inferPriceQueryKind(query),
    });
    const duration = Date.now() - startTime;
    const ok = Boolean(result?.ok) && Number.isFinite(Number(result?.priceUsd));

    monitor.recordRequest(
      "price",
      `${chain}:${query}`,
      priceNetwork,
      duration,
      ok ? 1 : 0,
      ok ? null : (result?.error ?? null),
    );

    return {
      ok,
      price: ok ? Number(result.priceUsd) : 0,
      source: result?.source ?? null,
      title: result?.symbol ?? null,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    monitor.recordRequest("price", `${chain}:${query}`, priceNetwork, duration, 0, error?.message ?? String(error));

    return {
      ok: false,
      price: 0,
      source: null,
      title: null,
    };
  }
}

async function preloadTokenPrices(engine, monitor, tokens) {
  const tokenPriceMap = new Map();

  // 收集所有需要查询的 token，分类为"需要本地解析"和"可直接查价"
  const needsResolution = [];
  const directQueries = [];
  const evmAddressCandidates = [];

  async function collectToken(chain, network, query) {
    const key = buildPriceKey(chain, network, query);
    if (tokenPriceMap.has(key)) return;

    const normalizedQuery = String(query ?? "").trim();
    if (!normalizedQuery) return;

    if (["btc", "trx", "eth", "bnb"].includes(normalizeTokenRef(normalizedQuery))) {
      if (shouldUseNativePriceScope(chain, network, normalizedQuery)) {
        directQueries.push({ query: normalizedQuery, network: resolvePriceNetwork(chain, network), chain });
        return;
      }
    }

    if (chain === "evm" && inferPriceQueryKind(normalizedQuery) === "address") {
      evmAddressCandidates.push(normalizedQuery);
      return;
    }

    if (chain === "btc" || inferPriceQueryKind(normalizedQuery) === "address") {
      directQueries.push({ query: normalizedQuery, network: resolvePriceNetwork(chain, network), chain });
      return;
    }

    needsResolution.push({ originalQuery: normalizedQuery, chain, network });
  }

  // 收集所有 token
  for (const token of tokens.btc) await collectToken("btc", "mainnet", token);
  for (const token of tokens.evm) {
    await collectToken("evm", "eth", token);
    await collectToken("evm", "bsc", token);
  }
  for (const token of tokens.trx) await collectToken("trx", "mainnet", token);
  for (const token of tokens.trxContracts || []) await collectToken("trx", "mainnet", token);

  // EVM tokenAddress: 先做网络归属验证，只对命中网络做价格查询
  evmAddressCandidates.push(...(tokens.evmAddresses || []));
  const evmMatchedNetworks = await resolveEvmTokenAddressNetworksBatch(evmAddressCandidates, monitor);
  for (const address of [...new Set(evmAddressCandidates.map((value) => String(value).toLowerCase()))]) {
    const matched = evmMatchedNetworks.get(address);
    if (!matched || matched.size === 0) continue;
    for (const network of matched) {
      monitor.recordProofNetworkHit(network);
      directQueries.push({ query: address, network: resolvePriceNetwork("evm", network), chain: "evm" });
    }
  }

  // 步骤 1: 本地解析 token（获取确切的 tokenAddress）
  const resolvedQueries = [];
  for (const item of needsResolution) {
    const resolvedQuery = await resolvePreloadPriceQuery(engine, monitor, item.chain, item.network, item.originalQuery);
    if (resolvedQuery) {
      resolvedQueries.push({
        query: resolvedQuery,
        network: resolvePriceNetwork(item.chain, item.network),
        chain: item.chain,
        originalKey: buildPriceKey(item.chain, item.network, item.originalQuery),
      });
    }
  }

  // 步骤 2: 合并所有待查询，按 (chain, network) 分组后批量查价
  const allQueriesToBatch = [...directQueries, ...resolvedQueries];
  const grouped = new Map();

  for (const item of allQueriesToBatch) {
    const key = `${item.chain}:${item.network}`;
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }

  // 步骤 3: 对每组执行批量查价
  for (const group of grouped.values()) {
    const batchItems = group.map((item) => ({
      query: item.query,
      network: item.network,
      chain: item.chain,
    }));

    const startTime = Date.now();
    try {
      const batchRes = await queryTokenPriceLiteBatchByQuery(batchItems);
      const duration = Date.now() - startTime;
      const batchResults = Array.isArray(batchRes?.items) ? batchRes.items : [];
      const successCount = batchResults.filter((r) => r?.ok).length;

      monitor.recordRequest(
        "price_batch",
        `batch:${group[0]?.chain}:${group[0]?.network}`,
        group[0]?.network,
        duration,
        successCount,
        batchResults.length > 0 && successCount === 0 ? "all-failed" : null,
      );

      for (let i = 0; i < group.length; i++) {
        const original = group[i];
        const result = batchResults[i] ?? {};
        const key = original.originalKey || buildPriceKey(original.chain, original.network, original.query);
        tokenPriceMap.set(key, {
          ok: Boolean(result?.ok && Number.isFinite(Number(result?.priceUsd))),
          price: Number(result?.priceUsd ?? 0),
          source: result?.source ?? null,
          title: result?.symbol ?? null,
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      monitor.recordRequest(
        "price_batch",
        `batch:${group[0]?.chain}:${group[0]?.network}`,
        group[0]?.network,
        duration,
        0,
        error?.message ?? String(error),
      );

      for (const item of group) {
        const key = buildPriceKey(item.chain, item.network, item.query);
        tokenPriceMap.set(key, {
          ok: false,
          price: 0,
          source: null,
          title: null,
        });
      }
    }
  }

  return tokenPriceMap;
}

async function queryFirstNonEmptyEvmAssets(engine, monitor, address) {
  const context = await engine.resolveAddressContext({ query: address, chain: "evm" });
  const contextItem = Array.isArray(context?.items) ? context.items[0] : null;
  const networks = Array.isArray(contextItem?.availableNetworks) && contextItem.availableNetworks.length > 0
    ? contextItem.availableNetworks
    : ["eth"];

  const attempts = [];

  for (const network of networks) {
    const result = await searchWithMonitoring(engine, monitor, "address", address, network);
    attempts.push({ network, result });
    if (result.ok && result.candidates.length > 0) {
      return {
        ok: true,
        network,
        candidates: result.candidates,
        attempts,
      };
    }
  }

  return {
    ok: false,
    network: attempts[0]?.network ?? null,
    candidates: [],
    attempts,
  };
}

// ============================================================================
// 投资组合分析流程
// ============================================================================

async function analyzePortfolio(engine, monitor, addresses, tokens) {
  const portfolio = {
    byChain: {
      btc: { totalValue: 0, assets: [] },
      evm: { totalValue: 0, assets: [] },
      trx: { totalValue: 0, assets: [] },
    },
    riskFlags: [],
  };

  // ========================
  // 第一步：查询各地址资产
  // ========================
  console.log("\n🔍 === 步骤 1: 查询各地址资产 ===");

  const addressAssets = {};

  // BTC 地址
  for (const addr of addresses.btc) {
    console.log(`  查询 BTC 地址: ${addr}`);
    const result = await searchWithMonitoring(engine, monitor, "address", addr, "mainnet");

    if (result.ok && result.candidates.length > 0) {
      addressAssets[addr] = {
        chain: "btc",
        assets: result.candidates.map((c) => ({
          symbol: c.symbol || c.title || "BTC",
          address: c.address,
          title: c.title,
          extra: c.extra,
        })),
      };
      console.log(`    ✓ 发现 ${result.candidates.length} 项资产`);
      logAssetBalances(addressAssets[addr].assets, "btc");
    } else {
      console.log(`    ✗ 查询失败 或 无资产: ${result.error || "无数据"}`);
    }
  }

  // EVM 地址
  for (const addr of addresses.evm) {
    console.log(`  查询 EVM 地址: ${addr}`);
    const resolved = await queryFirstNonEmptyEvmAssets(engine, monitor, addr);

    if (resolved.ok && resolved.candidates.length > 0) {
      addressAssets[addr] = {
        chain: "evm",
        network: resolved.network,
        assets: resolved.candidates.map((c) => ({
          symbol: c.symbol || c.title || "ETH",
          address: c.address,
          tokenAddress: c.tokenAddress,
          title: c.title,
          extra: c.extra,
        })),
      };
      console.log(`    ✓ ${resolved.network} 发现 ${resolved.candidates.length} 项资产`);
      logAssetBalances(addressAssets[addr].assets, "evm");
    } else {
      const tried = resolved.attempts.map((item) => item.network).join(", ");
      console.log(`    ✗ 查询失败 或 无资产: 无数据（已尝试: ${tried || "eth"}）`);
    }
  }

  // TRX 地址
  for (const addr of addresses.trx) {
    console.log(`  查询 TRX 地址: ${addr}`);
    const result = await searchWithMonitoring(engine, monitor, "address", addr, "mainnet");

    if (result.ok && result.candidates.length > 0) {
      addressAssets[addr] = {
        chain: "trx",
        assets: result.candidates.map((c) => ({
          symbol: c.symbol || c.title || "TRX",
          address: c.address,
          title: c.title,
          extra: c.extra,
        })),
      };
      console.log(`    ✓ 发现 ${result.candidates.length} 项资产`);
      logAssetBalances(addressAssets[addr].assets, "trx");
    } else {
      console.log(`    ✗ 查询失败 或 无资产: ${result.error || "无数据"}`);
    }
  }

  // ========================
  // 第二步：预热 token 价格
  // ========================
  console.log("\n💱 === 步骤 2: 查询 Token 价格 ===");
  const tokenPriceMap = await preloadTokenPrices(engine, monitor, tokens);

  for (const [key, info] of tokenPriceMap.entries()) {
    if (info.price > 0) {
      console.log(`    ✓ ${key} -> ${info.price}`);
    }
  }

  // ========================
  // 第三步：按地址计算资产价值（批量查价）
  // ========================
  console.log("\n📊 === 步骤 3: 计算地址资产价值（批量查价） ===");

  const addressPriceCache = new Map(tokenPriceMap);

  // 收集所有待查的资产价格请求
  const assetPriceRequests = new Map(); // key: buildPriceKey(...), value: {chain, network, query, assets: [{address, asset, label, quantity}]}

  for (const [address, payload] of Object.entries(addressAssets)) {
    const chain = payload.chain;
    const network = payload.network || (chain === "evm" ? "eth" : "mainnet");

    for (const asset of payload.assets) {
      const label = pickAssetLabel(asset, chain);
      const quantity = extractAssetQuantity(asset);
      const query = buildAssetPriceQuery(asset, chain, network, label);
      const priceKey = buildPriceKey(chain, network, query);

      if (!addressPriceCache.has(priceKey)) {
        if (!assetPriceRequests.has(priceKey)) {
          assetPriceRequests.set(priceKey, {
            chain,
            network,
            query,
            assets: [],
          });
        }
        assetPriceRequests.get(priceKey).assets.push({
          address,
          asset,
          label,
          quantity,
        });
      }
    }
  }

  // 按 (chain, network) 分组，批量查价
  const grouped = new Map();
  for (const [priceKey, item] of assetPriceRequests) {
    const groupKey = `${item.chain}:${item.network}`;
    const group = grouped.get(groupKey) ?? { chain: item.chain, network: item.network, requests: [] };
    group.requests.push({ priceKey, query: item.query });
    grouped.set(groupKey, group);
  }

  for (const group of grouped.values()) {
    const batchItems = group.requests.map((req) => ({
      query: req.query,
      network: group.network,
      chain: group.chain,
    }));

    const startTime = Date.now();
    try {
      const batchRes = await queryTokenPriceLiteBatchByQuery(batchItems);
      const duration = Date.now() - startTime;
      const batchResults = Array.isArray(batchRes?.items) ? batchRes.items : [];
      const successCount = batchResults.filter((r) => r?.ok).length;

      monitor.recordRequest(
        "asset_price_batch",
        `asset_batch:${group.chain}:${group.network}`,
        group.network,
        duration,
        successCount,
        batchResults.length > 0 && successCount === 0 ? "all-failed" : null,
      );

      for (let i = 0; i < group.requests.length; i++) {
        const req = group.requests[i];
        const result = batchResults[i] ?? {};
        addressPriceCache.set(req.priceKey, {
          ok: Boolean(result?.ok && Number.isFinite(Number(result?.priceUsd))),
          price: Number(result?.priceUsd ?? 0),
          source: result?.source ?? null,
          title: result?.symbol ?? null,
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      monitor.recordRequest(
        "asset_price_batch",
        `asset_batch:${group.chain}:${group.network}`,
        group.network,
        duration,
        0,
        error?.message ?? String(error),
      );

      for (const req of group.requests) {
        addressPriceCache.set(req.priceKey, {
          ok: false,
          price: 0,
          source: null,
          title: null,
        });
      }
    }
  }

  // 应用缓存的价格信息，计算资产价值
  for (const [address, payload] of Object.entries(addressAssets)) {
    const chain = payload.chain;
    const network = payload.network || (chain === "evm" ? "eth" : "mainnet");
    const target = portfolio.byChain[chain];

    console.log(`  地址: ${address}`);

    for (const asset of payload.assets) {
      const label = pickAssetLabel(asset, chain);
      const quantity = extractAssetQuantity(asset);
      const query = buildAssetPriceQuery(asset, chain, network, label);
      const priceKey = buildPriceKey(chain, network, query);

      const priceInfo = addressPriceCache.get(priceKey) ?? { price: 0, source: null };
      const price = Number(priceInfo.price ?? 0);
      const value = quantity * price;
      const riskFlag = chain === "evm" && price === 0 ? "high-risk-price-zero" : null;

      if (riskFlag) {
        portfolio.riskFlags.push({
          chain,
          network,
          address,
          asset: label,
          tokenAddress: asset.tokenAddress || null,
          reason: "price=0",
        });
      }

      target.assets.push({
        address,
        network,
        label,
        quantity,
        price,
        value,
        riskFlag,
      });
      target.totalValue += value;

      const riskText = riskFlag ? " [risk]" : "";
      console.log(`    - ${label}: qty=${trimTrailingZeros(quantity)} price=${trimTrailingZeros(price)} value=${trimTrailingZeros(value)}${riskText}`);
    }
  }

  return portfolio;
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log("🚀 === 投资组合分析全流程测试 ===\n");

  // 读取测试数据
  const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
  const dataset = parseTestDataMarkdown(raw);
  const addresses = selectTestAddresses(dataset);
  const tokens = selectTestTokens(dataset);

  console.log("📋 测试数据总结:");
  console.log(`  BTC 地址: ${addresses.btc.length} 个`);
  console.log(`  EVM 地址: ${addresses.evm.length} 个`);
  console.log(`  TRX 地址: ${addresses.trx.length} 个`);
  console.log(`  BTC Token: ${tokens.btc.join(", ")}`);
  console.log(`  EVM Token: ${tokens.evm.join(", ")}`);
  console.log(`  TRX Token: ${tokens.trx.join(", ")}`);
  console.log(`  TRX TRC20: ${tokens.trxContracts.join(", ")}`);
  console.log(`  EVM TokenAddress 样本: ${tokens.evmAddresses.length} 个`);

  const engine = await createPortfolioSearchEngine(dataset, addresses);
  const monitor = new PerformanceMonitor();

  const portfolio = await analyzePortfolio(engine, monitor, addresses, tokens);

  console.log("\n💰 === 投资组合总结 ===");
  for (const [chain, data] of Object.entries(portfolio.byChain)) {
    console.log(`  ${chain.toUpperCase()}: total=${trimTrailingZeros(data.totalValue)} assets=${data.assets.length}`);
  }

  if (portfolio.riskFlags.length > 0) {
    console.log("\n⚠️ === 风险标记 ===");
    for (const item of portfolio.riskFlags) {
      console.log(`  - ${item.chain}/${item.network} ${item.address} ${item.asset}: ${item.reason}`);
    }
  }

  monitor.printReport();

  console.log("\n✅ 投资组合分析测试完成\n");
}

main().catch((error) => {
  console.error("❌ 测试执行失败:", error);
  process.exit(1);
});
