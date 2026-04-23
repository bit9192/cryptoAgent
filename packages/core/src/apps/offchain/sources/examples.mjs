/**
 * 使用示例 - 链下数据源管理器
 *
 * 演示如何：
 * 1. 创建数据源
 * 2. 初始化管理器
 * 3. 执行查询（支持容错和缓存）
 * 4. 监控性能
 */

import { OffchainDataSourceManager } from "./index.mjs";
import { CoinGeckoSource } from "./coingecko/index.mjs";
import { ChainListSource } from "./chainlist/index.mjs";

async function example() {
  console.log("🚀 链下数据源管理器示例\n");

  // 1. 创建数据源实例
  const coingecko = new CoinGeckoSource();
  const chainlist = new ChainListSource();

  // 2. 初始化管理器
  const manager = new OffchainDataSourceManager({
    logger: console,
    healthCheckInterval: 30000, // 30 秒检查一次
  });

  await manager.init([coingecko, chainlist]);

  console.log("\n--- 已注册的数据源 ---");
  console.log(manager.listSources());

  // 3. 执行查询
  console.log("\n--- 获取 BTC 和 ETH 价格 ---");
  try {
    const prices = await manager.getPrice(["bitcoin", "ethereum"]);
    console.log(prices);
  } catch (error) {
    console.error("❌ 获取价格失败:", error.message);
  }

  // 4. 从缓存读取（第二次调用会更快）
  console.log("\n--- 从缓存获取价格（第二次调用） ---");
  try {
    const prices = await manager.getPrice(["bitcoin", "ethereum"]);
    console.log(prices);
  } catch (error) {
    console.error("❌ 获取价格失败:", error.message);
  }

  // 5. 获取 Token 信息
  console.log("\n--- 获取 Bitcoin Token 信息 ---");
  try {
    const tokenInfo = await manager.getTokenInfo("bitcoin");
    console.log(tokenInfo);
  } catch (error) {
    console.error("❌ 获取 Token 信息失败:", error.message);
  }

  // 6. 获取链信息
  console.log("\n--- 获取以太坊链信息 ---");
  try {
    const chainInfo = await manager.getChainInfo(1);
    console.log(chainInfo);
  } catch (error) {
    console.error("❌ 获取链信息失败:", error.message);
  }

  // 7. 健康检查
  console.log("\n--- 执行健康检查 ---");
  try {
    const health = await manager.getHealthStatus();
    console.log(health);
  } catch (error) {
    console.error("❌ 健康检查失败:", error.message);
  }

  // 8. 获取指标
  console.log("\n--- 性能指标 ---");
  console.log(manager.getMetrics());

  // 9. 清理资源
  await manager.shutdown();
}

// 运行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  example().catch(console.error);
}

export { example };
