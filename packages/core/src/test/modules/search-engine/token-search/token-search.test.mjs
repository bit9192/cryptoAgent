import test from "node:test";
import assert from "node:assert/strict";

import {
  createSearchEngine,
  createTokenSearchEngine,
} from "../../../../modules/search-engine/index.mjs";

test("token-search: happy path 聚合跨链候选并输出 sourceStats", async () => {
  const engine = createTokenSearchEngine({
    providers: [
      {
        id: "btc-local",
        chain: "btc",
        networks: ["mainnet"],
        capabilities: ["token"],
        async search() {
          return [{
            chain: "btc",
            network: "mainnet",
            tokenAddress: "ordi",
            symbol: "ORDI",
            name: "Ordinals",
            confidence: 0.95,
            source: "provider",
          }];
        },
      },
      {
        id: "evm-local",
        chain: "evm",
        networks: ["eth"],
        capabilities: ["token"],
        async search() {
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: "0x1234567890123456789012345678901234567890",
            symbol: "ORDI",
            name: "Ordinals (EVM)",
            confidence: 0.9,
            source: "provider",
          }];
        },
      },
    ],
  });

  const res = await engine.search({ query: "ordi", kind: "symbol" });

  assert.equal(res.ok, true);
  assert.equal(res.queryKind, "symbol");
  assert.equal(res.candidates.length, 2);
  assert.equal(res.sourceStats.total, 2);
  assert.equal(res.sourceStats.success, 2);
  assert.equal(res.sourceStats.failed, 0);
  for (const row of res.candidates) {
    assert.ok(typeof row.chain === "string" && row.chain.length > 0);
    assert.ok(typeof row.network === "string" && row.network.length > 0);
    assert.ok(typeof row.source === "string" && row.source.length > 0);
    assert.ok(typeof row.confidence === "number");
  }
});

test("token-search: edge 去重同链同地址候选", async () => {
  const engine = createTokenSearchEngine({
    providers: [
      {
        id: "p1",
        chain: "evm",
        networks: ["eth"],
        capabilities: ["token"],
        async search() {
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
            symbol: "AAVE",
            name: "Aave",
            confidence: 0.9,
          }];
        },
      },
      {
        id: "p2",
        chain: "evm",
        networks: ["eth"],
        capabilities: ["token"],
        async search() {
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
            symbol: "AAVE",
            name: "Aave",
            confidence: 0.8,
          }];
        },
      },
    ],
  });

  const res = await engine.search({ query: "aave", kind: "symbol" });
  assert.equal(res.ok, true);
  assert.equal(res.candidates.length, 1);
});

test("token-search: edge limit 生效", async () => {
  const engine = createTokenSearchEngine({
    providers: [
      {
        id: "p1",
        chain: "btc",
        networks: ["mainnet"],
        capabilities: ["token"],
        async search() {
          return [
            {
              chain: "btc",
              network: "mainnet",
              tokenAddress: "ordi",
              symbol: "ORDI",
              name: "Ordinals",
              confidence: 0.95,
            },
            {
              chain: "btc",
              network: "mainnet",
              tokenAddress: "sats",
              symbol: "SATS",
              name: "SATS",
              confidence: 0.7,
            },
          ];
        },
      },
      {
        id: "p2",
        chain: "evm",
        networks: ["eth"],
        capabilities: ["token"],
        async search() {
          return [{
            chain: "evm",
            network: "eth",
            tokenAddress: "0x1234567890123456789012345678901234567890",
            symbol: "ORDI",
            name: "Ordinals (EVM)",
            confidence: 0.8,
          }];
        },
      },
    ],
  });

  const res = await engine.search({ query: "ordi", kind: "symbol", limit: 1 });
  assert.equal(res.ok, true);
  assert.equal(res.candidates.length, 1);
});

test("token-search: invalid 空 query 抛错", async () => {
  const engine = createTokenSearchEngine();
  await assert.rejects(async () => {
    await engine.search({ query: "   " });
  }, /query 必须是非空字符串/);
});

test("token-search: invalid provider 定义抛错", async () => {
  assert.throws(() => {
    createTokenSearchEngine({
      providers: [{ id: "x" }],
    });
  }, /providers\[0\]\.(chain|networks) 必须/);
});

test("token-search: security provider 错误不泄露敏感信息", async () => {
  const engine = createTokenSearchEngine({
    providers: [
      {
        id: "p1",
        chain: "evm",
        networks: ["eth"],
        capabilities: ["token"],
        async search() {
          throw new Error("PRIVATE_KEY_PLACEHOLDER");
        },
      },
    ],
  });

  const res = await engine.search({ query: "aave", kind: "symbol" });
  const raw = JSON.stringify(res);
  assert.equal(res.ok, true);
  assert.equal(res.sourceStats.failed, 1);
  assert.equal(raw.includes("PRIVATE_KEY_PLACEHOLDER"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(res.sourceStats, "errors"), false);
});

test("search-engine: registerProvider 后可立即搜索", async () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  engine.registerProvider({
    id: "sol-provider",
    chain: "sol",
    networks: ["mainnet"],
    capabilities: ["token"],
    async searchToken(input) {
      if (String(input.query).toLowerCase() !== "bonk") return [];
      return [{
        chain: "sol",
        network: "mainnet",
        tokenAddress: "dezxaz8z7pnrnzzkpjnnedj9zjrmz6eqf4jyehkyx7s",
        symbol: "BONK",
        name: "Bonk",
        confidence: 0.9,
      }];
    },
  });

  const res = await engine.search({
    domain: "token",
    query: "bonk",
    chain: "sol",
    network: "mainnet",
  });

  assert.equal(res.ok, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].chain, "sol");
  assert.equal(res.items[0].symbol, "BONK");
});

test("search-engine: listProviders 支持 domain/chain/network 过滤", () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  engine.registerProvider({
    id: "evm-token",
    chain: "evm",
    networks: ["eth", "bsc"],
    capabilities: ["token"],
    async searchToken() {
      return [];
    },
  });
  engine.registerProvider({
    id: "evm-contract",
    chain: "evm",
    networks: ["eth"],
    capabilities: ["contract"],
    async searchContract() {
      return [];
    },
  });

  assert.equal(engine.listProviders({ domain: "token" }).length, 1);
  assert.equal(engine.listProviders({ chain: "evm", network: "bsc" }).length, 1);
  assert.equal(engine.listProviders({ domain: "contract", network: "eth" }).length, 1);
});

test("search-engine: 重复注册同 id 应抛错", () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  engine.registerProvider({
    id: "dup-id",
    chain: "evm",
    networks: ["eth"],
    capabilities: ["token"],
    async searchToken() {
      return [];
    },
  });

  assert.throws(() => {
    engine.registerProvider({
      id: "dup-id",
      chain: "btc",
      networks: ["mainnet"],
      capabilities: ["token"],
      async searchToken() {
        return [];
      },
    });
  }, /provider 已存在/);
});

test("search-engine: unregisterProvider 后 provider 不再参与搜索", async () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  engine.registerProvider({
    id: "tmp-provider",
    chain: "evm",
    networks: ["eth"],
    capabilities: ["token"],
    async searchToken() {
      return [{
        chain: "evm",
        network: "eth",
        tokenAddress: "0x1234567890123456789012345678901234567890",
        symbol: "TMP",
        name: "Temp",
        confidence: 0.9,
      }];
    },
  });

  const before = await engine.search({ domain: "token", query: "tmp", network: "eth" });
  assert.equal(before.items.length, 1);
  assert.equal(engine.hasProvider("tmp-provider"), true);

  assert.equal(engine.unregisterProvider("tmp-provider"), true);
  assert.equal(engine.hasProvider("tmp-provider"), false);

  const after = await engine.search({ domain: "token", query: "tmp", network: "eth" });
  assert.equal(after.items.length, 0);
});

test("search-engine: 重复相同查询命中 request 缓存", async () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  let called = 0;
  engine.registerProvider({
    id: "cached-provider",
    chain: "evm",
    networks: ["eth"],
    capabilities: ["token"],
    async searchToken() {
      called += 1;
      return [{
        chain: "evm",
        network: "eth",
        tokenAddress: "0x1234567890123456789012345678901234567890",
        symbol: "CACHE",
        name: "Cache Token",
        confidence: 0.9,
      }];
    },
  });

  const first = await engine.search({ domain: "token", query: "cache", network: "eth" });
  const second = await engine.search({ domain: "token", query: "cache", network: "eth" });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(called, 1);
  const stats = engine.getSearchStats();
  assert.ok(stats.requestCacheHitCount >= 1);
});

test("search-engine: 并发相同查询触发 in-flight 合并", async () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  let called = 0;
  engine.registerProvider({
    id: "inflight-provider",
    chain: "evm",
    networks: ["eth"],
    capabilities: ["token"],
    async searchToken() {
      called += 1;
      await Promise.resolve();
      return [{
        chain: "evm",
        network: "eth",
        tokenAddress: "0x1234567890123456789012345678901234567890",
        symbol: "SYNC",
        name: "Sync Token",
        confidence: 0.9,
      }];
    },
  });

  const output = await Promise.all([
    engine.search({ domain: "token", query: "sync", network: "eth" }),
    engine.search({ domain: "token", query: "sync", network: "eth" }),
    engine.search({ domain: "token", query: "sync", network: "eth" }),
  ]);

  assert.equal(output.length, 3);
  assert.equal(called, 1);
  const stats = engine.getSearchStats();
  assert.ok(stats.inFlightJoinCount >= 2);
});

test("search-engine: forceRemote=true 跳过缓存", async () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  let called = 0;
  engine.registerProvider({
    id: "force-provider",
    chain: "evm",
    networks: ["eth"],
    capabilities: ["token"],
    async searchToken() {
      called += 1;
      return [{
        chain: "evm",
        network: "eth",
        tokenAddress: "0x1234567890123456789012345678901234567890",
        symbol: "FORCE",
        name: "Force Token",
        confidence: 0.9,
      }];
    },
  });

  await engine.search({ domain: "token", query: "force", network: "eth" });
  await engine.search({ domain: "token", query: "force", network: "eth", forceRemote: true });

  assert.equal(called, 2);
});

test("token-search: 默认 providers 包含 trx-config 并可命中 usdt", async () => {
  const engine = createTokenSearchEngine();
  const res = await engine.search({ query: "usdt", network: "trx", kind: "symbol" });

  assert.equal(res.ok, true);
  assert.ok(res.candidates.length >= 1);
  assert.equal(res.candidates[0].chain, "trx");
  assert.equal(res.candidates[0].network, "mainnet");
  assert.equal(String(res.candidates[0].symbol).toUpperCase(), "USDT");
});

test("search-engine: 多链排序支持 chainPriority 配置", async () => {
  const engine = createSearchEngine({
    withDefaultProviders: false,
    chainPriority: {
      trx: 30,
      evm: 5,
    },
  });

  engine.registerProvider({
    id: "evm-a",
    chain: "evm",
    networks: ["eth"],
    capabilities: ["token"],
    async searchToken() {
      return [{
        chain: "evm",
        network: "eth",
        tokenAddress: "0x1111111111111111111111111111111111111111",
        symbol: "ABC",
        confidence: 0.7,
      }];
    },
  });

  engine.registerProvider({
    id: "trx-a",
    chain: "trx",
    networks: ["mainnet"],
    capabilities: ["token"],
    async searchToken() {
      return [{
        chain: "trx",
        network: "mainnet",
        tokenAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        symbol: "ABC",
        confidence: 0.7,
      }];
    },
  });

  const res = await engine.search({ domain: "token", query: "abc" });
  assert.equal(res.ok, true);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].chain, "trx");
});

test("search-engine: trade domain 使用统一 SearchItem 协议", async () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  engine.registerProvider({
    id: "trade-mock",
    chain: "evm",
    networks: ["eth"],
    capabilities: ["trade"],
    async searchTrade() {
      return [{
        domain: "trade",
        chain: "evm",
        network: "eth",
        id: "trade:eth:0xabc",
        title: "Swap ETH/USDT",
        address: "0xabc",
        confidence: 0.9,
        txHash: "0xabc",
        routeSummary: "uni-v3",
      }];
    },
  });

  const res = await engine.search({ domain: "trade", query: "0xabc", kind: "txHash" });
  assert.equal(res.ok, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].domain, "trade");
  assert.equal(res.items[0].id, "trade:eth:0xabc");
  assert.equal(res.items[0].address, "0xabc");
  assert.equal(res.items[0].extra.txHash, "0xabc");
});

test("search-engine: contract domain 支持 title/address/extra", async () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  engine.registerProvider({
    id: "contract-mock",
    chain: "evm",
    networks: ["eth"],
    capabilities: ["contract"],
    async searchContract() {
      return [{
        domain: "contract",
        chain: "evm",
        network: "eth",
        address: "0xfeed00000000000000000000000000000000beef",
        name: "Router V3",
        title: "Uniswap Router",
        confidence: 0.88,
        riskLevel: "low",
        tags: ["dex", "router"],
      }];
    },
  });

  const res = await engine.search({ domain: "contract", query: "router" });
  assert.equal(res.ok, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].domain, "contract");
  assert.equal(res.items[0].title, "Uniswap Router");
  assert.equal(res.items[0].address, "0xfeed00000000000000000000000000000000beef");
  assert.equal(res.items[0].extra.riskLevel, "low");
});

test("search-engine: address domain 支持 summary extra", async () => {
  const engine = createSearchEngine({ withDefaultProviders: false });
  engine.registerProvider({
    id: "address-mock",
    chain: "trx",
    networks: ["mainnet"],
    capabilities: ["address"],
    async searchAddress(input) {
      return [{
        domain: "address",
        chain: "trx",
        network: "mainnet",
        address: String(input.query),
        title: "TRX Wallet Summary",
        confidence: 0.91,
        extra: {
          assetCount: 3,
          totalUsd: 125.5,
        },
      }];
    },
  });

  const res = await engine.search({ domain: "address", query: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" });
  assert.equal(res.ok, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].domain, "address");
  assert.equal(res.items[0].title, "TRX Wallet Summary");
  assert.equal(res.items[0].extra.assetCount, 3);
});
