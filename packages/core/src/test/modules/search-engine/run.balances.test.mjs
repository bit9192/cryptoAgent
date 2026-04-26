/**
 * run.balances.test.mjs
 *
 * 用法：
 *   node src/test/modules/search-engine/run.balances.test.mjs
 */

import { readFileSync } from "node:fs";

import {
  searchAddressCheckTask,
  searchAddressTokenBalancesBatchTask,
  searchTask,
} from "../../../tasks/search/index.mjs";
import { resolveEvmToken } from "../../../apps/evm/configs/tokens.js";
import { resolveTrxToken } from "../../../apps/trx/config/tokens.js";
import { resolveBtcToken } from "../../../apps/btc/config/tokens.js";

const TRX_SYMBOL_FALLBACKS = Object.freeze({
  mainnet: Object.freeze({
    sun: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
  }),
});

function isTrxAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value ?? "").trim());
}

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

function isBtcAddress(value) {
  const text = String(value ?? "").trim();
  return /^(bc1|1|3)[a-zA-HJ-NP-Z0-9]{6,}/.test(text) || /^04[0-9a-fA-F]{128}$/.test(text);
}

function inferChainByAddress(address) {
  if (isTrxAddress(address)) return "trx";
  if (isBtcAddress(address)) return "btc";
  if (isEvmAddress(address)) return "evm";
  return "";
}

function parseAddressAssetGroups(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const groups = [];
  let inSection = false;
  let current = null;

  function commitCurrent() {
    if (!current) return;
    if (current.symbols.length > 0 && current.addresses.length > 0) {
      groups.push(current);
    }
    current = null;
  }

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith("## address assets test")) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("#")) {
      break;
    }
    if (!inSection || !line) {
      continue;
    }

    const normalized = line.replace(/^[-*]\s*/, "").trim();
    if (!normalized) continue;

    const looksAddress = isTrxAddress(normalized) || isBtcAddress(normalized) || isEvmAddress(normalized);
    if (looksAddress) {
      if (!current) {
        current = { symbols: [], addresses: [] };
      }
      current.addresses.push(normalized);
      continue;
    }

    const symbols = normalized.split(/\s+/).filter(Boolean);
    if (symbols.length > 0) {
      commitCurrent();
      current = { symbols, addresses: [] };
    }
  }

  commitCurrent();
  return groups;
}

function pickNetworksFromAddressCheck(chain, checkResult) {
  const item = Array.isArray(checkResult?.items) ? checkResult.items[0] : null;
  const mains = Array.isArray(item?.mainnetNetworks) ? item.mainnetNetworks.filter(Boolean) : [];
  if (chain === "evm") return mains.length > 0 ? [...new Set(mains)] : ["eth"];
  if (chain === "trx") return [mains[0] || "mainnet"];
  if (chain === "btc") return ["mainnet"];
  return [];
}

async function fallbackResolveBySearch(symbol, network, chain) {
  const result = await searchTask({
    domain: "token",
    query: symbol,
    network,
    timeoutMs: 12000,
  });
  if (!result?.ok) return null;
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  const hit = candidates.find((row) => String(row?.chain ?? "").toLowerCase() === chain);
  if (!hit) return null;
  return String(hit.tokenAddress ?? hit.address ?? "").trim() || null;
}

async function resolveTokenRef(chain, network, symbol) {
  const key = String(symbol ?? "").trim().toLowerCase();
  if (!key) return null;

  if (chain === "evm") {
    if (key === "eth" && network === "eth") return "native";
    if (key === "bnb" && network === "bsc") return "native";
    if (["eth", "bnb"].includes(key)) return null;
    try {
      return resolveEvmToken({ symbol: key, network }).address;
    } catch {
      return await fallbackResolveBySearch(key, network, "evm");
    }
  }

  if (chain === "trx") {
    if (key === "trx") return "native";
    try {
      return resolveTrxToken({ symbol: key, network }).address;
    } catch {
      const fallback = TRX_SYMBOL_FALLBACKS?.[network]?.[key];
      if (fallback) return fallback;
      return await fallbackResolveBySearch(key, network, "trx");
    }
  }

  if (chain === "btc") {
    if (key === "btc") return "native";
    try {
      return resolveBtcToken({ symbol: key, network }).address.toUpperCase();
    } catch {
      return key.toUpperCase();
    }
  }

  return null;
}

function shortAddress(value) {
  const text = String(value ?? "").trim();
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

async function main() {
  const raw = readFileSync(new URL("./test.data.md", import.meta.url), "utf8");
  const groups = parseAddressAssetGroups(raw);

  console.log("🚀 === run.balances: address:token 批量余额 ===\n");
  console.log(`分组数量: ${groups.length}`);

  const pairs = [];
  for (const group of groups) {
    const firstAddress = group.addresses[0] ?? "";
    const chain = inferChainByAddress(firstAddress);
    if (!chain) continue;

    const checkResult = await searchAddressCheckTask({ query: firstAddress });
    const networks = pickNetworksFromAddressCheck(chain, checkResult);

    console.log(`\n组: chain=${chain} symbols=${group.symbols.join(",")} addresses=${group.addresses.length}`);
    console.log(`  · 网络=${networks.join(",")}`);

    for (const network of networks) {
      const resolvedTokens = [];
      for (const symbol of group.symbols) {
        const tokenRef = await resolveTokenRef(chain, network, symbol);
        if (!tokenRef) continue;
        resolvedTokens.push({ symbol, tokenRef });
      }

      console.log(`  · ${network} token映射: ${resolvedTokens.map((x) => `${x.symbol}->${x.tokenRef}`).join(" | ") || "-"}`);

      for (const address of group.addresses) {
        for (const token of resolvedTokens) {
          pairs.push({
            chain,
            network,
            address,
            token: token.tokenRef,
          });
        }
      }
    }
  }

  console.log(`\n批量输入对数: ${pairs.length}`);
  const result = await searchAddressTokenBalancesBatchTask({ pairs });

  if (!result.ok) {
    console.log(`✗ 批量查询失败: ${result.error}`);
    return;
  }

  const items = Array.isArray(result.items) ? result.items : [];
  console.log(`✓ 完成: total=${result.summary?.total ?? items.length} success=${result.summary?.success ?? 0} failed=${result.summary?.failed ?? 0}`);

  for (const row of items.slice(0, 40)) {
    const prefix = row.ok ? "✓" : "✗";
    console.log(`${prefix} ${row.chain}/${row.network} ${shortAddress(row.address)} token=${row.tokenAddress ?? row.token} balance=${row.rawBalance ?? "-"}${row.error ? ` error=${row.error}` : ""}`);
  }

  console.log("\n✅ run.balances 完成\n");
}

main().catch((error) => {
  console.error("❌ run.balances 执行失败:", error);
  process.exit(1);
});
