import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createDefaultSearchEngine } from "../../../apps/search/engine.mjs";

function looksLikeAddress(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/^0x[a-fA-F0-9]{40}$/.test(text)) return true;
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(text)) return true;
  if (/^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}$/.test(text)) return true;
  if (/^04[0-9a-fA-F]{128}$/.test(text)) return true;
  return false;
}

function detectChain(address) {
  const value = String(address ?? "").trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return "evm";
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return "trx";
  if (/^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}$/.test(value) || /^04[0-9a-fA-F]{128}$/.test(value)) return "btc";
  return "unknown";
}

function parseAddressCheckCases(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const happy = [];
  const edge = [];
  const invalid = [];

  let inAddresses = false;
  let inAddressAssets = false;
  let inBtcP2pk = false;
  let inInvalid = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (line === "# addresses") {
      inAddresses = true;
      inAddressAssets = false;
      inBtcP2pk = false;
      inInvalid = false;
      continue;
    }

    if (line.toLowerCase() === "## address assets test") {
      inAddresses = false;
      inAddressAssets = true;
      inBtcP2pk = false;
      inInvalid = false;
      continue;
    }

    if (!line) continue;

    if (inAddresses) {
      if (line.startsWith("## ")) {
        inBtcP2pk = line.toLowerCase() === "## btc p2pk";
        continue;
      }

      if (!looksLikeAddress(line)) continue;
      if (inBtcP2pk) {
        edge.push(line);
      } else {
        happy.push(line);
      }
      continue;
    }

    if (inAddressAssets) {
      if (line.startsWith("## ")) break;

      if (line.startsWith("### ")) {
        inInvalid = line.slice(4).trim().toLowerCase() === "invalid";
        continue;
      }

      if (inInvalid) {
        invalid.push(line);
      }
    }
  }

  return {
    happy,
    edge,
    invalid,
  };
}

test("apps/search engine.addressCheck: happy 地址返回 context，edge 不抛错", async () => {
  const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
  const cases = parseAddressCheckCases(raw);
  const engine = createDefaultSearchEngine();

  const happyRows = cases.happy.slice(0, 6);
  const edgeRows = cases.edge.slice(0, 2);

  assert.equal(happyRows.length > 0, true);

  for (const address of happyRows) {
    const result = await engine.addressCheck({ query: address });

    assert.equal(result.ok, true);
    assert.equal(Array.isArray(result.items), true);
    assert.equal(result.items.length > 0, true);
    assert.equal(result.sourceStats.hit, 1);

    const first = result.items[0];
    assert.equal(first.chain, detectChain(address));
    assert.equal(Array.isArray(first.providerIds), true);
    assert.equal(first.providerIds.length > 0, true);
    assert.equal(Array.isArray(first.networks), true);
    assert.equal(first.networks.length > 0, true);
  }

  for (const address of edgeRows) {
    const result = await engine.addressCheck({ query: address });
    assert.equal(result.ok, true);
    assert.equal(Array.isArray(result.items), true);
  }
});

test("apps/search engine.addressCheck: invalid 地址返回空列表", async () => {
  const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
  const cases = parseAddressCheckCases(raw);
  const engine = createDefaultSearchEngine();

  assert.equal(cases.invalid.length > 0, true);

  for (const query of cases.invalid) {
    const result = await engine.addressCheck({ query });
    assert.equal(result.ok, true);
    assert.deepEqual(result.items, []);
    assert.equal(result.sourceStats.empty, 1);
  }
});

test("apps/search engine.addressCheck: chain 过滤生效", async () => {
  const engine = createDefaultSearchEngine();

  const result = await engine.addressCheck({
    query: "0x63320F728777d332a1F1031019481A94144779fB",
    chain: "evm",
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length > 0, true);
  assert.equal(result.items[0].chain, "evm");
});

test("apps/search engine.addressCheck: network 过滤生效", async () => {
  const engine = createDefaultSearchEngine();

  const hit = await engine.addressCheck({
    query: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
    network: "nile",
  });
  assert.equal(hit.ok, true);
  assert.equal(hit.items.length > 0, true);

  const miss = await engine.addressCheck({
    query: "TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h",
    network: "eth",
  });
  assert.equal(miss.ok, true);
  assert.deepEqual(miss.items, []);
});

test("apps/search engine.addressCheck: 支持 address 字段别名", async () => {
  const engine = createDefaultSearchEngine();

  const result = await engine.addressCheck({
    address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length > 0, true);
  assert.equal(result.items[0].chain, "btc");
});

test("apps/search engine.addressCheck: 空 query 抛出 TypeError", async () => {
  const engine = createDefaultSearchEngine();

  await assert.rejects(
    async () => {
      await engine.addressCheck({ query: "   " });
    },
    (error) => {
      assert.equal(error instanceof TypeError, true);
      return true;
    },
  );
});
