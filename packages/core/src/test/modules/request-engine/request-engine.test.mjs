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
