#!/usr/bin/env node
/**
 * cli/assets.mjs  —  Assets CLI
 *
 * 用法：
 *   pnpm assets status
 *   pnpm assets query --items "0xabc:0xtoken:eth" [--items ...]
 *   pnpm assets query --items '{"address":"0xabc","token":"0xtoken","network":"eth"}' [--items ...]
 *
 * --items 可重复传递，每个 item 格式：
 *   字符串: "address:token:network"
 *   JSON 对象: '{"address":"...","token":"...","network":"..."}'
 */

import { task } from "../tasks/assets/index.mjs";
import { parseCliCommand, askText } from "./ui.mjs";

function printUsage() {
  console.log("Usage:");
  console.log("  pnpm assets status");
  console.log("  pnpm assets query --items <address:token:network> [--items <address:token:network> ...]");
  console.log("  pnpm assets query --items '{\"address\":\"0xabc\",\"token\":\"0xtoken\",\"network\":\"eth\"}'");
  console.log();
  console.log("Examples:");
  console.log('  pnpm assets query --items "0xabc:0xtoken-usdt:eth"');
  console.log('  pnpm assets query --items "0xabc:0xtoken-usdt:eth" --items "0xabc:0xtoken-dai:bsc"');
  console.log('  pnpm assets query --items "TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t:"');
  console.log('  pnpm assets query --items "1ABC:ordi:mainnet"   # BTC brc20');
}

/**
 * 解析 --items 参数，支持：
 *   - 字符串 "address:token:network"
 *   - JSON 字符串 '{"address":"...","token":"...","network":"..."}'
 */
function parseItemsArg(rawItems) {
  const list = Array.isArray(rawItems)
    ? rawItems
    : rawItems !== undefined
      ? [rawItems]
      : [];

  return list.map((raw) => {
    const s = String(raw ?? "").trim();
    if (s.startsWith("{")) {
      try {
        return JSON.parse(s);
      } catch {
        throw new Error(`--items JSON 解析失败: ${s}`);
      }
    }
    return s;
  });
}

async function createInteract() {
  return async function interact({ type, message, fields = [] }) {
    console.log(`\n[interact] ${message ?? type}`);
    const payload = {};
    for (const field of fields) {
      const answer = await askText(`  ${field.label}${field.placeholder ? ` (如: ${field.placeholder})` : ""}`, {
        required: false,
      });
      if (answer) payload[field.name] = answer.trim();
    }
    return { payload };
  };
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const { com, args } = parseCliCommand(argv);

  if (!com || com === "help") {
    printUsage();
    process.exit(0);
  }

  const interact = await createInteract();

  let input;
  if (com === "status") {
    input = { action: "assets.status" };
  } else if (com === "query") {
    const rawItems = args.items;
    if (!rawItems) {
      console.error("错误：--items 为必填参数");
      printUsage();
      process.exit(1);
    }
    const items = parseItemsArg(rawItems);
    const quote = args.quote ? String(args.quote).trim() : "usd";
    input = { action: "assets.query", items, quote };
  } else {
    console.error(`未知命令: ${com}`);
    printUsage();
    process.exit(1);
  }

  const ctx = {
    input: () => input,
    interact,
  };

  let result;
  try {
    result = await task.run(ctx);
  } catch (error) {
    console.error("执行失败:", error.message);
    process.exit(1);
  }

  if (com === "status") {
    console.log("\n=== Assets Status ===");
    console.log("支持链:", result.capabilities?.chains?.join(", ") ?? "-");
    console.log("操作:", result.capabilities?.actions?.join(", ") ?? "-");
    console.log("报价:", result.capabilities?.quote?.join(", ") ?? "-");
    console.log("输入格式:", result.capabilities?.inputFormats?.join(", ") ?? "-");
    return;
  }

  // query 结果
  if (!result.ok) {
    console.error("查询失败:", result.error ?? JSON.stringify(result));
    if (result.unknownAddresses?.length) {
      console.error("无法推断链的地址:", result.unknownAddresses.join(", "));
    }
    process.exit(1);
  }

  if (result.warnings?.length) {
    console.warn("\n[warnings]");
    for (const w of result.warnings) {
      console.warn(`  chain=${w.chain} address=${w.address} token=${w.token} error=${w.error}`);
    }
  }

  const snapshot = result.snapshot;
  console.log(`\n=== Assets Snapshot (${result.quote}) ===`);
  console.log(`总资产: $${snapshot.summary?.totalValueUsd?.toFixed(2) ?? "0.00"} USD`);
  console.log(`共 ${snapshot.items?.length ?? 0} 个持仓`);

  if (snapshot.items?.length > 0) {
    console.log();
    console.table(
      snapshot.items.map((item) => ({
        chain: item.chain,
        network: item.network ?? "-",
        address: item.ownerAddress,
        token: item.tokenAddress,
        symbol: item.symbol ?? "-",
        balance: item.balanceHuman ?? item.balanceRaw?.toString() ?? "0",
        "$valueUsd": item.valueUsd != null ? `$${item.valueUsd.toFixed(2)}` : "-",
      }))
    );
  }

  if (snapshot.risks?.length > 0) {
    console.log("\n[风险标记]");
    console.table(
      snapshot.risks.map((r) => ({
        token: r.tokenAddress,
        level: r.riskLevel,
        score: r.score,
      }))
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
