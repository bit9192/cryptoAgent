/**
 * Llama (DefiLlama) 数据源使用示例
 * 演示如何查询 DeFi 协议 TVL、链信息、项目数据
 */

import { LlamaSource } from "./llama/index.mjs";
import { DataSourceRegistry } from "./registry.mjs";

console.log("\n╔════════════════════════════════════════╗");
console.log("║  Llama 数据源使用示例          ║");
console.log("╚════════════════════════════════════════╝\n");

/**
 * 场景 1: 查询单个 DeFi 协议的 TVL
 */
async function scenario1_ProtocolTVL() {
  console.log("\n【场景 1】查询 DeFi 协议 TVL\n");

  const llama = new LlamaSource();
  await llama.init();

  try {
    // 查询 Aave 协议的 TVL
    const aaveData = await llama.getProtocolTVL("aave");
    console.log("✓ Aave 协议信息:");
    console.log(`  名称: ${aaveData.name}`);
    console.log(`  符号: ${aaveData.symbol}`);
    console.log(`  总 TVL: $${(aaveData.tvl / 1e9).toFixed(2)}B`);
    console.log(`  各链 TVL:`, aaveData.chainTVLs);
    console.log(`  1h 变化: ${aaveData.change_1h}%`);
    console.log(`  1d 变化: ${aaveData.change_1d}%`);
    console.log(`  7d 变化: ${aaveData.change_7d}%`);

    // 查询 Uniswap V3
    console.log("\n✓ 查询 Uniswap V3...");
    const uniswapData = await llama.getProtocolTVL("uniswap-v3");
    console.log(`  Uniswap V3 TVL: $${(uniswapData.tvl / 1e9).toFixed(2)}B`);

  } catch (error) {
    console.error("❌ 错误:", error.message);
  }
}

/**
 * 场景 2: 查询链的总 TVL
 */
async function scenario2_ChainTVL() {
  console.log("\n【场景 2】查询链的总 TVL\n");

  const llama = new LlamaSource();
  await llama.init();

  try {
    // 查询以太坊 TVL
    const ethereumTVL = await llama.getChainTVL("ethereum");
    console.log("✓ Ethereum 链数据:");
    console.log(`  TVL: $${(ethereumTVL.tvl / 1e9).toFixed(2)}B`);
    console.log(`  市值: $${ethereumTVL.mcap ? (ethereumTVL.mcap / 1e9).toFixed(2) + 'B' : 'N/A'}`);
    console.log(`  原生币: ${ethereumTVL.tokenSymbol}`);
    console.log(`  1d 变化: ${ethereumTVL.change_1d}%`);

    // 查询 Polygon
    console.log("\n✓ Polygon 链数据:");
    const polygonTVL = await llama.getChainTVL("polygon");
    console.log(`  TVL: $${(polygonTVL.tvl / 1e9).toFixed(2)}B`);

    // 查询 Arbitrum
    console.log("\n✓ Arbitrum 链数据:");
    const arbitrumTVL = await llama.getChainTVL("arbitrum");
    console.log(`  TVL: $${(arbitrumTVL.tvl / 1e9).toFixed(2)}B`);

    // 查询 TRON
    console.log("\n✓ TRON 链数据:");
    const tronTVL = await llama.getChainTVL("tron");
    console.log(`  TVL: $${(tronTVL.tvl / 1e9).toFixed(2)}B`);

  } catch (error) {
    console.error("❌ 错误:", error.message);
  }
}

/**
 * 场景 3: 获取所有协议及其 TVL 排行
 */
async function scenario3_TopProtocols() {
  console.log("\n【场景 3】顶部 DeFi 协议 TVL 排行\n");

  const llama = new LlamaSource();
  await llama.init();

  try {
    const topProtocols = await llama.getTopProtocols(10);
    console.log("✓ 顶部 10 个协议 (按 TVL 排序):\n");

    topProtocols.forEach((protocol, index) => {
      const tvlB = (protocol.tvl / 1e9).toFixed(2);
      const change = protocol.change_1d 
        ? `${protocol.change_1d > 0 ? '↑' : '↓'} ${Math.abs(protocol.change_1d).toFixed(2)}%`
        : 'N/A';
      console.log(`  ${index + 1}. ${protocol.name.padEnd(20)} TVL: $${tvlB.padStart(8)}B  ${change}`);
    });

  } catch (error) {
    console.error("❌ 错误:", error.message);
  }
}

/**
 * 场景 4: 按协议类别查询
 */
async function scenario4_ProtocolsByCategory() {
  console.log("\n【场景 4】按协议类别查询\n");

  const llama = new LlamaSource();
  await llama.init();

  try {
    // 查询 DEX
    console.log("✓ DEX 协议:");
    const dexes = await llama.getProtocolsByCategory("dexes");
    console.log(`  找到 ${dexes.length} 个 DEX`);
    dexes.slice(0, 5).forEach(dex => {
      console.log(`    - ${dex.name}: $${(dex.tvl / 1e9).toFixed(2)}B TVL`);
    });

    // 查询借贷
    console.log("\n✓ 借贷协议:");
    const lending = await llama.getProtocolsByCategory("lending");
    console.log(`  找到 ${lending.length} 个借贷协议`);
    lending.slice(0, 5).forEach(proto => {
      console.log(`    - ${proto.name}: $${(proto.tvl / 1e9).toFixed(2)}B TVL`);
    });

    // 查询衍生品
    console.log("\n✓ 衍生品协议:");
    const derivatives = await llama.getProtocolsByCategory("derivatives");
    console.log(`  找到 ${derivatives.length} 个衍生品协议`);
    derivatives.slice(0, 5).forEach(proto => {
      console.log(`    - ${proto.name}: $${(proto.tvl / 1e9).toFixed(2)}B TVL`);
    });

  } catch (error) {
    console.error("❌ 错误:", error.message);
  }
}

/**
 * 场景 5: 获取链的历史 TVL 数据
 */
async function scenario5_HistoricalTVL() {
  console.log("\n【场景 5】链的历史 TVL 数据\n");

  const llama = new LlamaSource();
  await llama.init();

  try {
    const history = await llama.getChainTVLHistory("ethereum");
    console.log("✓ Ethereum 历史 TVL 数据（最近 7 个数据点）:");
    
    if (Array.isArray(history) && history.length > 0) {
      // 只显示最近的 7 个
      const recent = history.slice(-7);
      recent.forEach(([timestamp, tvl]) => {
        const date = new Date(timestamp * 1000).toLocaleDateString();
        const tvlB = (tvl / 1e9).toFixed(2);
        console.log(`  ${date}: $${tvlB}B`);
      });
    }

  } catch (error) {
    console.error("❌ 错误:", error.message);
  }
}

/**
 * 场景 6: 在 Registry 中使用 Llama（自动故障转移）
 */
async function scenario6_WithRegistry() {
  console.log("\n【场景 6】在 Registry 中使用 Llama（自动故障转移）\n");

  const registry = new DataSourceRegistry();
  const llama = new LlamaSource();

  try {
    await registry.register(llama, { priority: 1 });

    // 查询链信息
    console.log("✓ 通过 Registry 查询链信息:");
    const chainInfo = await registry.query(
      "getChainInfo",
      async (source) => {
        console.log(`  尝试 ${source.metadata.name}...`);
        return source.getChainInfo(1); // chainId 1 = Ethereum
      }
    );

    console.log(`  链: ${chainInfo.name}`);
    console.log(`  TVL: $${(chainInfo.tvl / 1e9).toFixed(2)}B`);

  } catch (error) {
    console.error("❌ 错误:", error.message);
  } finally {
    registry.stopHealthCheckTimer();
  }
}

/**
 * 场景 7: 比较多链 TVL
 */
async function scenario7_MultiChainComparison() {
  console.log("\n【场景 7】多链 TVL 对比\n");

  const llama = new LlamaSource();
  await llama.init();

  try {
    const chains = ["ethereum", "bsc", "polygon", "arbitrum", "optimism", "avalanche", "fantom"];
    const data = [];

    console.log("⏳ 正在收集数据...\n");
    for (const chain of chains) {
      try {
        const tvl = await llama.getChainTVL(chain);
        data.push({
          name: tvl.name,
          tvl: tvl.tvl,
          change: tvl.change_1d,
        });
      } catch (e) {
        // 忽略不支持的链
      }
    }

    // 排序
    data.sort((a, b) => b.tvl - a.tvl);

    console.log("✓ 链 TVL 排行:\n");
    console.log("排名  链名          TVL              24h变化");
    console.log("────────────────────────────────────────────────");
    data.forEach((item, index) => {
      const tvlB = (item.tvl / 1e9).toFixed(2);
      const arrow = item.change > 0 ? "↑" : "↓";
      const changeStr = Math.abs(item.change).toFixed(2);
      console.log(
        `${String(index + 1).padEnd(4)} ${item.name.padEnd(12)} $${tvlB.padStart(10)}B  ${arrow} ${changeStr}%`
      );
    });

  } catch (error) {
    console.error("❌ 错误:", error.message);
  }
}

/**
 * 主程序
 */
async function main() {
  const scenarios = [
    { name: "协议 TVL 查询", fn: scenario1_ProtocolTVL },
    { name: "链 TVL 查询", fn: scenario2_ChainTVL },
    { name: "顶部协议排行", fn: scenario3_TopProtocols },
    { name: "按类别查询", fn: scenario4_ProtocolsByCategory },
    { name: "历史数据", fn: scenario5_HistoricalTVL },
    { name: "Registry 集成", fn: scenario6_WithRegistry },
    { name: "多链对比", fn: scenario7_MultiChainComparison },
  ];

  let scenarioIndex = 0;

  // 交互式菜单
  const promptScenario = async () => {
    if (scenarioIndex < scenarios.length) {
      const scenario = scenarios[scenarioIndex];
      console.log(`\n执行: ${scenario.name}`);
      try {
        await scenario.fn();
      } catch (error) {
        console.error(`场景执行失败:`, error);
      }
      scenarioIndex++;
      // 继续下一个
      setTimeout(promptScenario, 2000);
    } else {
      console.log("\n╔════════════════════════════════════════╗");
      console.log("║  ✅ 所有示例执行完成！      ║");
      console.log("╚════════════════════════════════════════╝\n");
      process.exit(0);
    }
  };

  // 开始
  promptScenario();
}

// 运行
main().catch(console.error);
