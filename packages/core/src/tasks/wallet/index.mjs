import { defineTask } from "../../execute/define-task.mjs";
import {
  clearSession,
  getSession,
  removeAddress,
  snapshotSession,
  upsertAddress,
  upsertKey,
} from "./session-cache.mjs";

function ensureWallet(ctx) {
  if (!ctx.wallet) {
    throw new Error("wallet context 不可用");
  }
  return ctx.wallet;
}

function normalizeKeyMeta(item) {
  return {
    keyId: String(item?.keyId ?? "").trim(),
    keyName: String(item?.name ?? item?.keyName ?? "").trim(),
    source: String(item?.source ?? "").trim() || "file",
    sourceFile: String(item?.sourceFile ?? "").trim() || null,
    status: String(item?.status ?? "").trim() || "unknown",
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

async function syncUnlocked(ctx, input) {
  const wallet = ensureWallet(ctx);
  const session = getSession(input.sessionId);

  const listed = await wallet.listKeys({ enabled: true });
  const items = Array.isArray(listed?.items) ? listed.items : [];

  let upserts = 0;
  for (const item of items) {
    if (String(item?.source ?? "") === "dev") continue;
    if (String(item?.status ?? "") !== "unlocked") continue;

    const keyMeta = normalizeKeyMeta(item);
    if (!keyMeta.keyId) continue;
    upsertKey(session, keyMeta);
    upserts += 1;
  }

  return {
    ok: true,
    action: "cache.syncUnlocked",
    upserts,
    data: snapshotSession(session),
  };
}

async function importConfigured(ctx, input) {
  const wallet = ensureWallet(ctx);
  const session = getSession(input.sessionId);

  const result = await wallet.deriveConfiguredAddresses({ strict: Boolean(input.strict) });
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
    action: "cache.importConfigured",
    imported,
    warnings: Array.isArray(result?.warnings) ? result.warnings : [],
    data: snapshotSession(session),
  };
}

function listCache(input) {
  const session = getSession(input.sessionId);
  return {
    ok: true,
    action: "cache.list",
    data: snapshotSession(session),
  };
}

function clearCache(input) {
  const session = clearSession(input.sessionId);
  return {
    ok: true,
    action: "cache.clear",
    data: snapshotSession(session),
  };
}

function removeFromCache(input) {
  const session = getSession(input.sessionId);
  const removed = removeAddress(session, {
    keyId: input.keyId,
    name: input.name,
    address: input.address,
    chain: input.chain,
  });
  return {
    ok: true,
    action: "cache.remove",
    removed: removed.removed,
    data: snapshotSession(session),
  };
}

export const task = defineTask({
  id: "wallet:session",
  title: "Wallet Session Cache",
  description: "Manage wallet session cache via reusable task actions",
  readonly: false,
  requiresConfirm: false,
  sourcePolicy: ["cli", "test", "api", "workflow"],
  tags: ["wallet", "cache", "session"],
  inputSchema: {
    required: ["action"],
    properties: {
      action: { type: "string" },
      sessionId: { type: "string" },
      strict: { type: "boolean" },
      keyId: { type: "string" },
      name: { type: "string" },
      address: { type: "string" },
      chain: { type: "string" },
    },
  },
  async run(ctx) {
    const input = ctx.input();
    const action = String(input?.action ?? "").trim();

    if (action === "cache.list") return listCache(input);
    if (action === "cache.clear") return clearCache(input);
    if (action === "cache.syncUnlocked") return await syncUnlocked(ctx, input);
    if (action === "cache.importConfigured") return await importConfigured(ctx, input);
    if (action === "cache.remove") return removeFromCache(input);

    throw new Error(`不支持的 wallet:session action: ${action}`);
  },
});

export default task;
