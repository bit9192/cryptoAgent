/**
 * 批量请求性能与稳定性测试
 * 
 * 测试目的：
 * - 验证 queryTokenPriceLiteBatchByQuery 的稳定性
 * - 对比单个 vs 批量 request 的性能差异
 * - 监测并发压力下的错误率
 * 
 * 运行方式：
 * node src/test/modules/search-engine/batch-price-test.mjs
 */

import { queryTokenPrice } from "../../../apps/offchain/token-price/index.mjs";
import { queryTokenPriceLiteBatchByQuery } from "../../../apps/offchain/token-price/query-token-price.mjs";

// ============================================================================
// 性能监测
// ============================================================================

class PerfMetrics {
  constructor(name) {
    this.name = name;
    this.samples = [];
    this.startTime = Date.now();
  }

  record(duration, ok, resultCount = 1) {
    this.samples.push({ duration, ok, resultCount, timestamp: Date.now() });
  }

  stats() {
    const total = this.samples.length;
    const errors = this.samples.filter((s) => !s.ok).length;
    const durations = this.samples.map((s) => s.duration);
    durations.sort((a, b) => a - b);

    const min = durations[0] || 0;
    const max = durations[durations.length - 1] || 0;
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b) / durations.length : 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
    const p99 = durations[Math.floor(durations.length * 0.99)] || 0;
    const totalTime = Date.now() - this.startTime;

    return {
      name: this.name,
      total,
      errors,
      errorRate: ((errors / total) * 100).toFixed(1),
      min: min.toFixed(0),
      avg: avg.toFixed(0),
      max: max.toFixed(0),
      p95: p95.toFixed(0),
      p99: p99.toFixed(0),
      totalTime: totalTime.toFixed(0),
    };
  }

  print() {
    const s = this.stats();
    console.log(`\n📊 ${s.name}`);
    console.log(`  请求数: ${s.total} | 错误: ${s.errors} (${s.errorRate}%)`);
    console.log(`  响应时间 - min: ${s.min}ms, avg: ${s.avg}ms, p95: ${s.p95}ms, p99: ${s.p99}ms, max: ${s.max}ms`);
    console.log(`  总耗时: ${s.totalTime}ms`);
    return s;
  }
}

// ============================================================================
// 测试样本
// ============================================================================

const TEST_TOKENS = [
  // BTC 链
  { query: "ORDI", network: "btc", chain: "btc" },
  { query: "SATS", network: "btc", chain: "btc" },
  { query: "BTC", network: "btc", chain: "btc" },

  // EVM - ETH
  { query: "UNI", network: "eth", chain: "evm" },
  { query: "USDT", network: "eth", chain: "evm" },
  { query: "USDC", network: "eth", chain: "evm" },
  { query: "ARKM", network: "eth", chain: "evm" },
  { query: "SEI", network: "eth", chain: "evm" },
  { query: "CRV", network: "eth", chain: "evm" },
  { query: "CVX", network: "eth", chain: "evm" },

  // EVM - BSC
  { query: "UNI", network: "bsc", chain: "evm" },
  { query: "USDT", network: "bsc", chain: "evm" },
  { query: "USDC", network: "bsc", chain: "evm" },
  { query: "BNB", network: "bsc", chain: "evm" },
  { query: "CAKE", network: "bsc", chain: "evm" },

  // TRX
  { query: "TRX", network: "trx", chain: "trx" },
  { query: "USDT", network: "trx", chain: "trx" },
  { query: "USDC", network: "trx", chain: "trx" },
];

// ============================================================================
// 测试函数
// ============================================================================

async function testSingleRequests() {
  console.log("\n🔄 === 测试 1: 单个请求模式 ===");
  const metrics = new PerfMetrics("单个请求模式 (queryTokenPrice × 1)");

  for (const item of TEST_TOKENS) {
    const startTime = Date.now();
    try {
      const result = await queryTokenPrice({
        query: item.query,
        network: item.network,
        kind: "symbol",
      });
      const duration = Date.now() - startTime;
      const ok = Boolean(result?.ok && Number.isFinite(Number(result?.priceUsd)));
      metrics.record(duration, ok);

      if (ok) {
        console.log(`  ✓ ${item.chain}:${item.network}:${item.query} -> ${result.priceUsd}`);
      } else {
        console.log(`  ✗ ${item.chain}:${item.network}:${item.query} -> error`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.record(duration, false);
      console.log(`  ✗ ${item.chain}:${item.network}:${item.query} -> ${error.message}`);
    }
  }

  return metrics;
}

async function testBatchRequests() {
  console.log("\n⚡ === 测试 2: 批量请求模式 ===");
  const metrics = new PerfMetrics("批量请求模式 (queryTokenPriceLiteBatchByQuery × 1)");

  const startTime = Date.now();
  try {
    const result = await queryTokenPriceLiteBatchByQuery(TEST_TOKENS);
    const duration = Date.now() - startTime;
    const items = Array.isArray(result?.items) ? result.items : [];
    const okCount = items.filter((r) => r?.ok).length;

    metrics.record(duration, okCount > 0, okCount);

    console.log(`  📦 一次性提交 ${TEST_TOKENS.length} 个请求，收到 ${items.length} 个结果`);
    for (const item of items) {
      if (item?.ok) {
        console.log(`  ✓ ${item.chain || "unknown"}:${item.network}:${item.query} -> ${item.priceUsd}`);
      } else {
        console.log(`  ✗ ${item?.chain || "unknown"}:${item?.network}:${item?.query} -> error: ${item?.error}`);
      }
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    metrics.record(duration, false);
    console.log(`  ✗ 批量请求失败: ${error.message}`);
  }

  return metrics;
}

async function testBatchByGroup() {
  console.log("\n🔀 === 测试 3: 分组批量请求模式 ===");
  const metrics = new PerfMetrics("分组批量请求模式 (按 chain:network 分组)");

  // 按 chain:network 分组
  const grouped = new Map();
  for (const item of TEST_TOKENS) {
    const key = `${item.chain}:${item.network}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  console.log(`  📦 分为 ${grouped.size} 组进行批量查询`);

  let totalResults = 0;
  for (const [groupKey, items] of grouped) {
    const startTime = Date.now();
    try {
      const result = await queryTokenPriceLiteBatchByQuery(items);
      const duration = Date.now() - startTime;
      const batchItems = Array.isArray(result?.items) ? result.items : [];
      const okCount = batchItems.filter((r) => r?.ok).length;

      metrics.record(duration, okCount > 0, okCount);
      totalResults += batchItems.length;

      console.log(`  ✓ ${groupKey}: ${items.length} 请求 -> ${okCount} 个成功`);
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.record(duration, false, items.length);
      console.log(`  ✗ ${groupKey}: 批量请求失败 -> ${error.message}`);
    }
  }

  console.log(`  总共处理 ${totalResults} 个结果`);
  return metrics;
}

async function testConcurrentBatches() {
  console.log("\n🔀 === 测试 4: 并发批量请求模式 ===");
  const metrics = new PerfMetrics("并发批量请求模式 (Promise.all × 分组)");

  // 按 chain:network 分组
  const grouped = new Map();
  for (const item of TEST_TOKENS) {
    const key = `${item.chain}:${item.network}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  console.log(`  📦 ${grouped.size} 组并发查询`);

  const promises = [];
  for (const [groupKey, items] of grouped) {
    const promise = (async () => {
      const startTime = Date.now();
      try {
        const result = await queryTokenPriceLiteBatchByQuery(items);
        const duration = Date.now() - startTime;
        const batchItems = Array.isArray(result?.items) ? result.items : [];
        const okCount = batchItems.filter((r) => r?.ok).length;

        metrics.record(duration, okCount > 0, okCount);
        console.log(`  ✓ ${groupKey}: ${items.length} 请求 -> ${okCount} 个成功 (${duration}ms)`);
        return { ok: true, group: groupKey, count: okCount };
      } catch (error) {
        const duration = Date.now() - startTime;
        metrics.record(duration, false, items.length);
        console.log(`  ✗ ${groupKey}: 批量请求失败 -> ${error.message}`);
        return { ok: false, group: groupKey, error: error.message };
      }
    })();
    promises.push(promise);
  }

  await Promise.all(promises);
  return metrics;
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log("🚀 === 批量请求性能与稳定性测试 ===");
  console.log(`📋 测试样本: ${TEST_TOKENS.length} 个 token`);
  console.log(`   - BTC: 3 个`);
  console.log(`   - EVM (ETH): 7 个`);
  console.log(`   - EVM (BSC): 5 个`);
  console.log(`   - TRX: 3 个`);

  const metricsArray = [];

  // 测试 1: 单个请求
  const m1 = await testSingleRequests();
  metricsArray.push(m1);

  // 测试 2: 一次性批量
  const m2 = await testBatchRequests();
  metricsArray.push(m2);

  // 测试 3: 分组批量
  const m3 = await testBatchByGroup();
  metricsArray.push(m3);

  // 测试 4: 并发批量
  const m4 = await testConcurrentBatches();
  metricsArray.push(m4);

  // ========== 总结对比 ==========
  console.log("\n\n📊 === 性能对比总结 ===");
  const allStats = metricsArray.map((m) => m.stats());
  for (const s of allStats) {
    console.log(`\n${s.name}`);
    console.log(`  总请求数: ${s.total}`);
    console.log(`  错误率: ${s.errorRate}%`);
    console.log(`  平均响应: ${s.avg}ms`);
    console.log(`  耗时: ${s.totalTime}ms`);
  }

  // 性能改进百分比
  const singleTime = parseInt(allStats[0].totalTime);
  const batchTime = parseInt(allStats[1].totalTime);
  const groupTime = parseInt(allStats[2].totalTime);
  const concurrentTime = parseInt(allStats[3].totalTime);

  console.log("\n⚡ === 改进倍数 ===");
  console.log(`  一次性批量 vs 单个:    ${(singleTime / batchTime).toFixed(1)}x 快速`);
  console.log(`  分组批量 vs 单个:      ${(singleTime / groupTime).toFixed(1)}x 快速`);
  console.log(`  并发批量 vs 单个:      ${(singleTime / concurrentTime).toFixed(1)}x 快速`);
  console.log(`  并发批量 vs 一次性:    ${(batchTime / concurrentTime).toFixed(1)}x ${concurrentTime < batchTime ? "快速" : "慢速"}`);

  console.log("\n✅ 测试完成\n");
}

main().catch((error) => {
  console.error("❌ 测试失败:", error);
  process.exit(1);
});
