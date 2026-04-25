import test from "node:test";
import assert from "node:assert/strict";

import {
  createRequestEngine,
} from "../../../modules/request-engine/index.mjs";

test("request-engine: 同 requestKey 并发只触发一次 fetcher", async () => {
  let calls = 0;
  const engine = createRequestEngine();

  const fetcher = async () => {
    calls += 1;
    return { ok: true, value: 42 };
  };

  const [a, b, c] = await Promise.all([
    engine.fetchShared({ requestKey: "price:ordi", fetcher }),
    engine.fetchShared({ requestKey: "price:ordi", fetcher }),
    engine.fetchShared({ requestKey: "price:ordi", fetcher }),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);

  const stats = engine.getStats();
  assert.equal(stats.fetchCount, 1);
  assert.equal(stats.inFlightJoinCount, 2);
});

test("request-engine: fanout 后第二链命中 chain cache", async () => {
  let calls = 0;
  const engine = createRequestEngine();

  const fetcher = async () => {
    calls += 1;
    return {
      chains: {
        "token:ordi:btc": { chain: "btc", priceUsd: 4.5 },
        "token:ordi:evm": { chain: "evm", priceUsd: 4.6 },
      },
      privateKey: "PRIVATE_KEY_PLACEHOLDER",
    };
  };

  const fanout = (response) => response.chains;

  const btc = await engine.getChainSlice({
    requestKey: "token:ordi:all",
    chainKey: "token:ordi:btc",
    fetcher,
    fanout,
  });
  const evm = await engine.getChainSlice({
    requestKey: "token:ordi:all",
    chainKey: "token:ordi:evm",
    fetcher,
    fanout,
  });

  assert.equal(calls, 1);
  assert.equal(btc.chain, "btc");
  assert.equal(evm.chain, "evm");

  const stats = engine.getStats();
  assert.equal(stats.chainCacheHitCount, 2);
  assert.equal(stats.fanoutWriteCount, 2);
});

test("request-engine: TTL 过期后会重新触发 fetcher", async () => {
  let now = 1_000;
  let calls = 0;
  const engine = createRequestEngine({ now: () => now });

  const fetcher = async () => {
    calls += 1;
    return { value: calls };
  };

  const first = await engine.fetchShared({
    requestKey: "ttl:key",
    fetcher,
    ttlMs: 1_000,
  });
  assert.equal(first.value, 1);

  now = 2_500;
  const second = await engine.fetchShared({
    requestKey: "ttl:key",
    fetcher,
    ttlMs: 1_000,
  });
  assert.equal(second.value, 2);
  assert.equal(calls, 2);
});

test("request-engine: invalid 入参会抛错", async () => {
  const engine = createRequestEngine();

  await assert.rejects(
    () => engine.fetchShared({ fetcher: async () => ({}) }),
    /requestKey/,
  );

  await assert.rejects(
    () => engine.fetchShared({ requestKey: "k", fetcher: 123 }),
    /fetcher/,
  );

  await assert.rejects(
    () => engine.getChainSlice({
      requestKey: "k",
      fetcher: async () => ({}),
      fanout: () => ({}),
    }),
    /chainKey/,
  );
});

test("request-engine: 安全输出不泄露缓存原文", async () => {
  const engine = createRequestEngine();

  await engine.fetchShared({
    requestKey: "secret:key",
    fetcher: async () => ({
      privateKey: "PRIVATE_KEY_PLACEHOLDER",
      secret: "SECRET_PLACEHOLDER",
    }),
  });

  const stats = engine.getStats();
  const raw = JSON.stringify(stats);

  assert(!raw.includes("PRIVATE_KEY_PLACEHOLDER"));
  assert(!raw.includes("SECRET_PLACEHOLDER"));

  const ack = engine.invalidate({ requestKey: "secret:key" });
  assert.equal(typeof ack.requestDeleted, "boolean");
  assert.equal(typeof ack.chainDeleted, "boolean");
});

test("request-engine: requestTTL 与 chainTTL 独立生效", async () => {
  let now = 1_000;
  let calls = 0;
  const engine = createRequestEngine({ now: () => now });

  const fetcher = async () => {
    calls += 1;
    return {
      chains: {
        "asset:ordi:btc": { chain: "btc", v: calls },
      },
    };
  };

  const fanout = (response) => response.chains;

  const first = await engine.getChainSlice({
    requestKey: "asset:ordi:all",
    chainKey: "asset:ordi:btc",
    fetcher,
    fanout,
    ttlPolicy: {
      requestTtlMs: 500,
      chainTtlMs: 2_000,
    },
  });
  assert.equal(first.v, 1);
  assert.equal(calls, 1);

  now = 1_700;
  const second = await engine.getChainSlice({
    requestKey: "asset:ordi:all",
    chainKey: "asset:ordi:btc",
    fetcher,
    fanout,
    ttlPolicy: {
      requestTtlMs: 500,
      chainTtlMs: 2_000,
    },
  });

  // request cache 已过期，但 chain cache 仍有效，不应重新 fetch
  assert.equal(second.v, 1);
  assert.equal(calls, 1);
});

test("request-engine: invalidate 支持 requestPrefix 批量失效", async () => {
  let calls = 0;
  const engine = createRequestEngine();

  const fetcher = async () => {
    calls += 1;
    return { v: calls };
  };

  await engine.fetchShared({ requestKey: "price:ordi", fetcher });
  await engine.fetchShared({ requestKey: "price:btc", fetcher });
  await engine.fetchShared({ requestKey: "balance:btc", fetcher });
  assert.equal(calls, 3);

  const ack = engine.invalidate({ requestPrefix: "price:" });
  assert.equal(ack.requestDeletedCount, 2);
  assert.equal(ack.chainDeletedCount, 0);

  await engine.fetchShared({ requestKey: "price:ordi", fetcher });
  await engine.fetchShared({ requestKey: "balance:btc", fetcher });

  // price:ordi 被失效后重拉 + balance:btc 仍命中
  assert.equal(calls, 4);
});

test("request-engine: invalidate 支持 chainPrefix 批量失效", async () => {
  let calls = 0;
  const engine = createRequestEngine();

  const fetcher = async () => {
    calls += 1;
    return {
      chains: {
        "token:ordi:btc": { chain: "btc", v: calls },
        "token:ordi:evm": { chain: "evm", v: calls },
        "token:btc:btc": { chain: "btc", v: calls },
      },
    };
  };

  const fanout = (response) => response.chains;

  await engine.getChainSlice({
    requestKey: "token:all",
    chainKey: "token:ordi:btc",
    fetcher,
    fanout,
  });

  const ack = engine.invalidate({ chainPrefix: "token:ordi:" });
  assert.equal(ack.requestDeletedCount, 0);
  assert.equal(ack.chainDeletedCount, 2);

  // ordi 被清掉，btc 保留
  const kept = await engine.getChainSlice({
    requestKey: "token:all",
    chainKey: "token:btc:btc",
    fetcher,
    fanout,
  });
  assert.equal(kept.chain, "btc");

  const dropped = await engine.getChainSlice({
    requestKey: "token:all",
    chainKey: "token:ordi:evm",
    fetcher,
    fanout,
  });
  assert.equal(dropped.chain, "evm");
});

test("request-engine: invalid 的 prefix 入参会抛错", async () => {
  const engine = createRequestEngine();

  assert.throws(
    () => engine.invalidate({ requestPrefix: 123 }),
    /requestPrefix/,
  );

  assert.throws(
    () => engine.invalidate({ chainPrefix: "" }),
    /chainPrefix/,
  );
});
