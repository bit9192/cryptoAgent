import { defineTask } from "../../execute/define-task.mjs";
import { buildActionDispatcher } from "../../execute/action-dispatcher.mjs";
import { aggregateAssetSnapshot } from "../../modules/assets-engine/snapshot-aggregate.mjs";
import { getCachedTokenMetadataMap, putCachedTokenMetadata } from "../../modules/assets-engine/token-metadata-cache.mjs";
import { resolveEvmToken } from "../../apps/evm/configs/tokens.js";
import { resolveBtcToken } from "../../apps/btc/config/tokens.js";
import { resolveTrxToken } from "../../apps/trx/config/tokens.js";
import {
  queryEvmTokenMetadataBatch,
} from "../../apps/evm/assets/token-metadata.mjs";
import {
  queryEvmTokenBalanceBatch,
} from "../../apps/evm/assets/balance-batch.mjs";
import {
  brc20BalanceBatchGet,
} from "../../apps/btc/assets/brc20-balance-batch.mjs";
import {
  btcBalanceGet,
} from "../../apps/btc/assets/native-balance.mjs";
import {
  queryTrxTokenMetadataBatch,
} from "../../apps/trx/assets/token-metadata.mjs";
import {
  queryTrxTokenBalanceBatch,
} from "../../apps/trx/assets/balance-batch.mjs";

const TASK_ID = "assets:query";

// ─── Address → chain inference ────────────────────────────────

/**
 * 根据地址形态推断 chain。
 * - TRX: 以 T 开头的 34 位 Base58 地址
 * - BTC: bc1/tb1/1/3/m/n 前缀
 * - EVM: 0x 前缀
 * - 无法判断 → null
 */
function inferChainFromAddress(address) {
  const addr = String(address ?? "").trim();
  if (!addr) return null;
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return "trx";
  if (/^(bc1|tb1|1|3|m|n)/.test(addr)) return "btc";
  if (/^0x[0-9a-fA-F]{0,}$/.test(addr)) return "evm";
  return null;
}

/**
 * 标准化单条 item：接受字符串 "address:token:network" 或对象。
 * 返回 { address, token, network, chain } 内部强类型。
 */
function normalizeQueryItem(raw) {
  let address, token, network;

  if (typeof raw === "string") {
    const parts = raw.split(":");
    address = (parts[0] ?? "").trim();
    token   = (parts[1] ?? "native").trim() || "native";
    network = (parts[2] ?? "").trim();
  } else if (raw && typeof raw === "object") {
    address = String(raw.address ?? "").trim();
    token   = String(raw.token   ?? "native").trim() || "native";
    network = String(raw.network ?? "").trim();
  } else {
    throw new Error(`无效的 query item: ${JSON.stringify(raw)}`);
  }

  if (!address) throw new Error(`query item 缺少 address: ${JSON.stringify(raw)}`);

  const chain = inferChainFromAddress(address);

  return { address, token, network, chain };
}

/**
 * 解析 assets.query 输入中的 items 字段。
 * 支持三元组字符串数组或对象数组，混合均可。
 */
function parseQueryItems(input) {
  const raw = input.items;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("assets.query: items 必须是非空数组，格式为 [{address,token,network}] 或 ['address:token:network']");
  }
  return raw.map((item) => normalizeQueryItem(item));
}

// ─── Utilities ────────────────────────────────────────────────

function unique(items = []) {
  return [...new Set(items)];
}

function uniquePairs(items = []) {
  const seen = new Set();
  const pairs = [];
  for (const item of items) {
    const address = String(item?.address ?? "").trim();
    const token = String(item?.token ?? "").trim();
    const key = `${address.toLowerCase()}::${token.toLowerCase()}`;
    if (!address || !token || seen.has(key)) continue;
    seen.add(key);
    pairs.push({ address, token });
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

function normalizeTokenKey(token) {
  return String(token ?? "").trim().toLowerCase();
}

function toMetadataRowFromConfig(chain, tokenAddress, resolved) {
  return {
    chain,
    tokenAddress: String(tokenAddress ?? resolved?.address ?? "").trim(),
    name: String(resolved?.name ?? "").trim() || null,
    symbol: String(resolved?.symbol ?? "").trim() || null,
    decimals: Number.isFinite(Number(resolved?.decimals)) ? Number(resolved.decimals) : null,
  };
}

function buildEvmConfigMetadataMap(tokens = [], network = null) {
  const map = new Map();
  for (const token of tokens) {
    const key = normalizeTokenKey(token);
    if (!key) continue;
    try {
      const resolved = resolveEvmToken({ network, key: token });
      const row = toMetadataRowFromConfig("evm", resolved?.address ?? token, resolved);
      map.set(key, row);
      if (row.tokenAddress) {
        map.set(normalizeTokenKey(row.tokenAddress), row);
      }
    } catch {
      // 配置中不存在则忽略，交给缓存/RPC
    }
  }
  return map;
}

function buildTrxConfigMetadataMap(tokens = [], network = null) {
  const map = new Map();
  for (const token of tokens) {
    const key = normalizeTokenKey(token);
    if (!key) continue;

    if (key === "native") {
      map.set(key, {
        chain: "trx",
        tokenAddress: "native",
        name: "TRON",
        symbol: "TRX",
        decimals: 6,
      });
      continue;
    }

    try {
      const resolved = resolveTrxToken({ network, key: token });
      const row = toMetadataRowFromConfig("trx", resolved?.address ?? token, resolved);
      map.set(key, row);
      if (row.tokenAddress) {
        map.set(normalizeTokenKey(row.tokenAddress), row);
      }
    } catch {
      // 配置中不存在则忽略，交给缓存/RPC
    }
  }
  return map;
}

function buildBtcConfigMetadataMap(tokens = [], network = null) {
  const map = new Map();
  for (const token of tokens) {
    const key = normalizeTokenKey(token);
    if (!key || key === "native" || key === "btc") continue;
    try {
      const resolved = resolveBtcToken({ network, key: token });
      const row = toMetadataRowFromConfig("btc", resolved?.address ?? token, resolved);
      map.set(key, row);
      if (row.tokenAddress) {
        map.set(normalizeTokenKey(row.tokenAddress), row);
      }
    } catch {
      // 配置中不存在则忽略，交给缓存/余额结果兜底
    }
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
      queryNativeBalance: custom.btc?.queryNativeBalance ?? btcBalanceGet,
      queryBalanceBatch: custom.btc?.queryBalanceBatch ?? brc20BalanceBatchGet,
    },
    trx: {
      queryMetadataBatch: custom.trx?.queryMetadataBatch ?? queryTrxTokenMetadataBatch,
      queryBalanceBatch: custom.trx?.queryBalanceBatch ?? queryTrxTokenBalanceBatch,
    },
  };
}

// ─── Chain-specific snapshot queries ──────────────────────────

/**
 * EVM 查询：items 已归集为同属 evm chain，但可能跨 network（如 eth/bsc）。
 * 按 network 分组，逐组调用 adapters。
 */
async function queryEvmSnapshot(evmItems, adapters, sharedInput = {}) {
  // 按 network 分组
  const byNetwork = new Map();
  for (const item of evmItems) {
    const net = item.network || "default";
    if (!byNetwork.has(net)) byNetwork.set(net, []);
    byNetwork.get(net).push(item);
  }

  const warnings = [];
  const rows = [];

  for (const [network, items] of byNetwork) {
    const pairs = uniquePairs(items);
    const networkHint = network === "default" ? null : network;
    const callInput = { ...sharedInput, network: networkHint };

    const metadataTokens = unique(items.map((item) => item.token)).filter((t) => t.toLowerCase() !== "native");
    const configMeta = buildEvmConfigMetadataMap(metadataTokens, networkHint);
    const missingForConfig = metadataTokens.filter((token) => !configMeta.has(normalizeTokenKey(token)));
    const cachedMeta = await getCachedTokenMetadataMap({
      chain: "evm",
      network: networkHint || "default",
      tokens: missingForConfig,
    });
    const missingForRpc = missingForConfig.filter((token) => !cachedMeta.has(normalizeTokenKey(token)));

    const [balanceRes, metadataRes] = await Promise.all([
      adapters.evm.queryBalanceBatch(pairs, callInput),
      missingForRpc.length > 0
        ? adapters.evm.queryMetadataBatch(missingForRpc.map((token) => ({ token })), callInput)
        : Promise.resolve({ ok: true, items: [] }),
    ]);

    const freshMetaRows = (metadataRes?.items ?? []).filter((row) => {
      const tokenKey = normalizeTokenKey(row?.tokenAddress);
      return tokenKey && row?.ok !== false;
    });
    if (freshMetaRows.length > 0) {
      await putCachedTokenMetadata({
        chain: "evm",
        network: networkHint || "default",
        items: freshMetaRows,
      });
    }

    const meta = metadataMap([
      ...configMeta.values(),
      ...cachedMeta.values(),
      ...freshMetaRows,
    ]);

    for (const item of balanceRes?.items ?? []) {
      if (item?.ok === false) {
        warnings.push({ chain: "evm", network: networkHint, address: item.ownerAddress ?? null, token: item.tokenAddress ?? null, error: item.error ?? "query failed" });
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
        network: networkHint,
        ownerAddress: item.ownerAddress,
        tokenAddress,
        symbol: m.symbol ?? null,
        name: m.name ?? null,
        decimals: Number.isFinite(Number(m.decimals)) ? Number(m.decimals) : 0,
        balanceRaw: typeof item.balance === "bigint" ? item.balance : BigInt(String(item.balance ?? 0)),
      });
    }
  }

  return { rows, warnings };
}

/**
 * BTC 查询：items 已归集为 btc chain，network 可推断（mainnet/testnet）。
 */
async function queryBtcSnapshot(btcItems, adapters, sharedInput = {}) {
  // 按 network 分组（BTC 可从地址前缀推断 network）
  const byNetwork = new Map();
  for (const item of btcItems) {
    let net = item.network;
    if (!net) {
      // 从地址推断 BTC network
      const addr = item.address;
      if (/^(bc1|1|3)/.test(addr)) net = "mainnet";
      else if (/^(tb1|m|n)/.test(addr)) net = "testnet";
      else net = "mainnet";
    }
    if (!byNetwork.has(net)) byNetwork.set(net, []);
    byNetwork.get(net).push(item);
  }

  const warnings = [];
  const rows = [];

  for (const [network, items] of byNetwork) {
    const nativeItems = items.filter((item) => {
      const token = String(item.token ?? "").trim().toLowerCase();
      return token === "btc" || token === "native";
    });
    const brc20Items = items.filter((item) => {
      const token = String(item.token ?? "").trim().toLowerCase();
      return token !== "btc" && token !== "native";
    });

    if (nativeItems.length > 0) {
      try {
        const nativeRes = await adapters.btc.queryNativeBalance({
          addresses: unique(nativeItems.map((item) => item.address)),
        }, network);
        for (const row of nativeRes?.rows ?? []) {
          rows.push({
            chain: "btc",
            network,
            ownerAddress: row.address,
            tokenAddress: "native",
            symbol: "BTC",
            name: "Bitcoin",
            decimals: 8,
            balanceRaw: decimalToRaw(row.total, 8),
          });
        }
      } catch (error) {
        for (const item of nativeItems) {
          warnings.push({ chain: "btc", network, address: item.address ?? null, token: item.token ?? null, error: error?.message ?? String(error) });
        }
      }
    }

    if (brc20Items.length > 0) {
      const pairs = uniquePairs(brc20Items);
      const tokens = unique(brc20Items.map((item) => item.token));
      const configMeta = buildBtcConfigMetadataMap(tokens, network);
      const missingForConfig = tokens.filter((token) => !configMeta.has(normalizeTokenKey(token)));
      const cachedMeta = await getCachedTokenMetadataMap({
        chain: "btc",
        network,
        tokens: missingForConfig,
      });
      const balanceRes = await adapters.btc.queryBalanceBatch(pairs, network);
      const freshMetaRows = [];

      for (const item of balanceRes?.items ?? []) {
        if (item?.ok === false) {
          warnings.push({ chain: "btc", network, address: item.address ?? null, token: item.tokenAddress ?? null, error: item.error ?? "query failed" });
          continue;
        }

        const tokenAddress = String(item.tokenAddress ?? item.token ?? "").trim();
        const tokenKey = normalizeTokenKey(tokenAddress);
        const m = configMeta.get(tokenKey) ?? cachedMeta.get(tokenKey) ?? {};
        const decimals = Number.isFinite(Number(m.decimals))
          ? Number(m.decimals)
          : (Number.isFinite(Number(item.decimals)) ? Number(item.decimals) : 0);

        freshMetaRows.push({
          tokenAddress,
          symbol: m.symbol ?? item.symbol ?? null,
          name: m.name ?? item.tokenName ?? null,
          decimals,
        });

        rows.push({
          chain: "btc",
          network,
          ownerAddress: item.address,
          tokenAddress,
          symbol: m.symbol ?? item.symbol ?? null,
          name: m.name ?? item.tokenName ?? null,
          decimals,
          balanceRaw: decimalToRaw(item.balance, decimals),
        });
      }

      const savableMetaRows = freshMetaRows.filter((row) => {
        const key = normalizeTokenKey(row.tokenAddress);
        return key && (row.symbol || row.name || Number.isFinite(Number(row.decimals)));
      });
      if (savableMetaRows.length > 0) {
        await putCachedTokenMetadata({
          chain: "btc",
          network,
          items: savableMetaRows,
        });
      }
    }
  }

  return { rows, warnings };
}

/**
 * TRX 查询：items 已归集为 trx chain。TRX 单网络，无需按 network 分组。
 */
async function queryTrxSnapshot(trxItems, adapters, sharedInput = {}) {
  const warnings = [];
  const rows = [];

  const byNetwork = new Map();
  for (const item of trxItems) {
    const network = item.network || "mainnet";
    if (!byNetwork.has(network)) byNetwork.set(network, []);
    byNetwork.get(network).push(item);
  }

  for (const [network, items] of byNetwork) {
    const pairs = uniquePairs(items);
    const tokens = unique(items.map((i) => i.token));
    const callInput = { ...sharedInput, network };

    const configMeta = buildTrxConfigMetadataMap(tokens, network);
    const missingForConfig = tokens.filter((token) => !configMeta.has(normalizeTokenKey(token)));
    const cachedMeta = await getCachedTokenMetadataMap({
      chain: "trx",
      network,
      tokens: missingForConfig,
    });
    const missingForRpc = missingForConfig.filter((token) => !cachedMeta.has(normalizeTokenKey(token)));

    const balanceRes = await adapters.trx.queryBalanceBatch(pairs, callInput);
    let metadataRes = { ok: true, items: [] };
    try {
      metadataRes = missingForRpc.length > 0
        ? await adapters.trx.queryMetadataBatch(missingForRpc.map((token) => ({ token })), callInput)
        : { ok: true, items: [] };
    } catch (error) {
      metadataRes = {
        ok: false,
        items: missingForRpc.map((token) => ({
          chain: "trx",
          tokenAddress: token,
          name: null,
          symbol: null,
          decimals: null,
          ok: false,
          error: error?.message ?? String(error),
        })),
      };
    }

    const freshMetaRows = (metadataRes?.items ?? []).filter((row) => {
      const tokenKey = normalizeTokenKey(row?.tokenAddress);
      return tokenKey && row?.ok !== false;
    });
    if (freshMetaRows.length > 0) {
      await putCachedTokenMetadata({
        chain: "trx",
        network,
        items: freshMetaRows,
      });
    }

    const meta = metadataMap([
      ...configMeta.values(),
      ...cachedMeta.values(),
      ...freshMetaRows,
    ]);

    for (const item of metadataRes?.items ?? []) {
      if (item?.ok === false) {
        warnings.push({ chain: "trx", network, address: null, token: item.tokenAddress ?? null, error: item.error ?? "metadata query failed" });
      }
    }

    for (const item of balanceRes?.items ?? []) {
      if (item?.ok === false) {
        warnings.push({ chain: "trx", network, address: item.ownerAddress ?? null, token: item.tokenAddress ?? null, error: item.error ?? "query failed" });
        continue;
      }

      const tokenAddress = String(item.tokenAddress ?? "").trim();
      const m = meta.get(tokenAddress.toLowerCase()) ?? {};
      rows.push({
        chain: "trx",
        network,
        ownerAddress: item.ownerAddress,
        tokenAddress,
        symbol: m.symbol ?? null,
        name: m.name ?? null,
        decimals: Number.isFinite(Number(m.decimals)) ? Number(m.decimals) : 0,
        balanceRaw: typeof item.balance === "bigint" ? item.balance : BigInt(String(item.balance ?? 0)),
      });
    }
  }

  return { rows, warnings };
}

// ─── Task handlers ────────────────────────────────────────────

async function runAssetsStatus() {
  return {
    ok: true,
    action: "assets.status",
    capabilities: {
      chains: ["evm", "btc", "trx"],
      actions: ["assets.status", "assets.query"],
      quote: ["usd"],
      inputFormats: ["triplet-string", "triplet-object"],
    },
  };
}

async function runAssetsQuery(ctx, input = {}) {
  const quote = String(input.quote ?? "usd").trim().toLowerCase() || "usd";
  const adapters = resolveAdapters(ctx);

  // 解析三元组 items
  const items = parseQueryItems(input);

  // 找出 chain 推断失败的 items
  const unknownChainItems = items.filter((i) => !i.chain);
  if (unknownChainItems.length > 0) {
    // 通过 interact 上报给外层补全，task 自身不调 AI
    if (typeof ctx.interact === "function") {
      const filled = await ctx.interact({
        type: "assets.query.missing_chain",
        message: "以下地址无法推断所属链，请补充 chain 信息",
        fields: unknownChainItems.map((i) => ({
          name: `chain_for_${i.address}`,
          type: "select",
          label: `${i.address} 的链`,
          options: ["evm", "btc", "trx"],
        })),
      });
      const payload = filled?.payload ?? filled ?? {};
      for (const item of unknownChainItems) {
        const key = `chain_for_${item.address}`;
        if (payload[key]) item.chain = String(payload[key]).trim().toLowerCase();
      }
    }

    // interact 后仍有未解析的 → 报错
    const stillUnknown = items.filter((i) => !i.chain);
    if (stillUnknown.length > 0) {
      return {
        ok: false,
        action: "assets.query",
        error: "无法推断部分地址的链类型，请在 items 中通过 network 字段显式指定",
        unknownAddresses: stillUnknown.map((i) => i.address),
      };
    }
  }

  // EVM items 缺少 network → interact 补全
  const evmItemsMissingNetwork = items.filter((i) => i.chain === "evm" && !i.network);
  if (evmItemsMissingNetwork.length > 0 && typeof ctx.interact === "function") {
    const filled = await ctx.interact({
      type: "assets.query.missing_network",
      message: "以下 EVM 地址缺少 network，请补充（如 eth/bsc/polygon）",
      fields: evmItemsMissingNetwork.map((i) => ({
        name: `network_for_${i.address}`,
        type: "text",
        label: `${i.address} 的 EVM network`,
        placeholder: "eth",
      })),
    });
    const payload = filled?.payload ?? filled ?? {};
    for (const item of evmItemsMissingNetwork) {
      const key = `network_for_${item.address}`;
      if (payload[key]) item.network = String(payload[key]).trim().toLowerCase();
    }
  }

  // 按 chain 归集
  const evmItems = items.filter((i) => i.chain === "evm");
  const btcItems = items.filter((i) => i.chain === "btc");
  const trxItems = items.filter((i) => i.chain === "trx");

  const sharedInput = { prices: input.prices, risks: input.risks };
  const results = await Promise.all([
    evmItems.length > 0 ? queryEvmSnapshot(evmItems, adapters, sharedInput) : Promise.resolve({ rows: [], warnings: [] }),
    btcItems.length > 0 ? queryBtcSnapshot(btcItems, adapters, sharedInput) : Promise.resolve({ rows: [], warnings: [] }),
    trxItems.length > 0 ? queryTrxSnapshot(trxItems, adapters, sharedInput) : Promise.resolve({ rows: [], warnings: [] }),
  ]);

  const allRows     = results.flatMap((r) => r.rows);
  const allWarnings = results.flatMap((r) => r.warnings);

  const snapshot = aggregateAssetSnapshot({
    balances: allRows,
    prices: Array.isArray(input.prices) ? input.prices : [],
    risks:   Array.isArray(input.risks)  ? input.risks  : [],
  });

  return {
    ok: true,
    action: "assets.query",
    quote,
    warnings: allWarnings,
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
    usage: "assets query --items <address:token:network> [--items ...]",
    description: "Query multi-chain assets by triplet items and build normalized snapshot",
    argsSchema: {
      required: ["items"],
      properties: {
        items: { type: "array", description: "Each item: {address, token, network} or 'address:token:network'" },
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
  description: "Assets orchestrator for multi-chain status/query with triplet-item input and standardized snapshot output",
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
      items:  { type: "array" },
      quote:  { type: "string" },
      prices: { type: "array" },
      risks:  { type: "array" },
    },
  },
  async run(ctx) {
    const input = ctx.input();
    const action = String(input?.action ?? "").trim();
    return await dispatcher.dispatch(action, ctx, input);
  },
});

export default task;
