import fs from "node:fs";
import path from "node:path";

import { defineTask } from "../../execute/define-task.mjs";
import { buildActionDispatcher } from "../../execute/action-dispatcher.mjs";
import { walletList } from "../../run/wallet/wallet-list.mjs";
import { unlockWallet } from "../../run/wallet/unlock.mjs";
import { createBtcProvider } from "../../apps/btc/provider.mjs";
import { createEvmProvider } from "../../apps/evm/provider.mjs";
import { createTrxProvider } from "../../apps/trx/provider.mjs";
import {
  clearSession,
  getSession,
  snapshotSession,
  upsertAddress,
  upsertKey,
} from "./session-cache.mjs";
import { buildWalletTree } from "../../modules/wallet-tree/index.mjs";
import {
  clearInputs,
  patchInputs,
  resolveInputs,
  setInputs,
  showInputs,
} from "../../modules/inputs/index.mjs";

const WALLET_SESSION_TASK_ID = "wallet:session";

function ensureWallet(ctx) {
  if (!ctx.wallet) {
    throw new Error("wallet context 不可用");
  }
  return ctx.wallet;
}

function normalizeUnlockedKey(item) {
  return {
    keyId: String(item?.keyId ?? "").trim(),
    keyName: String(item?.name ?? item?.keyName ?? "").trim(),
    source: String(item?.source ?? "").trim() || "file",
    sourceFile: String(item?.sourceFile ?? "").trim() || null,
    status: "unlocked",
  };
}

function normalizeConfiguredAddress(item) {
  return {
    keyId: String(item?.keyId ?? "").trim(),
    chain: String(item?.chain ?? "").trim().toLowerCase(),
    address: String(item?.address ?? "").trim(),
    name: String(item?.name ?? "").trim() || null,
    path: String(item?.path ?? "").trim() || null,
    addressType: String(item?.addressType ?? "").trim() || null,
    sourceType: "configured",
  };
}

function canonicalPath(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const abs = path.resolve(process.cwd(), v);
  try {
    return fs.realpathSync.native(abs);
  } catch {
    return abs;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function listWalletCandidates(ctx) {
  const wallet = ensureWallet(ctx);
  const listed = await walletList();
  const items = asArray(listed?.items);

  let unlockedSourceFiles = new Set();
  try {
    const state = await wallet.listKeys({ enabled: true });
    const unlockedItems = asArray(state?.items)
      .filter((item) => String(item?.status ?? "") === "unlocked")
      .filter((item) => String(item?.source ?? "") !== "dev")
      .map((item) => String(item?.sourceFile ?? "").trim())
      .filter(Boolean);
    unlockedSourceFiles = new Set(
      unlockedItems.flatMap((v) => [v, path.resolve(process.cwd(), v)]),
    );
  } catch {
    // 非关键路径，读取失败时仅不展示已解锁状态
  }

  return items.map((item, idx) => {
    const rel = String(item?.rel ?? "").trim();
    const abs = String(item?.abs ?? "").trim();
    const unlocked = unlockedSourceFiles.has(rel) || unlockedSourceFiles.has(abs);
    return {
      index: idx + 1,
      shortName: String(item?.shortName ?? "").trim(),
      rel,
      abs,
      unlocked,
      label: `${String(item?.shortName ?? "").trim() || rel || abs} ${unlocked ? "(已解锁)" : "(未解锁)"}`,
    };
  });
}

function getDefaultSession() {
  return getSession("default");
}

async function unlockOneToCache(ctx) {
  const wallet = ensureWallet(ctx);
  const session = getDefaultSession();

  const candidates = await listWalletCandidates(ctx);
  if (candidates.length === 0) {
    return {
      ok: false,
      action: "wallet.unlock",
      message: "未发现可解锁的钱包文件",
      data: snapshotSession(session),
    };
  }

  if (typeof ctx.interact !== "function") {
    return {
      ok: false,
      action: "wallet.unlock",
      message: "当前环境不支持交互选择，无法执行固定解锁流程",
      data: snapshotSession(session),
    };
  }

  const choices = candidates.map((item) => ({
    title: `${item.index}. ${item.label}`,
    description: item.rel,
    value: item.abs,
  }));

  const pickedWallet = await ctx.interact({
    type: "wallet.unlock.select",
    message: "请选择要解锁的钱包",
    fields: [
      {
        name: "fileAbs",
        type: "select",
        choices,
        required: true,
      },
    ],
  });
  const walletPayload = pickedWallet?.payload ?? pickedWallet ?? {};
  const pickedAbs = String(walletPayload?.fileAbs ?? "").trim();
  if (!pickedAbs) {
    return {
      ok: false,
      action: "wallet.unlock",
      message: "未选择钱包，取消解锁",
      data: snapshotSession(session),
    };
  }

  const pickedCanonical = canonicalPath(pickedAbs);
  const selected = candidates.find((item) => item.abs === pickedAbs || canonicalPath(item.abs) === pickedCanonical) ?? null;
  if (!selected) {
    return {
      ok: false,
      action: "wallet.unlock",
      message: "选择的钱包不存在或已失效，请重试",
      data: snapshotSession(session),
    };
  }

  const pickedPassword = await ctx.interact({
    type: "wallet.password.input",
    message: "请输入解锁密码",
    fields: [
      {
        name: "password",
        type: "password",
        required: true,
        minLength: 1,
        message: `用于解锁 ${selected.shortName || selected.rel || selected.abs}`,
      },
    ],
  });
  const passwordPayload = pickedPassword?.payload ?? pickedPassword ?? {};
  const password = String(passwordPayload?.password ?? "").trim();

  if (!password) {
    return {
      ok: false,
      action: "wallet.unlock",
      selected: {
        shortName: selected.shortName,
        rel: selected.rel,
      },
      message: "未提供密码，取消解锁",
      data: snapshotSession(session),
    };
  }

  const unlocked = await unlockWallet(wallet, selected.abs, password);
  const entries = Object.values(unlocked?.unlocked ?? {});
  for (const item of entries) {
    const keyId = String(item?.keyId ?? "").trim();
    if (!keyId) continue;
    upsertKey(session, {
      keyId,
      keyName: String(item?.name ?? keyId).trim() || keyId,
      source: String(item?.source ?? "file").trim() || "file",
      sourceFile: String(item?.sourceFile ?? selected.rel ?? selected.abs).trim() || null,
      status: "unlocked",
    });
  }

  let derivedImported = 0;
  let deriveWarnings = [];
  if (typeof wallet.deriveConfiguredAddresses === "function") {
    await ensureDefaultProviders(wallet);
    const derived = await wallet.deriveConfiguredAddresses({ strict: true });
    const items = Array.isArray(derived?.items) ? derived.items : [];

    for (const item of items) {
      const normalized = normalizeConfiguredAddress(item);
      if (!normalized.keyId || !normalized.chain || !normalized.address) continue;
      upsertAddress(session, normalized);
      derivedImported += 1;
    }

    deriveWarnings = Array.isArray(derived?.warnings) ? derived.warnings : [];
  }

  return {
    ok: Boolean(unlocked?.ok),
    action: "wallet.unlock",
    selected: {
      shortName: selected.shortName,
      rel: selected.rel,
      abs: selected.abs,
    },
    totalUnlocked: Number(unlocked?.totalUnlocked ?? entries.length ?? 0),
    derivedImported,
    warnings: [...asArray(unlocked?.warnings), ...deriveWarnings],
    data: snapshotSession(session),
  };
}

async function clearCache(ctx) {
  const session = clearSession("default");
  clearInputs("default", {});
  const wallet = ctx?.wallet;
  if (wallet && typeof wallet.lockAll === "function") {
    await wallet.lockAll();
  }
  return {
    ok: true,
    action: "wallet.clear",
    data: snapshotSession(session),
  };
}

async function ensureDefaultProviders(wallet) {
  if (typeof wallet.registerProvider !== "function") return;
  const defs = [
    createBtcProvider,
    createEvmProvider,
    createTrxProvider,
  ];
  for (const factory of defs) {
    try {
      await wallet.registerProvider({ provider: factory() });
    } catch (err) {
      // provider 已存在时静默忽略，其他错误上报
      if (!String(err?.message ?? "").includes("已存在")) {
        throw err;
      }
    }
  }
}

async function deriveConfiguredToCache(ctx) {
  const wallet = ensureWallet(ctx);
  const session = getDefaultSession();

  await ensureDefaultProviders(wallet);

  const listed = await wallet.listKeys({ enabled: true });
  const keyItems = Array.isArray(listed?.items) ? listed.items : [];

  let syncedKeys = 0;
  for (const item of keyItems) {
    if (String(item?.source ?? "") === "dev") continue;
    if (String(item?.status ?? "") !== "unlocked") continue;

    const keyMeta = normalizeUnlockedKey(item);
    if (!keyMeta.keyId) continue;
    upsertKey(session, keyMeta);
    syncedKeys += 1;
  }

  const result = await wallet.deriveConfiguredAddresses({ strict: true });
  const items = Array.isArray(result?.items) ? result.items : [];

  let imported = 0;
  for (const item of items) {
    const normalized = normalizeConfiguredAddress(item);
    if (!normalized.keyId || !normalized.chain || !normalized.address) continue;
    upsertAddress(session, normalized);
    imported += 1;
  }

  return {
    ok: true,
    action: "wallet.deriveConfigured",
    syncedKeys,
    imported,
    warnings: Array.isArray(result?.warnings) ? result.warnings : [],
    data: snapshotSession(session),
  };
}

async function buildTreeFromSession() {
  const session = getDefaultSession();
  const snap = snapshotSession(session);
  const tree = buildWalletTree({
    keys: snap.keys,
    addresses: snap.addresses,
  });

  return {
    ok: true,
    action: "wallet.tree",
    ...tree,
  };
}

function applyStatusFiltersFromResolvedInput(snap, resolved = {}) {
  const keyId = String(resolved?.keyId ?? "").trim();
  const chain = String(resolved?.chain ?? "").trim().toLowerCase();
  const address = String(resolved?.address ?? "").trim();
  const name = String(resolved?.name ?? "").trim().toLowerCase();

  const addresses = snap.addresses.filter((item) => {
    if (keyId && item.keyId !== keyId) return false;
    if (chain && item.chain !== chain) return false;
    if (address && item.address !== address) return false;
    if (name && String(item.name ?? "").toLowerCase() !== name) return false;
    return true;
  });

  const allowedKeyIds = new Set(addresses.map((item) => item.keyId));
  const keys = keyId
    ? snap.keys.filter((k) => k.keyId === keyId)
    : snap.keys.filter((k) => allowedKeyIds.has(k.keyId));

  return {
    ...snap,
    keys,
    addresses,
    counts: {
      keys: keys.length,
      addresses: addresses.length,
    },
  };
}

async function inputsSet(_ctx, input = {}) {
  const result = setInputs("default", {
    scope: input?.scope,
    data: input?.data,
    ttlMs: input?.ttlMs,
  });
  return {
    ...result,
    action: "wallet.inputs.set",
  };
}

async function inputsShow(_ctx, input = {}) {
  const result = showInputs("default", {
    scope: input?.scope,
  });
  return {
    ...result,
    action: "wallet.inputs.show",
  };
}

async function inputsPatch(_ctx, input = {}) {
  const result = patchInputs("default", {
    scope: input?.scope,
    data: input?.data,
    ttlMs: input?.ttlMs,
  });
  return {
    ...result,
    action: "wallet.inputs.patch",
  };
}

async function inputsResolve(_ctx, input = {}) {
  const result = resolveInputs("default", {
    scope: input?.scope,
    args: input?.args,
    defaults: input?.defaults,
    allowFields: input?.allowFields,
  });
  return {
    ...result,
    action: "wallet.inputs.resolve",
  };
}

async function inputsClear(_ctx, input = {}) {
  const result = clearInputs("default", {
    scope: input?.scope,
  });
  return {
    ...result,
    action: "wallet.inputs.clear",
  };
}

export const walletSessionActionObject = Object.freeze({
  "wallet.unlock": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "unlock",
    usage: "wallet unlock",
    description: "固定解锁流程：选择钱包 -> 输入密码 -> 解锁并自动派生 configured 地址",
    argsSchema: {
      required: [],
      properties: {},
    },
    handler: async (ctx) => await unlockOneToCache(ctx),
  },
  "wallet.clear": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "clear",
    usage: "wallet clear",
    description: "清空钱包会话缓存",
    argsSchema: {
      required: [],
      properties: {},
    },
    handler: async (ctx) => await clearCache(ctx),
  },
  "wallet.deriveConfigured": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "derive",
    usage: "wallet derive",
    description: "从已解锁 key 派生并缓存 configured addresses",
    argsSchema: {
      required: [],
      properties: {},
    },
    handler: async (ctx) => await deriveConfiguredToCache(ctx),
  },
  "wallet.status": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "status",
    usage: "wallet status",
    description: "查看当前缓存中的 key 名称与地址列表",
    argsSchema: {
      required: [],
      properties: {
        useInputs: { type: "boolean" },
        scope: { type: "string" },
      },
    },
    handler: async (_ctx, input) => {
      const session = getDefaultSession();
      const snap = snapshotSession(session);
      const useInputs = Boolean(input?.useInputs);

      if (!useInputs) {
        return {
          ok: true,
          action: "wallet.status",
          keys: snap.keys.map((k) => ({
            keyId: k.keyId,
            keyName: k.keyName,
            source: k.source,
            status: k.status,
          })),
          addresses: snap.addresses.map((a) => ({
            keyId: a.keyId,
            chain: a.chain,
            address: a.address,
            name: a.name,
            addressType: a.addressType,
            path: a.path,
          })),
          counts: snap.counts,
        };
      }

      const scope = String(input?.scope ?? "").trim() || "wallet";
      const resolved = resolveInputs("default", {
        scope,
        allowFields: ["keyId", "chain", "address", "name"],
      });
      const filtered = applyStatusFiltersFromResolvedInput(snap, resolved.resolvedArgs);

      return {
        ok: true,
        action: "wallet.status",
        keys: filtered.keys.map((k) => ({
          keyId: k.keyId,
          keyName: k.keyName,
          source: k.source,
          status: k.status,
        })),
        addresses: filtered.addresses.map((a) => ({
          keyId: a.keyId,
          chain: a.chain,
          address: a.address,
          name: a.name,
          addressType: a.addressType,
          path: a.path,
        })),
        counts: filtered.counts,
        inputScope: scope,
        inputResolved: resolved.resolvedArgs,
      };
    },
  },
  "wallet.tree": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "tree",
    usage: "wallet tree",
    description: "按会话缓存生成最小 wallet tree（account/chain/address）",
    argsSchema: {
      required: [],
      properties: {},
    },
    handler: async () => await buildTreeFromSession(),
  },
  "wallet.inputs.set": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "inputs.set",
    usage: "wallet inputs.set",
    description: "设置会话 inputs 上下文（整块覆盖）",
    argsSchema: {
      required: ["scope", "data"],
      properties: {
        scope: { type: "string" },
        data: { type: "object" },
        ttlMs: { type: "number|integer" },
      },
    },
    handler: async (ctx, input) => await inputsSet(ctx, input),
  },
  "wallet.inputs.show": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "inputs.show",
    usage: "wallet inputs.show",
    description: "查看会话 inputs 上下文",
    argsSchema: {
      required: [],
      properties: {
        scope: { type: "string" },
      },
    },
    handler: async (ctx, input) => await inputsShow(ctx, input),
  },
  "wallet.inputs.patch": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "inputs.patch",
    usage: "wallet inputs.patch",
    description: "局部更新会话 inputs 上下文",
    argsSchema: {
      required: ["scope", "data"],
      properties: {
        scope: { type: "string" },
        data: { type: "object" },
        ttlMs: { type: "number|integer" },
      },
    },
    handler: async (ctx, input) => await inputsPatch(ctx, input),
  },
  "wallet.inputs.resolve": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "inputs.resolve",
    usage: "wallet inputs.resolve",
    description: "按优先级合并 inputs/defaults/args 并输出解析结果",
    argsSchema: {
      required: ["scope"],
      properties: {
        scope: { type: "string" },
        args: { type: "object" },
        defaults: { type: "object" },
        allowFields: { type: "array" },
      },
    },
    handler: async (ctx, input) => await inputsResolve(ctx, input),
  },
  "wallet.inputs.clear": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "inputs.clear",
    usage: "wallet inputs.clear",
    description: "清空会话 inputs 上下文（可按 scope）",
    argsSchema: {
      required: [],
      properties: {
        scope: { type: "string" },
      },
    },
    handler: async (ctx, input) => await inputsClear(ctx, input),
  },
});

export const walletSessionDispatcher = buildActionDispatcher({
  actionObject: walletSessionActionObject,
  actionLabel: "wallet:session action",
});

export const walletSessionActionList = Object.freeze(walletSessionDispatcher.listPublic());
export const walletSessionOperationList = Object.freeze(walletSessionDispatcher.list());

export const task = defineTask({
  id: WALLET_SESSION_TASK_ID,
  title: "Wallet Flow",
  description: "Fixed wallet flows: unlock, clear, derive configured addresses",
  readonly: false,
  requiresConfirm: false,
  sourcePolicy: ["cli", "test", "api", "workflow"],
  tags: ["wallet", "flow"],
  operations: walletSessionActionList.map((item) => ({
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
    },
  },
  async run(ctx) {
    const input = ctx.input();
    const action = String(input?.action ?? "").trim();
    return await walletSessionDispatcher.dispatch(action, ctx, input);
  },
});

export default task;
