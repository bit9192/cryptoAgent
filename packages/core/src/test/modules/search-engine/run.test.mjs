/**
 * run.test.mjs — 使用 test.data.md 数据批量测试 searchTask 接口
 *
 * 用法：
 *   node src/test/modules/search-engine/run.test.mjs
 */

import { readFileSync } from "node:fs";
import { searchTask, searchAddressAssetsTask, searchPortfolioTask } from "../../../tasks/search/index.mjs";

// ─── 解析 test.data.md ──────────────────────────────────────────────────────

function parseTestData(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const out = { tokens: [], bsc: [], eth: [], trc20: [], nile: [], addresses: [] };
  let section = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# tokens"))    { section = "tokens";    continue; }
    if (line.startsWith("# addresses")) { section = "addresses"; continue; }
    if (line.startsWith("### bsc old") || line.startsWith("### bsc multi")) { section = ""; continue; }
    if (line.startsWith("### bsc"))     { section = "bsc";       continue; }
    if (line.startsWith("### eth"))     { section = "eth";       continue; }
    if (line.startsWith("### trc20") || line.startsWith("### trc")) { section = "trc20"; continue; }
    if (line.startsWith("### nile"))    { section = "nile";      continue; }
    if (line.startsWith("#"))           { section = "";          continue; }

    const value = line.replace(/^[-*]\s*/, "").trim();
    if (value && section && Array.isArray(out[section])) {
      out[section].push(value);
    }
  }
  return out;
}

// ─── 工具 ───────────────────────────────────────────────────────────────────

function shortAddr(addr) {
  const s = String(addr ?? "");
  return s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

function fmt(r) {
  if (!r.ok) return `FAIL  "${r.error}"`;
  const t = r.candidates[0];
  if (!t) return `ok  (0 candidates)`;
  return `ok  ${t.symbol ?? t.name ?? "-"}  [${t.chain}:${t.network ?? "-"}]  ${t.source ?? ""}`;
}

async function run(label, params) {
  process.stdout.write(`  ${label.padEnd(52)}`);
  const r = await searchTask(params);
  console.log(fmt(r));
}

function pickBalance(asset = {}) {
  const extra = asset?.extra && typeof asset.extra === "object" ? asset.extra : {};
  const valuation = extra?.valuation && typeof extra.valuation === "object" ? extra.valuation : {};
  if (typeof valuation.quantity === "number") return valuation.quantity;
  if (typeof extra.balance === "string" || typeof extra.balance === "number") return Number(extra.balance);
  return 0;
}

// ─── 主流程 ─────────────────────────────────────────────────────────────────

async function main() {
  const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
  const d = parseTestData(raw);

  // ── 1. Token 名称（EVM 视为 ETH 主网，特殊链单独归类）──────────────────
  console.log("\n=== 1. Token 名称搜索（ETH 主网）===");
  const BTC_SYMBOLS  = new Set(["ordi","sats","rats","btc"]);
  const TRX_SYMBOLS  = new Set(["sun","trx"]);
  for (const token of d.tokens) {
    const sym = token.toLowerCase();
    const network = BTC_SYMBOLS.has(sym) ? "btc"
                  : TRX_SYMBOLS.has(sym) ? "mainnet"
                  : "eth";
    await run(`${token.toUpperCase()} (${network})`, { domain: "token", query: token, network });
  }

  // ── 2. BSC 合约地址 ────────────────────────────────────────────────────
  console.log("\n=== 2. BSC 合约地址搜索 ===");
  for (const addr of d.bsc) {
    await run(shortAddr(addr), { domain: "token", query: addr, network: "bsc" });
  }

  // ── 3. ETH 合约地址 ────────────────────────────────────────────────────
  console.log("\n=== 3. ETH 合约地址搜索 ===");
  for (const addr of d.eth) {
    await run(shortAddr(addr), { domain: "token", query: addr, network: "eth" });
  }

  // ── 4. TRC20 合约地址 ──────────────────────────────────────────────────
  console.log("\n=== 4. TRC20 合约地址搜索（TRX mainnet）===");
  for (const addr of d.trc20) {
    await run(shortAddr(addr), { domain: "token", query: addr, network: "mainnet" });
  }

  // ── 5. 钱包地址 ────────────────────────────────────────────────────────
  console.log("\n=== 5. 钱包地址搜索 ===");
  for (const addr of d.addresses) {
    const isTrx = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
    const isBtc = /^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}/.test(addr) || /^04[0-9a-fA-F]{128}$/.test(addr);
    const network = isTrx ? "mainnet" : isBtc ? "btc" : "eth";
    await run(shortAddr(addr), { domain: "address", query: addr, network, timeoutMs: 15000 });
  }

  // ── 6. 地址资产估值（仅 search 任务层接口）────────────────────────────
  console.log("\n=== 6. 地址资产估值（searchAddressAssetsTask）===");
  for (const addr of d.addresses) {
    const isTrx = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
    const isBtc = /^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}/.test(addr) || /^04[0-9a-fA-F]{128}$/.test(addr);
    const network = isTrx ? "mainnet" : isBtc ? "btc" : "eth";

    process.stdout.write(`  ${shortAddr(addr).padEnd(52)}`);
    const result = await searchAddressAssetsTask({
      query: addr,
      network,
      withPrice: true,
      timeoutMs: 15000,
    });

    if (!result.ok) {
      console.log(`FAIL  \"${result.error}\"`);
      continue;
    }

    console.log(`ok  assets=${result.assets.length}  totalValueUsd=${result.totalValueUsd}`);
    for (const asset of result.assets.slice(0, 3)) {
      const valuation = asset?.extra?.valuation ?? {};
      const quantity = pickBalance(asset);
      console.log(
        `      - ${asset.symbol ?? asset.title ?? "ASSET"}: qty=${quantity} priceUsd=${valuation.priceUsd ?? 0} valueUsd=${valuation.valueUsd ?? 0}`,
      );
    }
  }

  // ── 7. 地址组合汇总（仅 search 任务层接口）────────────────────────────
  console.log("\n=== 7. 地址组合汇总（searchPortfolioTask）===");
  const portfolio = await searchPortfolioTask({
    addresses: d.addresses,
    withPrice: true,
    timeoutMs: 15000,
  });

  if (!portfolio.ok) {
    console.log(`FAIL  \"${portfolio.error}\"`);
  } else {
    console.log(`ok  addresses=${portfolio.addresses.length}  totalValueUsd=${portfolio.totalValueUsd}`);
    for (const [chain, row] of Object.entries(portfolio.byChain || {})) {
      console.log(
        `      - ${chain.toUpperCase()}: addresses=${(row?.addresses || []).length} assets=${(row?.assets || []).length} totalValueUsd=${row?.totalValueUsd ?? 0}`,
      );
    }
    console.log(`      - riskFlags=${Array.isArray(portfolio.riskFlags) ? portfolio.riskFlags.length : 0}`);
  }

  console.log("\n✅ 完成\n");
}

main().catch(console.error);
