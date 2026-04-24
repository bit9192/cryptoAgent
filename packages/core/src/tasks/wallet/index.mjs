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

  return {
    ok: Boolean(unlocked?.ok),
    action: "wallet.unlock",
    selected: {
      shortName: selected.shortName,
      rel: selected.rel,
      abs: selected.abs,
    },
    totalUnlocked: Number(unlocked?.totalUnlocked ?? entries.length ?? 0),
    warnings: asArray(unlocked?.warnings),
    data: snapshotSession(session),
  };
}

async function clearCache(ctx) {
  const session = clearSession("default");
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

export const walletSessionActionObject = Object.freeze({
  "wallet.unlock": {
    taskId: WALLET_SESSION_TASK_ID,
    sub: "unlock",
    usage: "wallet unlock",
    description: "固定解锁流程：选择钱包 -> 输入密码 -> 解锁",
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
      properties: {},
    },
    handler: async () => {
      const session = getDefaultSession();
      const snap = snapshotSession(session);
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
    },
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
