/**
 * 搜索引擎全域覆盖测试
 * 
 * 测试所有 domain (token/trade/address/contract) 在各链 (BTC/EVM/TRX) 的覆盖
 * 
 * 运行方式：
 * node src/test/modules/search-engine/domain-coverage-test.mjs
 */

import { createSearchEngine } from "../../../modules/search-engine/index.mjs";
import { createBtcTokenSearchProvider } from "../../../apps/btc/search/token-provider.mjs";
import { createBtcAddressSearchProvider } from "../../../apps/btc/search/address-provider.mjs";
import { createBtcTradeSearchProvider } from "../../../apps/btc/search/trade-provider.mjs";
import { createEvmTokenSearchProvider } from "../../../apps/evm/search/token-provider.mjs";
import { createEvmDexScreenerTradeProvider } from "../../../apps/evm/search/trade-provider.mjs";
import { createEvmAddressSearchProvider } from "../../../apps/evm/search/address-provider.mjs";
import { createTrxTokenSearchProvider } from "../../../apps/trx/search/token-provider.mjs";
import { createTrxAddressSearchProvider } from "../../../apps/trx/search/address-provider.mjs";
import { createTrxTradeSearchProvider } from "../../../apps/trx/search/trade-provider.mjs";

// ============================================================================
// 测试样本数据
// ============================================================================

const TEST_CASES = {
  // BTC
  btc: {
    token: [
      { query: "ORDI", network: "mainnet" },
      { query: "SATS", network: "mainnet" },
      { query: "BTC", network: "mainnet" },
    ],
    address: [
      { query: "bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6", network: "mainnet" },
      { query: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", network: "mainnet" },
    ],
    trade: [
      { query: "ORDI", network: "mainnet" },
      { query: "BTC", network: "mainnet" },
    ],
    contract: [
      // BTC 没有 contract search
    ],
  },

  // EVM
  evm: {
    token: [
      { query: "UNI", network: "eth" },
      { query: "USDT", network: "eth" },
      { query: "USDC", network: "bsc" },
      { query: "BNB", network: "bsc" },
    ],
    address: [
      { query: "0x63320F728777d332a1F1031019481A94144779fB", network: "eth" },
      { query: "0xed70EBC39d5445FeBccc96B60E88bC0D2B6dfD9c", network: "bsc" },
    ],
    trade: [
      { query: "UNI", network: "eth" },
      { query: "USDT", network: "eth" },
      { query: "USDC", network: "bsc" },
    ],
    contract: [
      { query: "0xdac17f958d2ee523a2206206994597c13d831ec7", network: "eth" }, // USDT
      { query: "0x55d398326f99059fF775485246999027B3197955", network: "bsc" }, // USDT BSC
    ],
  },

  // TRX
  trx: {
    token: [
      { query: "TRX", network: "mainnet" },
      { query: "USDT", network: "mainnet" },
    ],
    address: [
      { query: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h", network: "mainnet" },
      { query: "TPsMJ3BE9ixSQ7guFbVLZ4eou6SATBSqHH", network: "mainnet" },
    ],
    trade: [
      { query: "TRX", network: "mainnet" },
      { query: "USDT", network: "mainnet" },
    ],
    contract: [
      { query: "TR7NHqjeKQxgtci8q8zy4pl8otszgjlJ6t", network: "mainnet" }, // USDT
    ],
  },
};

// ============================================================================
// 性能统计
// ============================================================================

class TestStats {
  constructor() {
    this.results = [];
  }

  record(chain, domain, network, query, ok, duration, resultCount, error) {
    this.results.push({
      chain,
      domain,
      network,
      query,
      ok,
      duration,
      resultCount,
      error,
    });
  }

  summary() {
    const byChain = {};
    const byDomain = {};
    const byChainDomain = {};

    for (const r of this.results) {
      // By chain
      if (!byChain[r.chain]) {
        byChain[r.chain] = { total: 0, ok: 0, errors: 0 };
      }
      byChain[r.chain].total += 1;
      if (r.ok) byChain[r.chain].ok += 1;
      else byChain[r.chain].errors += 1;

      // By domain
      if (!byDomain[r.domain]) {
        byDomain[r.domain] = { total: 0, ok: 0, errors: 0 };
      }
      byDomain[r.domain].total += 1;
      if (r.ok) byDomain[r.domain].ok += 1;
      else byDomain[r.domain].errors += 1;

      // By chain:domain
      const key = `${r.chain}:${r.domain}`;
      if (!byChainDomain[key]) {
        byChainDomain[key] = { total: 0, ok: 0, errors: 0 };
      }
      byChainDomain[key].total += 1;
      if (r.ok) byChainDomain[key].ok += 1;
      else byChainDomain[key].errors += 1;
    }

    return { byChain, byDomain, byChainDomain };
  }

  print() {
    const s = this.summary();

    console.log("\n📊 === 按链统计 ===");
    for (const [chain, stats] of Object.entries(s.byChain)) {
      const rate = ((stats.ok / stats.total) * 100).toFixed(1);
      console.log(`  ${chain.toUpperCase()}: ${stats.ok}/${stats.total} (${rate}%)`);
    }

    console.log("\n📊 === 按 domain 统计 ===");
    for (const [domain, stats] of Object.entries(s.byDomain)) {
      const rate = ((stats.ok / stats.total) * 100).toFixed(1);
      console.log(`  ${domain}: ${stats.ok}/${stats.total} (${rate}%)`);
    }

    console.log("\n📊 === 按链+domain 统计 ===");
    for (const [key, stats] of Object.entries(s.byChainDomain)) {
      const rate = ((stats.ok / stats.total) * 100).toFixed(1);
      console.log(`  ${key}: ${stats.ok}/${stats.total} (${rate}%)`);
    }

    console.log("\n📊 === 失败的请求 ===");
    const failures = this.results.filter((r) => !r.ok);
    if (failures.length === 0) {
      console.log("  全部成功！✅");
    } else {
      for (const f of failures) {
        console.log(`  ❌ ${f.chain}:${f.domain} ${f.query} @ ${f.network}: ${f.error}`);
      }
    }

    console.log("\n📊 === 性能统计 ===");
    const durations = this.results.map((r) => r.duration);
    durations.sort((a, b) => a - b);
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b) / durations.length : 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
    console.log(`  平均响应: ${avg.toFixed(0)}ms`);
    console.log(`  P95 响应: ${p95.toFixed(0)}ms`);
    console.log(`  总耗时: ${durations.reduce((a, b) => a + b, 0)}ms`);
  }
}

// ============================================================================
// 搜索函数
// ============================================================================

async function testSearch(engine, stats, chain, domain, query, network) {
  const startTime = Date.now();
  try {
    const result = await engine.search({
      domain,
      query,
      network,
      limit: 5,
      timeoutMs: 10000,
    });

    const duration = Date.now() - startTime;
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    stats.record(chain, domain, network, query, true, duration, candidates.length, null);

    return {
      ok: true,
      candidates,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    stats.record(chain, domain, network, query, false, duration, 0, error?.message);

    return {
      ok: false,
      candidates: [],
      duration,
      error: error?.message,
    };
  }
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log("🚀 === 搜索引擎全域覆盖测试 ===\n");

  // 创建引擎
  const engine = createSearchEngine();
  const providers = [
    createBtcTokenSearchProvider(),
    createBtcAddressSearchProvider(),
    createBtcTradeSearchProvider(),
    createEvmTokenSearchProvider(),
    createEvmDexScreenerTradeProvider(),
    createEvmAddressSearchProvider(),
    createTrxTokenSearchProvider(),
    createTrxAddressSearchProvider(),
    createTrxTradeSearchProvider(),
  ];

  for (const provider of providers) {
    engine.registerProvider(provider);
  }

  const stats = new TestStats();

  // 逐链测试
  for (const [chain, domains] of Object.entries(TEST_CASES)) {
    console.log(`\n🔗 === ${chain.toUpperCase()} 链 ===`);

    for (const [domain, testItems] of Object.entries(domains)) {
      if (testItems.length === 0) {
        console.log(`  ⏭️  ${domain}: (无测试样本)`);
        continue;
      }

      console.log(`  📌 ${domain}:`);

      for (const item of testItems) {
        const result = await testSearch(engine, stats, chain, domain, item.query, item.network);

        if (result.ok) {
          const shortQuery = item.query.length > 30 ? item.query.slice(0, 27) + "..." : item.query;
          console.log(`    ✓ ${shortQuery} (${item.network}) -> ${result.candidates.length} 结果 [${result.duration}ms]`);
        } else {
          const shortQuery = item.query.length > 30 ? item.query.slice(0, 27) + "..." : item.query;
          console.log(`    ✗ ${shortQuery} (${item.network}) -> ${result.error}`);
        }
      }
    }
  }

  // 打印统计
  stats.print();

  // 覆盖率矩阵
  console.log("\n\n📋 === 测试覆盖矩阵 ===");
  console.log("     BTC   EVM   TRX");
  console.log("  ┌─────────────────┐");
  console.log("  │token │ ✓  │ ✓  │ ✓  │");
  console.log("  ├─────────────────┤");
  console.log("  │trade │ ✓  │ ✓  │ ✓  │");
  console.log("  ├─────────────────┤");
  console.log("  │addr  │ ✓  │ ✓  │ ✓  │");
  console.log("  ├─────────────────┤");
  console.log("  │ctr   │ -  │ ✓  │ ✓  │");
  console.log("  └─────────────────┘");

  console.log("\n✅ 测试完成\n");
}

main().catch((error) => {
  console.error("❌ 测试失败:", error);
  process.exit(1);
});
