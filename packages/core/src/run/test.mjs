
import { extractData } from "../modules/data-engine/index.mjs";

// ─── 工具函数 ───────────────────────────────────────────────

function divider(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📌 ${title}`);
  console.log(`${"─".repeat(60)}\n`);
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

function queryKeysWithDataEngine(rows = [], request = {}) {
  const selectors = request?.selectors ?? request?.keyFilters ?? {};

  const keyRows = rows
    .filter((row) => String(row?.sourceType ?? "") === "orig")
    .map((row) => ({
    ...row,
    name: String(row?.name ?? ""),
    nameLower: String(row?.name ?? "").toLowerCase(),
  }));

  const filters = [];
  const keyId = String(selectors?.keyId ?? "").trim();
  if (keyId) filters.push({ field: "keyId", op: "eq", value: keyId });

  const keyName = String(selectors?.name ?? selectors?.keyName ?? "").trim();
  if (keyName) {
    if (selectors?.nameExact) {
      filters.push({ field: "name", op: "eq", value: keyName });
    } else {
      filters.push({ field: "nameLower", op: "contains", value: keyName.toLowerCase() });
    }
  }

  const keyType = String(selectors?.keyType ?? "").trim();
  if (keyType) filters.push({ field: "keyType", op: "eq", value: keyType });

  const sourceType = String(selectors?.source ?? "").trim().toLowerCase();
  if (sourceType) filters.push({ field: "sourceType", op: "eq", value: sourceType });

  return extractData({
    input: { keys: keyRows },
    sourcePath: "$.keys[*]",
    filters,
  }).map(({ nameLower, ...rest }) => rest);
}

function collectAddressesForKey(treeRows = [], keyId = "", requestedChains = []) {
  const addrMap = {};
  const chainFilter = requestedChains.length > 0
    ? new Set(requestedChains.map((item) => item.chain))
    : null;

  for (const row of treeRows) {
    if (String(row?.keyId ?? "") !== keyId) continue;
    if (String(row?.sourceType ?? "") !== "derive") continue;
    const addresses = row?.addresses && typeof row.addresses === "object" ? row.addresses : {};

    for (const [chain, value] of Object.entries(addresses)) {
      if (chainFilter && !chainFilter.has(chain)) continue;
      if (!Array.isArray(addrMap[chain])) addrMap[chain] = [];
      const items = Array.isArray(value) ? value : [value];
      for (const addr of items) {
        const text = String(addr ?? "").trim();
        if (!text) continue;
        if (!addrMap[chain].includes(text)) {
          addrMap[chain].push(text);
        }
      }
    }
  }

  if (chainFilter) {
    for (const chain of chainFilter) {
      if (!Array.isArray(addrMap[chain])) {
        addrMap[chain] = [];
      }
    }
  }

  return addrMap;
}

function pickWallet(request = {}, tree = {}) {
  const scope = String(request?.scope ?? "single").trim().toLowerCase() || "single";
  const outputs = request.outputs ?? request.outps ?? {};
  const requestedChains = normalizeChainsFromRequest(outputs?.chains);
  const treeRows = Array.isArray(tree?.tree) ? tree.tree : [];
  const selectedKeys = queryKeysWithDataEngine(treeRows, request);

  const results = selectedKeys.map((key) => ({
    keyId: key.keyId,
    name: key.name,
    keyType: key.keyType,
    sourceType: key.sourceType,
    path: key.path ?? null,
    addresses: collectAddressesForKey(treeRows, key.keyId, requestedChains),
  }));

  if (scope === "all") return results;
  return results.length > 0 ? [results[0]] : [];
}

async function testDebugPickAddressFromInputs(options) {
  divider("调试 B: 从 inputs 提取地址（含 key fallback）");
  const tree = options?.wallet?.tree;
  if (!tree || !Array.isArray(tree?.tree)) {
    error("缺少 options.wallet.tree.tree，请先确保上游已提供 wallet tree");
    return;
  }

  const pickedWallets = pickWallet(
    {
      scope: "all",
      selectors: {
        keyId: options?.inputs?.keyId,
        name: String(options?.inputs?.name ?? "").trim() || "meer",
        nameExact: Boolean(options?.inputs?.nameExact),
        keyType: options?.inputs?.keyType,
        source: options?.inputs?.source,
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
    tree,
  );

  info(`wallet.tree rows: ${Array.isArray(tree?.tree) ? tree.tree.length : 0}`);
  info(`pickWallet rows: ${pickedWallets.length}`);
  console.log(toJsonSafe(pickedWallets));
}

// ─── 主程序 ───────────────────────────────────────────────────

export async function run(options) {
  console.log("\n🔧 Wallet-Engine 测试工具\n");
    console.log(
        options.wallet.tree
    )
    return
  info(`options.wallet.tree rows: ${Array.isArray(options?.wallet?.tree?.tree) ? options.wallet.tree.tree.length : 0}`);
  await testDebugPickAddressFromInputs(options);

  divider("所有测试完成");
}

