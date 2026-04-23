/**
 * 完整的应用集成示例
 * 展示如何在实际项目中使用链下数据源管理系统
 */

import { OffchainDataSourceManager } from "./index.mjs";
import { CoinGeckoSource } from "./coingecko/index.mjs";
import { ChainListSource } from "./chainlist/index.mjs";
import { DataSourceRegistry } from "./registry.mjs";

/**
 * 场景 1: 交易应用中的价格查询
 */
async function scenario1_TradingApp() {
  console.log("\n═══════════════════════════════════════");
  console.log("场景 1: 交易应用价格查询");
  console.log("═══════════════════════════════════════\n");

  const manager = new OffchainDataSourceManager({
    logger: console,
  });

  try {
    // 初始化
    const coingecko = new CoinGeckoSource();
    const chainlist = new ChainListSource();
    await manager.init([coingecko, chainlist]);

    // 获取价格（自动容错）
    console.log("📊 查询加密货币价格...");
    const prices = await manager.getPrice(["bitcoin", "ethereum", "cardano"]);
    console.log("✓ 价格获取成功:", prices);

    // 再次查询（命中缓存）
    console.log("\n📊 再次查询（应该命中缓存）...");
    const startTime = Date.now();
    const cachedPrices = await manager.getPrice(["bitcoin", "ethereum"]);
    const duration = Date.now() - startTime;
    console.log(`✓ 缓存查询完成 (${duration}ms):`, cachedPrices);

    // 强制刷新
    console.log("\n📊 强制刷新（跳过缓存）...");
    const freshPrices = await manager.getPrice(["bitcoin"], {
      useCache: false,
    });
    console.log("✓ 新鲜数据:", freshPrices);

  } catch (error) {
    console.error("❌ 错误:", error.message);
  } finally {
    await manager.shutdown();
  }
}

/**
 * 场景 2: 链信息应用
 */
async function scenario2_ChainRegistry() {
  console.log("\n═══════════════════════════════════════");
  console.log("场景 2: 获取链信息和 RPC 端点");
  console.log("═══════════════════════════════════════\n");

  const manager = new OffchainDataSourceManager({
    logger: console,
  });

  try {
    const chainlist = new ChainListSource();
    await manager.init([chainlist]);

    // 获取单个链的信息
    console.log("🔗 查询以太坊信息...");
    const ethereumInfo = await manager.getChainInfo(1);
    console.log("✓ 以太坊信息:", {
      name: ethereumInfo.name,
      nativeCurrency: ethereumInfo.nativeCurrency,
      rpcCount: ethereumInfo.rpc?.length || 0,
    });

    // 获取其他链
    console.log("\n🔗 查询 Polygon 信息...");
    const polygonInfo = await manager.getChainInfo(137);
    console.log("✓ Polygon 信息:", {
      name: polygonInfo.name,
      nativeCurrency: polygonInfo.nativeCurrency,
      rpcCount: polygonInfo.rpc?.length || 0,
    });

  } catch (error) {
    console.error("❌ 错误:", error.message);
  } finally {
    await manager.shutdown();
  }
}

/**
 * 场景 3: 使用直接的 Registry 进行高级故障转移
 */
async function scenario3_AdvancedFailover() {
  console.log("\n═══════════════════════════════════════");
  console.log("场景 3: 高级故障转移控制");
  console.log("═══════════════════════════════════════\n");

  const registry = new DataSourceRegistry({
    healthCheckInterval: 30000,
    logger: console,
  });

  try {
    // 注册多个源
    const coingecko = new CoinGeckoSource();
    const chainlist = new ChainListSource();

    await registry.register(coingecko, { priority: 1 });
    await registry.register(chainlist, { priority: 2 });

    console.log("✓ 已注册源:");
    registry.listSources().forEach((s) => {
      console.log(`  - ${s.name} (优先级 ${s.priority})`);
    });

    // 执行查询，明确指定源顺序
    console.log("\n📋 按优先级执行查询...");
    const result = await registry.query(
      "getPrice",
      async (source) => {
        console.log(`  → 尝试 ${source.name}...`);
        return source.getPrice(["bitcoin"]);
      },
      { sources: ["coingecko", "chainlist"] }
    );
    console.log("✓ 查询成功:", result);

    // 健康检查
    console.log("\n❤️  执行健康检查...");
    const health = await registry.healthCheck();
    console.log(`✓ 健康状态: ${health.healthySources}/${health.totalSources} 源健康`);
    Object.entries(health.results).forEach(([name, result]) => {
      const status = result.ok ? "✓" : "✗";
      console.log(
        `  ${status} ${name}: ${result.responseTime || "N/A"}ms`
      );
    });

    // 性能指标
    console.log("\n📈 性能指标:");
    // 执行一些查询以收集指标
    for (let i = 0; i < 5; i++) {
      await registry.query(
        "getPrice",
        async (source) => source.getPrice(["ethereum"]),
        { sources: ["coingecko"] }
      );
    }
    const metrics = registry.getMetrics();
    console.log(`  - 总请求: ${metrics.totalRequests}`);
    console.log(`  - 总失败: ${metrics.totalFailures}`);
    console.log(`  - 失败率: ${metrics.failureRate}`);

  } catch (error) {
    console.error("❌ 错误:", error.message);
  } finally {
    registry.stopHealthCheckTimer();
  }
}

/**
 * 场景 4: 监控和告警
 */
async function scenario4_MonitoringAndAlerts() {
  console.log("\n═══════════════════════════════════════");
  console.log("场景 4: 监控和告警系统");
  console.log("═══════════════════════════════════════\n");

  const manager = new OffchainDataSourceManager({
    logger: console,
    healthCheckInterval: 10000,
  });

  try {
    const coingecko = new CoinGeckoSource();
    const chainlist = new ChainListSource();
    await manager.init([coingecko, chainlist]);

    // 启动监控循环
    let monitoringActive = true;
    const monitoringInterval = setInterval(async () => {
      console.log("\n[监控] 检查源状态...");

      // 获取健康状态
      try {
        const health = await manager.getHealthStatus();
        console.log(`[监控] ❤️  健康: ${health.healthySources}/${health.totalSources}`);

        // 检查是否有故障的源
        Object.entries(health.results).forEach(([name, result]) => {
          if (!result.ok) {
            console.warn(`[告警] 🚨 ${name} 故障! 响应时间: ${result.responseTime}ms`);
          }
        });
      } catch (error) {
        console.warn(`[监控] ⚠️  健康检查失败: ${error.message}`);
      }

      // 获取指标
      const metrics = manager.getMetrics();
      const failureRate = parseFloat(metrics.failureRate);

      console.log(`[监控] 📈 失败率: ${metrics.failureRate}`);

      if (failureRate > 5) {
        console.warn(
          `[告警] 🚨 高故障率! 失败率超过 5%: ${metrics.failureRate}`
        );
      }

      if (failureRate === 0 && metrics.totalRequests > 0) {
        console.log("[监控] ✨ 所有源运行良好");
      }
    }, 5000);

    // 执行一些查询以生成数据
    console.log("\n[应用] 执行查询以测试监控...");
    for (let i = 0; i < 3; i++) {
      await manager.getPrice(["bitcoin", "ethereum"]);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 停止监控
    clearInterval(monitoringInterval);
    monitoringActive = false;

  } catch (error) {
    console.error("❌ 错误:", error.message);
  } finally {
    await manager.shutdown();
  }
}

/**
 * 场景 5: Token 信息应用（个性化查询顺序）
 */
async function scenario5_TokenInfoWithCustomRouting() {
  console.log("\n═══════════════════════════════════════");
  console.log("场景 5: Token 信息查询（自定义路由）");
  console.log("═══════════════════════════════════════\n");

  const registry = new DataSourceRegistry({
    logger: console,
  });

  try {
    // 注册源并可指定不同的优先级用于不同的能力
    const coingecko = new CoinGeckoSource();
    const chainlist = new ChainListSource();

    await registry.register(coingecko, { 
      priority: 1,
      capabilities: ["getPrice", "getTokenInfo"], 
    });
    await registry.register(chainlist, { 
      priority: 2,
      capabilities: ["getChainInfo"], 
    });

    // 获取 Token 信息：优先使用 CoinGecko
    console.log("🪙 获取 Bitcoin 信息（优先 CoinGecko）...");
    const btcInfo = await registry.query(
      "getTokenInfo",
      async (source) => {
        console.log(`  → 尝试 ${source.name} 获取 Token 信息...`);
        return source.getTokenInfo("bitcoin");
      },
      { sources: ["coingecko", "chainlist"] }
    );

    if (btcInfo) {
      console.log("✓ Bitcoin 信息:", {
        symbol: btcInfo.symbol,
        marketCap: btcInfo.market_cap,
        marketCapRank: btcInfo.market_cap_rank,
      });
    }

    // 获取 Ethereum 信息
    console.log("\n🪙 获取 Ethereum 信息...");
    const ethInfo = await registry.query(
      "getTokenInfo",
      async (source) => {
        console.log(`  → 尝试 ${source.name} 获取 Token 信息...`);
        return source.getTokenInfo("ethereum");
      },
      { sources: ["coingecko"] }
    );

    if (ethInfo) {
      console.log("✓ Ethereum 信息:", {
        symbol: ethInfo.symbol,
        marketCap: ethInfo.market_cap,
        marketCapRank: ethInfo.market_cap_rank,
      });
    }

  } catch (error) {
    console.error("❌ 错误:", error.message);
  } finally {
    registry.stopHealthCheckTimer();
  }
}

/**
 * 主程序
 */
async function main() {
  console.log("\n╔═══════════════════════════════════════╗");
  console.log("║ 链下数据源管理系统 - 集成示例演示 ║");
  console.log("╚═══════════════════════════════════════╝");

  try {
    // 可选：运行单个场景或全部
    const scenarios = [
      scenario1_TradingApp,
      scenario2_ChainRegistry,
      scenario3_AdvancedFailover,
      scenario4_MonitoringAndAlerts,
      scenario5_TokenInfoWithCustomRouting,
    ];

    // 运行第一个场景作为演示
    // 取消注释下面的行来运行所有场景
    await scenarios[0]();
    // for (const scenario of scenarios) {
    //   await scenario();
    //   console.log("\n⏸️  场景完成，按 Enter 继续...");
    //   await new Promise(resolve => setTimeout(resolve, 2000));
    // }

  } catch (error) {
    console.error("\n❌ 演示中发生错误:", error);
    process.exit(1);
  }

  console.log("\n║ ✅ 演示完成！");
  process.exit(0);
}

// 运行演示
main().catch(console.error);
