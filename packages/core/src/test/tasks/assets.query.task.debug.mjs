import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import task from "../../tasks/assets/index.mjs";
import {
  brc20BalanceBatchGet,
} from "../../apps/btc/brc20.mjs";
import {
  btcBalanceGet,
} from "../../apps/btc/core.mjs";
import {
  queryEvmTokenMetadataBatch,
} from "../../apps/evm/assets/token-metadata.mjs";
import {
  queryEvmTokenBalanceBatch,
} from "../../apps/evm/assets/balance-batch.mjs";
import {
  queryTrxTokenMetadataBatch,
  queryTrxTokenBalanceBatch,
} from "../../apps/trx/trc20.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTDATA_PATH = path.join(__dirname, "assets.query.task.testdata.md");

function inferChainFromAddress(address) {
  const addr = String(address ?? "").trim();
  if (!addr) return null;
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return "trx";
  if (/^(bc1|tb1|1|3|m|n)/.test(addr)) return "btc";
  if (/^0x[0-9a-fA-F]+$/.test(addr)) return "evm";
  return null;
}

function stringify(value) {
  return JSON.stringify(value, (_, current) => (
    typeof current === "bigint" ? current.toString() : current
  ), 2);
}

function unique(items = []) {
  return [...new Set(items)];
}

function normalizeKnownAliases(item) {
  const next = { ...item, notes: [...(item.notes ?? [])] };
  if (next.chain === "evm") {
    const token = String(next.token ?? "").trim().toLowerCase();
    if (token === "bnb" || token === "eth") {
      next.token = "native";
      next.notes.push(`line ${next.line}: normalized ${token} -> native`);
    }
  }
  return next;
}

function parseLine(rawLine, line) {
  const trimmed = String(rawLine ?? "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const [address = "", token = "", network = ""] = trimmed.split(":");
  const item = {
    line,
    raw: trimmed,
    address: address.trim(),
    token: token.trim() || "native",
    network: network.trim(),
    chain: inferChainFromAddress(address),
    notes: [],
  };
  return normalizeKnownAliases(item);
}

async function loadItems() {
  const content = await fs.readFile(TESTDATA_PATH, "utf8");
  return content
    .split(/\r?\n/)
    .map((line, index) => parseLine(line, index + 1))
    .filter(Boolean);
}

function groupByChain(items) {
  return {
    btc: items.filter((item) => item.chain === "btc"),
    evm: items.filter((item) => item.chain === "evm"),
    trx: items.filter((item) => item.chain === "trx"),
    unknown: items.filter((item) => !item.chain),
  };
}

async function runTaskForChain(chain, items) {
  try {
    const result = await task.run({
      input: () => ({
        action: "assets.query",
        items: items.map((item) => ({
          address: item.address,
          token: item.token,
          network: item.network,
        })),
      }),
    });
    return {
      ok: true,
      action: "task",
      chain,
      warnings: result.warnings ?? [],
      itemCount: result.snapshot?.items?.length ?? 0,
      items: result.snapshot?.items ?? [],
    };
  } catch (error) {
    return {
      ok: false,
      action: "task",
      chain,
      error: error?.message ?? String(error),
    };
  }
}

async function debugBtc(items) {
  const grouped = new Map();
  for (const item of items) {
    const network = item.network || (/^(tb1|m|n)/.test(item.address) ? "testnet" : "mainnet");
    if (!grouped.has(network)) grouped.set(network, []);
    grouped.get(network).push(item);
  }

  const results = [];
  for (const [network, group] of grouped) {
    const nativeItems = group.filter((item) => {
      const token = String(item.token ?? "").trim().toLowerCase();
      return token === "btc" || token === "native";
    });
    const brc20Items = group.filter((item) => {
      const token = String(item.token ?? "").trim().toLowerCase();
      return token !== "btc" && token !== "native";
    });

    const current = { network, ok: true };
    try {
      if (nativeItems.length > 0) {
        current.native = await btcBalanceGet({
          addresses: unique(nativeItems.map((item) => item.address)),
        }, network);
      }
      if (brc20Items.length > 0) {
        const batch = brc20Items.map((item) => ({ address: item.address, token: item.token }));
        current.brc20 = await brc20BalanceBatchGet(batch, network);
      }
      results.push(current);
    } catch (error) {
      results.push({ network, ok: false, error: error?.message ?? String(error) });
    }
  }
  return results;
}

async function debugEvm(items) {
  const grouped = new Map();
  for (const item of items) {
    const network = item.network || "unknown";
    if (!grouped.has(network)) grouped.set(network, []);
    grouped.get(network).push(item);
  }

  const results = [];
  for (const [network, group] of grouped) {
    const batch = group.map((item) => ({ address: item.address, token: item.token }));
    const metadataTokens = group
      .map((item) => item.token)
      .filter((token) => String(token).toLowerCase() !== "native")
      .map((token) => ({ token }));
    try {
      const [balances, metadata] = await Promise.all([
        queryEvmTokenBalanceBatch(batch, { network }),
        metadataTokens.length > 0
          ? queryEvmTokenMetadataBatch(metadataTokens, { network })
          : Promise.resolve({ ok: true, items: [] }),
      ]);
      results.push({ network, ok: true, balances, metadata });
    } catch (error) {
      results.push({ network, ok: false, error: error?.message ?? String(error) });
    }
  }
  return results;
}

async function debugTrx(items) {
  const grouped = new Map();
  for (const item of items) {
    const network = item.network || "mainnet";
    if (!grouped.has(network)) grouped.set(network, []);
    grouped.get(network).push(item);
  }

  const results = [];
  for (const [network, group] of grouped) {
    try {
      const balances = await queryTrxTokenBalanceBatch(
        group.map((item) => ({ address: item.address, token: item.token })),
        { network },
      );
      const metadata = await queryTrxTokenMetadataBatch(
        group.map((item) => ({ token: item.token })),
        { network },
      );
      results.push({ network, ok: true, balances, metadata });
    } catch (error) {
      results.push({ network, ok: false, error: error?.message ?? String(error) });
    }
  }
  return results;
}

async function main() {
  const onlyChain = String(process.argv[2] ?? "").trim().toLowerCase() || null;
  const items = await loadItems();
  const grouped = groupByChain(items);

  console.log("[assets.query.debug] testdata:", TESTDATA_PATH);
  if (grouped.unknown.length > 0) {
    console.log("[assets.query.debug] unknown:");
    console.log(stringify(grouped.unknown));
  }

  const chains = ["btc", "evm", "trx"].filter((chain) => !onlyChain || chain === onlyChain);
  for (const chain of chains) {
    const chainItems = grouped[chain];
    console.log(`\n=== ${chain.toUpperCase()} task ===`);
    console.log(stringify(await runTaskForChain(chain, chainItems)));

    console.log(`\n=== ${chain.toUpperCase()} adapter debug ===`);
    if (chain === "btc") {
      console.log(stringify(await debugBtc(chainItems)));
    } else if (chain === "evm") {
      console.log(stringify(await debugEvm(chainItems)));
    } else {
      console.log(stringify(await debugTrx(chainItems)));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});