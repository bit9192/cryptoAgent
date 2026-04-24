import { defineTask } from "../../execute/define-task.mjs";
import { buildActionDispatcher } from "../../execute/action-dispatcher.mjs";
import { aggregateAssetSnapshot } from "../../modules/assets-engine/snapshot-aggregate.mjs";
import {
  queryEvmTokenMetadataBatch,
} from "../../apps/evm/assets/token-metadata.mjs";
import {
  queryEvmTokenBalanceBatch,
} from "../../apps/evm/assets/balance-batch.mjs";
import {
  brc20BalanceBatchGet,
} from "../../apps/btc/brc20.mjs";
import {
  queryTrxTokenMetadataBatch,
  queryTrxTokenBalanceBatch,
} from "../../apps/trx/trc20.mjs";

const TASK_ID = "assets:query";

function normalizeChain(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) throw new Error("chain 不能为空");
  if (["evm", "ethereum"].includes(raw)) return "evm";
  if (["btc", "bitcoin"].includes(raw)) return "btc";
  if (["trx", "tron"].includes(raw)) return "trx";
  throw new Error(`不支持的 chain: ${value}`);
}

function ensureStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} 必须是数组`);
  }
  const list = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  if (list.length === 0) {
    throw new Error(`${label} 不能为空`);
  }
  return list;
}

function unique(items = []) {
  return [...new Set(items)];
}

function cartesianPairs(addresses, tokens) {
  const pairs = [];
  for (const address of addresses) {
    for (const token of tokens) {
      pairs.push({ address, token });
    }
  }
  return pairs;
}

function metadataMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row?.tokenAddress ?? "").trim().toLowerCase();
    if (!key) continue;
    map.set(key, row);
  }
  return map;
}

function decimalToRaw(value, decimals) {
  const scale = Number.isFinite(Number(decimals)) ? Math.max(0, Math.floor(Number(decimals))) : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0n;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`非法 decimal 数字: ${raw}`);
  }

  const sign = raw.startsWith("-") ? -1n : 1n;
  const unsigned = raw.startsWith("-") ? raw.slice(1) : raw;
  const [intPart, fracPart = ""] = unsigned.split(".");
  const frac = fracPart.padEnd(scale, "0").slice(0, scale);
  const digits = `${intPart}${frac}`.replace(/^0+(?=\d)/, "");
  return sign * BigInt(digits || "0");
}

function resolveAdapters(ctx = {}) {
  const custom = ctx.assetsAdapters ?? {};
  return {
    evm: {
      queryMetadataBatch: custom.evm?.queryMetadataBatch ?? queryEvmTokenMetadataBatch,
      queryBalanceBatch: custom.evm?.queryBalanceBatch ?? queryEvmTokenBalanceBatch,
    },
    btc: {
      queryBalanceBatch: custom.btc?.queryBalanceBatch ?? brc20BalanceBatchGet,
    },
    trx: {
      queryMetadataBatch: custom.trx?.queryMetadataBatch ?? queryTrxTokenMetadataBatch,
      queryBalanceBatch: custom.trx?.queryBalanceBatch ?? queryTrxTokenBalanceBatch,
    },
  };
}

async function queryEvmSnapshot(input, adapters) {
  const addresses = unique(ensureStringArray(input.addresses, "addresses"));
  const tokens = unique(ensureStringArray(input.tokens, "tokens"));
  const pairs = cartesianPairs(addresses, tokens);

  const metadataTokens = tokens.filter((token) => token.toLowerCase() !== "native");
  const [balanceRes, metadataRes] = await Promise.all([
    adapters.evm.queryBalanceBatch(pairs, input),
    metadataTokens.length > 0
      ? adapters.evm.queryMetadataBatch(metadataTokens.map((token) => ({ token })), input)
      : Promise.resolve({ ok: true, items: [] }),
  ]);

  const meta = metadataMap(metadataRes?.items ?? []);
  const warnings = [];
  const rows = [];

  for (const item of balanceRes?.items ?? []) {
    if (item?.ok === false) {
      warnings.push({ chain: "evm", address: item.ownerAddress ?? null, token: item.tokenAddress ?? null, error: item.error ?? "query failed" });
      continue;
    }

    const tokenAddress = String(item.tokenAddress ?? "").trim();
    const tokenKey = tokenAddress.toLowerCase();
    const native = tokenKey === "native";
    const m = native
      ? { symbol: "ETH", name: "Ether", decimals: 18 }
      : (meta.get(tokenKey) ?? {});

    rows.push({
      chain: "evm",
      ownerAddress: item.ownerAddress,
      tokenAddress,
      symbol: m.symbol ?? null,
      name: m.name ?? null,
      decimals: Number.isFinite(Number(m.decimals)) ? Number(m.decimals) : 0,
      balanceRaw: typeof item.balance === "bigint" ? item.balance : BigInt(String(item.balance ?? 0)),
    });
  }

  return { rows, warnings };
}

async function queryBtcSnapshot(input, adapters) {
  const addresses = unique(ensureStringArray(input.addresses, "addresses"));
  const tokens = unique(ensureStringArray(input.tokens, "tokens"));
  const pairs = cartesianPairs(addresses, tokens);

  const balanceRes = await adapters.btc.queryBalanceBatch(pairs, input.networkNameOrProvider ?? input.networkName ?? input.network ?? null);

  const warnings = [];
  const rows = [];
  for (const item of balanceRes?.items ?? []) {
    if (item?.ok === false) {
      warnings.push({ chain: "btc", address: item.address ?? null, token: item.tokenAddress ?? null, error: item.error ?? "query failed" });
      continue;
    }

    const decimals = Number.isFinite(Number(item.decimals)) ? Number(item.decimals) : 0;
    rows.push({
      chain: "btc",
      ownerAddress: item.address,
      tokenAddress: item.tokenAddress,
      symbol: item.symbol ?? null,
      name: item.tokenName ?? null,
      decimals,
      balanceRaw: decimalToRaw(item.balance, decimals),
    });
  }

  return { rows, warnings };
}

async function queryTrxSnapshot(input, adapters) {
  const addresses = unique(ensureStringArray(input.addresses, "addresses"));
  const tokens = unique(ensureStringArray(input.tokens, "tokens"));
  const pairs = cartesianPairs(addresses, tokens);

  const [balanceRes, metadataRes] = await Promise.all([
    adapters.trx.queryBalanceBatch(pairs, input),
    adapters.trx.queryMetadataBatch(tokens.map((token) => ({ token })), input),
  ]);

  const meta = metadataMap(metadataRes?.items ?? []);
  const warnings = [];
  const rows = [];

  for (const item of balanceRes?.items ?? []) {
    if (item?.ok === false) {
      warnings.push({ chain: "trx", address: item.ownerAddress ?? null, token: item.tokenAddress ?? null, error: item.error ?? "query failed" });
      continue;
    }

    const tokenAddress = String(item.tokenAddress ?? "").trim();
    const m = meta.get(tokenAddress.toLowerCase()) ?? {};
    rows.push({
      chain: "trx",
      ownerAddress: item.ownerAddress,
      tokenAddress,
      symbol: m.symbol ?? null,
      name: m.name ?? null,
      decimals: Number.isFinite(Number(m.decimals)) ? Number(m.decimals) : 0,
      balanceRaw: typeof item.balance === "bigint" ? item.balance : BigInt(String(item.balance ?? 0)),
    });
  }

  return { rows, warnings };
}

async function runAssetsStatus() {
  return {
    ok: true,
    action: "assets.status",
    capabilities: {
      chains: ["evm", "btc", "trx"],
      actions: ["assets.status", "assets.query"],
      quote: ["usd"],
    },
  };
}

async function runAssetsQuery(ctx, input = {}) {
  const chain = normalizeChain(input.chain);
  const quote = String(input.quote ?? "usd").trim().toLowerCase() || "usd";
  const adapters = resolveAdapters(ctx);

  let queried;
  if (chain === "evm") {
    queried = await queryEvmSnapshot(input, adapters);
  } else if (chain === "btc") {
    queried = await queryBtcSnapshot(input, adapters);
  } else {
    queried = await queryTrxSnapshot(input, adapters);
  }

  const snapshot = aggregateAssetSnapshot({
    balances: queried.rows,
    prices: Array.isArray(input.prices) ? input.prices : [],
    risks: Array.isArray(input.risks) ? input.risks : [],
  });

  return {
    ok: true,
    action: "assets.query",
    chain,
    quote,
    warnings: queried.warnings,
    snapshot,
  };
}

export const actionObject = Object.freeze({
  "assets.status": {
    taskId: TASK_ID,
    sub: "status",
    usage: "assets status",
    description: "Read-only capabilities and support matrix",
    argsSchema: {
      required: [],
      properties: {},
    },
    handler: async () => await runAssetsStatus(),
  },
  "assets.query": {
    taskId: TASK_ID,
    sub: "query",
    usage: "assets query --chain <evm|btc|trx> --addresses [...] --tokens [...]",
    description: "Query single-chain assets and build normalized snapshot",
    argsSchema: {
      required: ["chain", "addresses", "tokens"],
      properties: {
        chain: { type: "string" },
        addresses: { type: "array" },
        tokens: { type: "array" },
        quote: { type: "string" },
        prices: { type: "array" },
        risks: { type: "array" },
      },
    },
    handler: async (ctx, input) => await runAssetsQuery(ctx, input),
  },
});

export const dispatcher = buildActionDispatcher({
  actionObject,
  actionLabel: "assets:query action",
});

export const actionList = Object.freeze(dispatcher.listPublic());
export const operationList = Object.freeze(dispatcher.list());

export const task = defineTask({
  id: TASK_ID,
  title: "Assets Query",
  description: "Assets orchestrator for status/query with standardized snapshot output",
  readonly: false,
  requiresConfirm: false,
  sourcePolicy: ["cli", "test", "api", "workflow"],
  tags: ["assets", "query"],
  operations: actionList.map((item) => ({
    action: item.action,
    sub: item.sub,
    usage: item.usage,
    description: item.description,
    argsSchema: item.argsSchema,
  })),
  inputSchema: {
    required: ["action"],
    properties: {
      action: { type: "string" },
      chain: { type: "string" },
      addresses: { type: "array" },
      tokens: { type: "array" },
      quote: { type: "string" },
      prices: { type: "array" },
      risks: { type: "array" },
    },
  },
  async run(ctx) {
    const input = ctx.input();
    const action = String(input?.action ?? "").trim();
    return await dispatcher.dispatch(action, ctx, input);
  },
});

export default task;
