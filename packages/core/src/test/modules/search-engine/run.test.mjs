/**
 * run.test.mjs — 使用 test.data.md 数据批量测试 searchTask 接口
 *
 * 用法：
 *   node src/test/modules/search-engine/run.test.mjs
 */

import { readFileSync } from "node:fs";
import {
  searchTask,
  searchAddressAssetsTask,
  searchAddressValuationTask,
  searchPortfolioTask,
  searchPortfolioValuationTask,
} from "../../../tasks/search/index.mjs";

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

function trimTrailingZeros(value) {
  const text = String(value ?? "0").trim();
  if (!text.includes(".")) return text;
  return text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
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
  if (typeof extra.balance === "string" || typeof extra.balance === "number") return Number(extra.balance);
  return 0;
}

function pickAssetLabel(asset = {}, chain = "") {
  const extra = asset?.extra && typeof asset.extra === "object" ? asset.extra : {};
  const nestedAsset = extra.asset && typeof extra.asset === "object" ? extra.asset : {};
  const tokenAddress = String(asset.tokenAddress || nestedAsset.address || "").trim();

  if (extra.assetType === "native" || extra.protocol === "native") {
    if (chain === "btc") return "BTC";
    if (chain === "trx") return "TRX";
    if (chain === "evm") return String(asset?.network ?? "").toLowerCase() === "bsc" ? "BNB" : "ETH";
  }

  if (asset.symbol) return String(asset.symbol);
  if (nestedAsset.symbol) return String(nestedAsset.symbol);
  if (extra.ticker) return String(extra.ticker);
  if (tokenAddress) return `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`;
  return String(asset.title ?? "ASSET");
}

// ─── 主流程 ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 === Search Task 全链路测试（analysis 对齐输出）===\n");

  const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
  const d = parseTestData(raw);

  // ── 1. Token 名称（EVM 视为 ETH 主网，特殊链单独归类）──────────────────
  console.log("🔎 === 步骤 A: Token 名称搜索 ===");
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
  console.log("\n🧩 === 步骤 B: BSC 合约地址搜索 ===");
  for (const addr of d.bsc) {
    await run(shortAddr(addr), { domain: "token", query: addr, network: "bsc" });
  }

  // ── 3. ETH 合约地址 ────────────────────────────────────────────────────
  console.log("\n🧩 === 步骤 C: ETH 合约地址搜索 ===");
  for (const addr of d.eth) {
    await run(shortAddr(addr), { domain: "token", query: addr, network: "eth" });
  }

  // ── 4. TRC20 合约地址 ──────────────────────────────────────────────────
  console.log("\n🧩 === 步骤 D: TRC20 合约地址搜索（TRX mainnet）===");
  for (const addr of d.trc20) {
    await run(shortAddr(addr), { domain: "token", query: addr, network: "mainnet" });
  }

  // ── 5. 钱包地址 ────────────────────────────────────────────────────────
  console.log("\n👛 === 步骤 E: 钱包地址搜索 ===");
  for (const addr of d.addresses) {
    const isTrx = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
    const isBtc = /^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}/.test(addr) || /^04[0-9a-fA-F]{128}$/.test(addr);
    const network = isTrx ? "mainnet" : isBtc ? "btc" : "eth";
    await run(shortAddr(addr), { domain: "address", query: addr, network, timeoutMs: 15000 });
  }

  // ── 6. 地址资产列表（仅余额，不包含价格）─────────────────────────────
  console.log("\n📊 === 步骤 F: 地址资产列表（searchAddressAssetsTask，仅余额）===");
  for (const addr of d.addresses) {
    const isTrx = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
    const isBtc = /^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}/.test(addr) || /^04[0-9a-fA-F]{128}$/.test(addr);
    const network = isTrx ? "mainnet" : isBtc ? "btc" : "eth";

    process.stdout.write(`  地址: ${addr}\n`);
    const result = await searchAddressAssetsTask({
      query: addr,
      network,
      timeoutMs: 15000,
    });

    if (!result.ok) {
      console.log(`    ✗ 查询失败: ${result.error}`);
      continue;
    }

    console.log(`    ✓ assets=${result.assets.length}`);
    for (const asset of result.assets.slice(0, 3)) {
      const quantity = pickBalance(asset);
      const chain = String(asset?.chain ?? "").toLowerCase();
      const label = pickAssetLabel(asset, chain);
      console.log(
        `    - ${label}: qty=${trimTrailingZeros(quantity)}`,
      );
    }
  }

  // ── 7. 地址组合汇总（仅余额，不包含价格）─────────────────────────────
  console.log("\n💰 === 地址组合汇总（searchPortfolioTask，仅余额）===");
  const portfolio = await searchPortfolioTask({
    addresses: d.addresses,
    timeoutMs: 15000,
  });

  if (!portfolio.ok) {
    console.log(`FAIL  \"${portfolio.error}\"`);
  } else {
    console.log(`  addresses=${portfolio.addresses.length}`);
    for (const [chain, row] of Object.entries(portfolio.byChain || {})) {
      console.log(
        `  ${chain.toUpperCase()}: assets=${(row?.assets || []).length} addresses=${(row?.addresses || []).length}`,
      );
    }
    if (Array.isArray(portfolio.riskFlags) && portfolio.riskFlags.length > 0) {
      console.log("\n⚠️ === 风险标记 ===");
      for (const item of portfolio.riskFlags) {
        console.log(`  - ${item.chain}/${item.network} ${item.address} ${item.asset}: ${item.reason}`);
      }
    } else {
      console.log("  风险标记: 0");
    }
  }

  // ── 8. 独立估值接口（与资产列表分离）──────────────────────────────────
  console.log("\n💹 === 独立估值接口（searchAddressValuationTask / searchPortfolioValuationTask）===");
  const sampleAddress = d.addresses[0];
  if (sampleAddress) {
    const isTrx = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(sampleAddress);
    const isBtc = /^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}/.test(sampleAddress) || /^04[0-9a-fA-F]{128}$/.test(sampleAddress);
    const network = isTrx ? "mainnet" : isBtc ? "btc" : "eth";
    const singleValuation = await searchAddressValuationTask({
      query: sampleAddress,
      network,
      timeoutMs: 15000,
    });
    if (!singleValuation.ok) {
      console.log(`  地址估值失败: ${singleValuation.error}`);
    } else {
      console.log(`  地址估值: assets=${singleValuation.assets.length} total=${trimTrailingZeros(singleValuation.totalValueUsd)}`);
    }
  }

  const portfolioValuation = await searchPortfolioValuationTask({
    addresses: d.addresses,
    timeoutMs: 15000,
  });
  if (!portfolioValuation.ok) {
    console.log(`  组合估值失败: ${portfolioValuation.error}`);
  } else {
    console.log(`  组合估值: total=${trimTrailingZeros(portfolioValuation.totalValueUsd)} addresses=${portfolioValuation.addresses.length}`);
  }

  console.log("\n✅ 完成\n");
}

main().catch(console.error);
