import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSearchEngine } from "../../../apps/search/engine.mjs";

function parseTokenCases(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const tokens = [];
  let inTokens = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "# tokens") {
      inTokens = true;
      continue;
    }
    if (!inTokens) continue;
    if (!line) continue;
    if (line.startsWith("### ") || line.startsWith("## ") || line.startsWith("# ")) {
      break;
    }
    tokens.push(line);
  }

  return tokens;
}

function createMockTokenProvider({ id, chain, networks, rows = [] }) {
  return {
    id,
    chain,
    networks,
    capabilities: ["token"],
    async searchToken(input = {}) {
      const query = String(input?.query ?? "").trim();
      if (!query) {
        throw new TypeError("query 不能为空");
      }
      return rows.map((row) => ({
        title: row.title,
        symbol: row.symbol,
        address: row.address,
        chain: row.chain ?? chain,
        network: row.network ?? networks[0],
      }));
    },
  };
}

test("apps/search engine.token.search: 按 chain 分发 token provider", async () => {
  const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
  const tokens = parseTokenCases(raw);
  const query = tokens[0] ?? "usdt";

  const engine = createSearchEngine({
    providers: [
      createMockTokenProvider({
        id: "btc-token-mock",
        chain: "btc",
        networks: ["mainnet", "testnet"],
        rows: [{ title: "ORDI", symbol: "ORDI", address: "ordi" }],
      }),
      createMockTokenProvider({
        id: "evm-token-mock",
        chain: "evm",
        networks: ["eth", "bsc"],
        rows: [{ title: "USDT", symbol: "USDT", address: "0x55d398326f99059ff775485246999027b3197955" }],
      }),
    ],
  });

  const result = await engine.token.search({
    chain: "evm",
    query,
    limit: 20,
  });

  assert.equal(result.ok, true);
  assert.equal(result.domain, "token");
  assert.equal(result.query, query);
  assert.equal(Array.isArray(result.items), true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].chain, "evm");
  assert.equal(result.items[0].providerId, "evm-token-mock");
  assert.equal(result.sourceStats.total, 1);
  assert.equal(result.sourceStats.success, 1);
  assert.equal(result.sourceStats.hit, 1);
});

test("apps/search engine.token.search: 按 network 过滤 provider", async () => {
  const engine = createSearchEngine({
    providers: [
      createMockTokenProvider({
        id: "trx-token-mainnet",
        chain: "trx",
        networks: ["mainnet"],
        rows: [{ title: "SUN", symbol: "SUN", address: "sun" }],
      }),
      createMockTokenProvider({
        id: "trx-token-nile",
        chain: "trx",
        networks: ["nile"],
        rows: [{ title: "USDT", symbol: "USDT", address: "usdt" }],
      }),
    ],
  });

  const result = await engine.token.search({
    chain: "trx",
    network: "nile",
    query: "usdt",
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].providerId, "trx-token-nile");
  assert.equal(result.items[0].network, "nile");
  assert.equal(result.sourceStats.total, 1);
});

test("apps/search engine.token.search: 空 query 抛出 TypeError", async () => {
  const engine = createSearchEngine({
    providers: [
      createMockTokenProvider({
        id: "btc-token-mock",
        chain: "btc",
        networks: ["mainnet"],
        rows: [],
      }),
    ],
  });

  await assert.rejects(
    async () => {
      await engine.token.search({
        query: "  ",
      });
    },
    (error) => {
      assert.equal(error instanceof TypeError, true);
      return true;
    },
  );
});
