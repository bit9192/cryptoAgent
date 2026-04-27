
import { retrieveWalletKeyCandidates } from "../modules/wallet-engine/index.mjs";
import { extractData } from "../modules/data-engine/index.mjs";
import { buildWalletTree } from "../modules/wallet-tree/index.mjs";
import walletSessionTask from "../tasks/wallet/index.mjs";

// ─── 工具函数 ───────────────────────────────────────────────

function divider(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📌 ${title}`);
  console.log(`${"─".repeat(60)}\n`);
}

function success(msg) {
  console.log(`✅ ${msg}`);
}

function error(msg) {
  console.log(`❌ ${msg}`);
}

function info(msg) {
  console.log(`ℹ️  ${msg}`);
}

function toJsonSafe(value) {
  return JSON.stringify(
    value,
    (_key, current) => (typeof current === "bigint" ? current.toString() : current),
    2,
  );
}

function resolveDebugName(options = {}) {
  const inputName = String(options?.inputs?.name ?? "").trim();
  if (inputName) return inputName;
  const inputKeyName = String(options?.inputs?.keyName ?? "").trim();
  if (inputKeyName) return inputKeyName;
  return "";
}

async function importWalletStatusToOptions(options = {}) {
  if (options.walletStatus && typeof options.walletStatus === "object") {
    return options.walletStatus;
  }

  if (!options.wallet) {
    const empty = { keys: [], addresses: [] };
    options.walletStatus = empty;
    return empty;
  }

  const inputPayload = { action: "wallet.status", scope: "wallet" };
  const ctx = {
    wallet: options.wallet,
    input: () => inputPayload,
    args: inputPayload,
    log: () => {},
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  try {
    const status = await walletSessionTask.run(ctx);
    const walletStatus = {
      keys: Array.isArray(status?.keys) ? status.keys : [],
      addresses: Array.isArray(status?.addresses) ? status.addresses : [],
      counts: status?.counts ?? null,
      inputScope: status?.inputScope ?? null,
      inputResolved: status?.inputResolved ?? null,
    };
    options.walletStatus = walletStatus;
    return walletStatus;
  } catch (err) {
    const fallback = {
      keys: [],
      addresses: [],
      error: String(err?.message ?? err),
    };
    options.walletStatus = fallback;
    return fallback;
  }
}

function normalizeChainsFromRequest(chains) {
  if (!Array.isArray(chains) || chains.length === 0) {
    return [];
  }

  const normalized = [];
  for (const item of chains) {
    if (typeof item === "string") {
      const chain = String(item).trim().toLowerCase();
      if (chain) {
        normalized.push({ chain, addressTypes: null });
      }
      continue;
    }

    if (item && typeof item === "object") {
      const chain = String(item.chain ?? "").trim().toLowerCase();
      if (!chain) continue;
      const addressTypes = Array.isArray(item.addressTypes)
        ? item.addressTypes.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
        : null;
      normalized.push({ chain, addressTypes });
    }
  }

  return normalized;
}

function mapSelectorSourceToSourceType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "file" || text === "orig") return "orig";
  if (text === "derived" || text === "derive") return "derive";
  return text;
}

function buildWalletTreeRows(walletStatus = {}) {
  const keys = Array.isArray(walletStatus?.keys) ? walletStatus.keys : [];
  const keyStatusMap = new Map(
    keys.map((item) => [String(item?.keyId ?? "").trim(), String(item?.status ?? "").trim() || null]),
  );

  const treeResult = buildWalletTree({
    keys,
    addresses: Array.isArray(walletStatus?.addresses) ? walletStatus.addresses : [],
  });
  const rows = Array.isArray(treeResult?.tree) ? treeResult.tree : [];
  return rows.map((row) => ({
    ...row,
    keyStatus: keyStatusMap.get(String(row?.keyId ?? "").trim()) ?? null,
  }));
}

function hasAnyAddressValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return String(value ?? "").trim().length > 0;
}

function applyChainFilters(rows = [], outputs = {}) {
  const requestedChains = normalizeChainsFromRequest(outputs?.chains);
  if (requestedChains.length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    const addresses = row?.addresses && typeof row.addresses === "object" ? row.addresses : {};
    return requestedChains.some((req) => hasAnyAddressValue(addresses?.[req.chain]));
  });
}

function queryWalletRowsWithDataEngine(rows = [], request = {}) {
  const selectors = request?.selectors ?? request?.keyFilters ?? {};

  const normalizedRows = rows.map((row) => ({
    ...row,
    name: String(row?.name ?? ""),
    nameLower: String(row?.name ?? "").toLowerCase(),
  }));

  // name 两阶段查找：先从 orig 行按 key 名匹配 keyId，再取该 keyId 的全部行
  // 这样 name:"meer" 才能命中 meer key 下所有 derive 地址
  const rawName = String(selectors?.name ?? selectors?.keyName ?? "").trim();
  let candidateRows = normalizedRows;
  if (rawName) {
    const needle = rawName.toLowerCase();
    const nameExact = Boolean(selectors?.nameExact);
    const matchedKeyIds = new Set();
    for (const row of normalizedRows) {
      if (row.sourceType !== "orig") continue;
      const matched = nameExact ? row.nameLower === needle : row.nameLower.includes(needle);
      if (matched) matchedKeyIds.add(row.keyId);
    }
    if (matchedKeyIds.size > 0) {
      candidateRows = normalizedRows.filter((row) => matchedKeyIds.has(row.keyId));
    } else {
      // 没有 orig 行命中时，直接按行名模糊兜底
      candidateRows = normalizedRows.filter((row) => {
        const matched = nameExact ? row.nameLower === needle : row.nameLower.includes(needle);
        return matched;
      });
    }
  }

  // 其余字段用 data-engine 过滤
  const filters = [];
  const keyId = String(selectors?.keyId ?? "").trim();
  if (keyId) filters.push({ field: "keyId", op: "eq", value: keyId });

  const keyType = String(selectors?.keyType ?? "").trim();
  if (keyType) filters.push({ field: "keyType", op: "eq", value: keyType });

  const sourceType = mapSelectorSourceToSourceType(selectors?.source);
  if (sourceType) filters.push({ field: "sourceType", op: "eq", value: sourceType });

  const status = String(selectors?.status ?? "").trim();
  if (status) filters.push({ field: "keyStatus", op: "eq", value: status });

  return extractData({
    input: { rows: candidateRows },
    sourcePath: "$.rows[*]",
    filters,
  }).map(({ nameLower, ...rest }) => rest);
}

function pickWallet(request = {}, walletStatus = {}) {
  const scope = String(request?.scope ?? "single").trim().toLowerCase() || "single";
  const outputs = request.outputs ?? request.outps ?? {};
  const treeRows = buildWalletTreeRows(walletStatus);
  const dataEngineMatchedRows = queryWalletRowsWithDataEngine(treeRows, request);
  const candidates = applyChainFilters(dataEngineMatchedRows, outputs);
  if (scope === "all") {
    return candidates;
  }
  return candidates.length > 0 ? [candidates[0]] : [];
}

async function testDebugRetrieveKeysFromWalletStatus(options) {
  divider("调试 A: 从 wallet.status.keys 检索 key");

  const walletStatus = await importWalletStatusToOptions(options);

  const keyFilters = {
    keyId: options?.inputs?.keyId,
    name: resolveDebugName(options),
    nameExact: Boolean(options?.inputs?.nameExact),
    keyType: options?.inputs?.keyType,
    source: options?.inputs?.source,
    status: options?.inputs?.status,
  };

  const keyCandidates = retrieveWalletKeyCandidates(keyFilters, walletStatus);
  info(`key candidates: ${keyCandidates.length}`);
  console.log(toJsonSafe({ keyFilters, keyCandidates }));

  return {
    walletStatus,
    keyFilters,
    keyCandidates,
  };
}

async function testDebugPickAddressFromInputs(options) {
  divider("调试 B: 从 inputs 提取地址（含 key fallback）");
    // console.log(
    //     walletStatus, " walletStatus"
    // )
  const pickedWallets = pickWallet(
    {
      scope: "all",
      selectors: {
        // keyId: options?.inputs?.keyId,
        name: 'meer',
        // nameExact: false
        // nameExact: Boolean(options?.inputs?.nameExact),
        // keyType: options?.inputs?.keyType,
        // source: options?.inputs?.source,
        // status: options?.inputs?.status,
      },
      outps: {
        signer: true,
        chains: [
          "evm",
          {
            chain: "btc",
            addressTypes: Array.isArray(options?.inputs?.addressTypes)
              ? options.inputs.addressTypes
              : undefined,
          },
        ],
      },
    },
        options.wallet.tree,
  );

  info(`pickWallet rows: ${pickedWallets.length}`);
  console.log(toJsonSafe(pickedWallets));
}

// ─── 主程序 ───────────────────────────────────────────────────

export async function run(options) {
  console.log("\n🔧 Wallet-Engine 测试工具\n");

  const keyDebug = await testDebugRetrieveKeysFromWalletStatus(options);
  await testDebugPickAddressFromInputs(options, keyDebug.walletStatus);

  divider("所有测试完成");
}

