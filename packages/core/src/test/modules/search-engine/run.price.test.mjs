/**
 * run.price.test.mjs
 *
 * 用法：
 *   node src/test/modules/search-engine/run.price.test.mjs
 *
 * 读取 test.data.md 中：
 *   ## token price  — 精确价格查询（network:symbol 形式）
 *   ## fuzzy        — 模糊跨链发现（symbol 关键词）
 */

import { readFileSync } from "node:fs";

import {
  searchTokenPriceBatchTask,
  searchTokenFuzzyTask,
} from "../../../tasks/search/index.mjs";

// ─── 解析 ## token price ──────────────────────────────────────────────────────
//
// 格式：
//   btc: ordi sats rats btc
//   trx: trx usdt sun
//   eth: dog cusd armk crv
//   bsc: usdt bnb folk cake
//
// btc/trx → network "mainnet"，eth/bsc → network 原样

const SECTION_NETWORK_ALIAS = Object.freeze({
  trx: "mainnet",
  // btc 保持 "btc" 作为 network，由 SECTION_CHAIN 明确指定 chain
});

// 强制指定 chain，避免 btc/trx 都传 mainnet 时推断错误
const SECTION_CHAIN = Object.freeze({
  btc: "btc",
  trx: "trx",
  eth: "evm",
  bsc: "evm",
});

function parseTokenPriceSection(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const items = [];
  let inSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## token price")) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("#")) break;
    if (!inSection || !line) continue;

    // "btc: ordi sats rats btc"
    const match = line.match(/^([a-zA-Z0-9]+):\s+(.+)$/);
    if (!match) continue;

    const prefix = match[1].toLowerCase();
    const network = SECTION_NETWORK_ALIAS[prefix] ?? prefix;
    const chain = SECTION_CHAIN[prefix] ?? null;
    const symbols = match[2].split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    for (const sym of symbols) {
      items.push({ query: sym, network, ...(chain ? { chain } : {}) });
    }
  }
  return items;
}

// ─── 解析 ## fuzzy ────────────────────────────────────────────────────────────
//
// 格式：
//   fxs, cvx, aave

function parseFuzzySection(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const queries = [];
  let inSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## fuzzy")) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("#")) break;
    if (!inSection || !line) continue;

    const syms = line.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    queries.push(...syms);
  }
  return queries;
}

// ─── 格式化输出 ───────────────────────────────────────────────────────────────

function fmtPrice(row) {
  if (row.priceUsd != null) {
    const p = Number(row.priceUsd);
    return Number.isFinite(p) ? `$${p.toPrecision(6)}` : "$?";
  }
  return "-";
}

function shortAddr(addr) {
  const text = String(addr ?? "").trim();
  if (!text || text === "native") return text || "-";
  if (text.length <= 14) return text;
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");

  const priceItems = parseTokenPriceSection(raw);
  const fuzzyQueries = parseFuzzySection(raw);

  // ── 精确价格查询 ────────────────────────────────────────────────────────────
  console.log("🔍 === run.price: 精确价格查询 ===\n");
  console.log(`输入: ${priceItems.length} 条`);
  for (const it of priceItems) {
    console.log(`  ${it.query}:${it.network}`);
  }

  const priceResult = await searchTokenPriceBatchTask({ items: priceItems });
  const priceRows = Array.isArray(priceResult.items) ? priceResult.items : [];
  const priceOk = priceRows.filter((r) => r.ok).length;

  console.log(`\n结果: ok=${priceResult.ok} total=${priceRows.length} resolved=${priceOk} unresolved=${priceRows.length - priceOk}\n`);

  for (const row of priceRows) {
    const status = row.ok ? "✓" : "✗";
    const price = fmtPrice(row);
    const addr = shortAddr(row.tokenAddress);
    const chain = row.chain ?? "-";
    const src = row.source ?? "-";
    if (row.ok) {
      console.log(`${status} ${row.query}:${row.network}  chain=${chain}  price=${price}  addr=${addr}  src=${src}`);
    } else {
      console.log(`${status} ${row.query}:${row.network}  err=${row.error ?? "unresolved"}`);
    }
  }

  // ── 模糊查询 ────────────────────────────────────────────────────────────────
  if (fuzzyQueries.length > 0) {
    console.log(`\n🔎 === run.price: 模糊跨链发现 ===\n`);
    console.log(`关键词: ${fuzzyQueries.join(", ")}\n`);

    for (const query of fuzzyQueries) {
      const res = await searchTokenFuzzyTask({ query });
      const chains = Object.keys(res.byChain ?? {});
      const total = res.candidates?.length ?? 0;
        console.log(`"${query}" → total=${total} chains=[${chains.join(",")}]`);

      // 批量查询 fuzzy 候选的价格
      const pricedCandidates = res.candidates
        .map((c) => ({
          key: `${(c.chain ?? "").toLowerCase()}|${String(c.network ?? "").toLowerCase()}|${String(c.tokenAddress ?? c.address ?? c.symbol ?? query).toLowerCase()}`,
          query: c.tokenAddress ?? c.address ?? c.symbol ?? query,
          network: c.network ?? "eth",
          chain: c.chain ?? null,
        }))
        .filter((item) => item.chain);
      const priceInputs = pricedCandidates.map(({ query: q, network, chain }) => ({ query: q, network, chain }));
      let fuzzyPriceMap = new Map();
      if (priceInputs.length > 0) {
        try {
          const pr = await searchTokenPriceBatchTask({ items: priceInputs });
          for (let i = 0; i < priceInputs.length; i++) {
            fuzzyPriceMap.set(pricedCandidates[i].key, pr.items?.[i] ?? null);
          }
        } catch { /* 价格查询失败不中断 */ }
      }

      for (const [chain, cands] of Object.entries(res.byChain ?? {})) {
        for (let ci = 0; ci < cands.slice(0, 3).length; ci++) {
          const c = cands[ci];
          const sym = c.symbol ?? c.title ?? c.name ?? "-";
          const addr = shortAddr(c.tokenAddress ?? c.address);
          const net = c.network ?? "-";
          const priceKey = `${String(chain).toLowerCase()}|${String(net).toLowerCase()}|${String(c.tokenAddress ?? c.address ?? c.symbol ?? query).toLowerCase()}`;
          const pr = fuzzyPriceMap.get(priceKey);
          const price = pr?.ok ? fmtPrice(pr) : "-";
          const name = c.name ?? c.title ?? "";
          const nameStr = name && name !== sym ? `  ${name}` : "";
          console.log(`  ${chain}/${net}  ${sym}${nameStr}  ${addr}  price=${price}`);
        }
        if (cands.length > 3) {
          console.log(`  ... 共 ${cands.length} 条`);
        }
      }
    }
  }

  console.log("\n✅ run.price 完成\n");
}

main().catch((err) => {
  console.error("❌ run.price 执行失败:", err);
  process.exit(1);
});
