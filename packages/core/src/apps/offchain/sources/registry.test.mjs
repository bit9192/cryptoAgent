import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { DataSourceRegistry } from "./registry.mjs";
import { DataSourceBase } from "./base.mjs";

/**
 * 模拟数据源用于测试
 */
class MockSource extends DataSourceBase {
  constructor(name, failureRate = 0) {
    super();
    this.name = name;
    this.failureRate = failureRate;
    this.callCount = 0;
    this.metadata = {
      name,
      version: "1.0.0",
      capabilities: ["getPrice", "getChainInfo"],
      cacheTTL: 60000,
    };
  }

  async init(config) {
    console.log(`✓ Mock source "${this.name}" initialized`);
  }

  async healthCheck() {
    // 模拟健康检查
    await new Promise(resolve => setTimeout(resolve, 10));
    if (Math.random() < this.failureRate) {
      throw new Error("Health check failed");
    }
  }

  async getPrice(tokens) {
    this.callCount++;
    // 根据故障率决定是否失败
    if (Math.random() < this.failureRate) {
      throw new Error(`${this.name} failed to get price`);
    }
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
    return tokens.reduce((acc, token) => {
      acc[token] = { usd: Math.random() * 50000 };
      return acc;
    }, {});
  }

  async getChainInfo(chainId) {
    this.callCount++;
    if (Math.random() < this.failureRate) {
      throw new Error(`${this.name} failed to get chain info`);
    }
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
    return {
      chainId,
      name: "Ethereum",
      rpc: [`https://eth-rpc-${this.name}.example.com`],
    };
  }
}

/**
 * 测试套件
 */
describe("DataSourceRegistry", () => {
  let registry;
  let source1;
  let source2;
  let source3;

  before(async () => {
    registry = new DataSourceRegistry({
      healthCheckInterval: 10000,
      logger: console,
    });

    // 创建 3 个模拟源，不同的故障率
    source1 = new MockSource("reliable", 0); // 永不失败
    source2 = new MockSource("occasional", 0.2); // 20% 失败率
    source3 = new MockSource("unreliable", 0.5); // 50% 失败率

    // 注册源
    await registry.register(source1, { priority: 1 });
    await registry.register(source2, { priority: 2 });
    await registry.register(source3, { priority: 3 });

    console.log("\n📊 Registry Setup Complete\n");
  });

  it("should register sources with priorities", () => {
    const sources = registry.listSources();
    assert.strictEqual(sources.length, 3, "Should have 3 registered sources");
    assert.strictEqual(sources[0].name, "reliable", "First source should be reliable");
  });

  it("should query with fallback to second source", async () => {
    const result = await registry.query(
      "getPrice",
      async (source) => source.getPrice(["bitcoin"]),
      { sources: ["reliable", "occasional"] }
    );

    assert.ok(result, "Should return result");
    assert.ok(result.bitcoin, "Should have bitcoin price");
    console.log("✓ Query with fallback succeeded");
  });

  it("should track metrics across queries", async () => {
    // 执行多个查询
    for (let i = 0; i < 5; i++) {
      await registry.query(
        "getPrice",
        async (source) => source.getPrice(["ethereum"]),
        { sources: ["reliable", "occasional"] }
      );
    }

    const metrics = registry.getMetrics();
    assert.ok(metrics.totalRequests >= 5, "Should track requests");
    console.log(`✓ Metrics tracked: ${metrics.totalRequests} requests`);
  });

  it("should perform health check", async () => {
    const health = await registry.healthCheck();

    assert.ok(health.results, "Should return health results");
    assert.strictEqual(health.totalSources, 3, "Should check all sources");
    console.log(`✓ Health check: ${health.healthySources}/3 sources healthy`);
  });

  it("should get source by name", () => {
    const source = registry.getSource("reliable");
    assert.ok(source, "Should find source");
    assert.strictEqual(source.name, "reliable", "Should return correct source");
  });

  it("should find sources by capability", () => {
    const sources = registry.findSourcesForCapability("getPrice");
    assert.ok(sources.length > 0, "Should find sources with capability");
    console.log(`✓ Found ${sources.length} sources with getPrice capability`);
  });

  it("should handle all sources failing", async () => {
    const failOnlyRegistry = new DataSourceRegistry();
    const failSource = new MockSource("always-fail", 1.0); // Always fails
    await failOnlyRegistry.register(failSource);

    try {
      await failOnlyRegistry.query(
        "getPrice",
        async (source) => source.getPrice(["bitcoin"]),
        { sources: ["always-fail"] }
      );
      assert.fail("Should throw when all sources fail");
    } catch (error) {
      assert.ok(error.message.includes("All sources failed"), "Should report failure");
      console.log("✓ Correctly handled all-sources-fail scenario");
    }
  });

  after(async () => {
    registry.stopHealthCheckTimer();
    console.log("\n✅ All tests completed\n");
  });
});

/**
 * 性能测试
 */
describe("Performance", () => {
  let registry;

  before(async () => {
    registry = new DataSourceRegistry();
    const source = new MockSource("perf-test", 0);
    await registry.register(source, { priority: 1 });
  });

  it("should handle 100 concurrent queries", async () => {
    const startTime = Date.now();
    const promises = Array(100)
      .fill(null)
      .map(() =>
        registry.query(
          "getPrice",
          async (source) => source.getPrice(["bitcoin"]),
          { sources: ["perf-test"] }
        )
      );

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    assert.strictEqual(results.length, 100, "Should complete all queries");
    console.log(`✓ 100 concurrent queries completed in ${duration}ms`);
  });

  after(() => {
    registry.stopHealthCheckTimer();
  });
});

/**
 * 故障转移测试
 */
describe("Failover Behavior", () => {
  let registry;
  let reliable;
  let unreliable;

  before(async () => {
    registry = new DataSourceRegistry();
    reliable = new MockSource("source-a", 0);
    unreliable = new MockSource("source-b", 0.8); // 高故障率
    await registry.register(reliable, { priority: 1 });
    await registry.register(unreliable, { priority: 2 });
  });

  it("should prefer primary source", async () => {
    const startCallCount = reliable.callCount;

    // 执行 10 次查询
    for (let i = 0; i < 10; i++) {
      await registry.query(
        "getPrice",
        async (source) => source.getPrice(["bitcoin"]),
        { sources: ["source-a", "source-b"] }
      );
    }

    // 第一个源应该被调用最多次（因为它总是成功的）
    console.log(`✓ Primary source called: ${reliable.callCount - startCallCount} times`);
    assert.ok(reliable.callCount > unreliable.callCount, "Primary should be used more");
  });

  after(() => {
    registry.stopHealthCheckTimer();
  });
});
