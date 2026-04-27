
import {
  retrieveWalletCandidates,
  retrieveWalletKeyCandidates,
  generateAddressFromCandidates,
  generateSignerFromCandidates,
  pickAddressQueryFromInputs,
} from "../modules/wallet-engine/index.mjs";
import { createHash } from "node:crypto";
import { showInputs } from "../modules/inputs/index.mjs";
import { searchAddressAssetsTask } from "../tasks/search/index.mjs";
import walletSessionTask from "../tasks/wallet/index.mjs";

const DEFAULT_DEMO_ADDRESS = "0x6Fb8aa6fc6f27e591423009194529aE126660027";
const DEFAULT_DEMO_NETWORK = "eth";

const SEARCH_ADDRESS_ASSETS_INPUT_RULE = {
  strategy: "first-valid",
  fields: {
    query: {
      from: ["query", "address"],
      required: true,
      normalize: "nonEmptyString",
    },
    network: {
      from: ["network", "chain"],
      required: false,
      normalize: "nonEmptyString",
    },
    limit: {
      from: ["limit"],
      required: false,
      normalize: "positiveNumber",
    },
    timeoutMs: {
      from: ["timeoutMs"],
      required: false,
      normalize: "positiveNumber",
    },
  },
};

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

function normalizeNonEmptyString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizePositiveNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.floor(num);
}

function collectInputCandidatesFromRuntime(options = {}) {
  const candidates = [];

  if (options.inputs && typeof options.inputs === "object") {
    candidates.push(options.inputs);
  }

  const rows = Array.isArray(options.inputsData?.items) ? options.inputsData.items : [];
  for (const row of rows) {
    if (row?.data && typeof row.data === "object") {
      candidates.push(row.data);
    }
  }

  return candidates;
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

function groupAddressesByType(rows) {
  const grouped = {};
  for (const row of rows) {
    const t = String(row?.addressType ?? row?.type ?? "default").trim().toLowerCase() || "default";
    if (!Array.isArray(grouped[t])) {
      grouped[t] = [];
    }
    grouped[t].push(row.address);
  }
  return grouped;
}

function normalizeSignerFromRows(rows) {
  const picked = rows.find((r) => r?.signerRef || r?.signerType);
  if (!picked) return null;
  return {
    ref: picked.signerRef ?? null,
    type: picked.signerType ?? null,
  };
}

function normalizeAddressForCompare(chain, address) {
  const text = String(address ?? "").trim();
  if (!text) return "";
  const c = String(chain ?? "").trim().toLowerCase();
  if (c === "evm") {
    return text.toLowerCase();
  }
  return text;
}

function buildOccupiedAddressSet(addresses = []) {
  const occupied = new Set();
  for (const row of addresses) {
    const chain = String(row?.chain ?? "").trim().toLowerCase();
    const normalized = normalizeAddressForCompare(chain, row?.address);
    if (normalized) {
      occupied.add(`${chain}:${normalized}`);
    }
  }
  return occupied;
}

function collectUsedIndices(rows = []) {
  const used = new Set();
  for (const row of rows) {
    const index = Number(row?.index);
    if (Number.isInteger(index) && index >= 0) {
      used.add(index);
    }
  }
  return used;
}

function mockDeriveAddress({ keyId, chain, addressType, index }) {
  const seed = `${String(keyId ?? "")}::${String(chain ?? "")}::${String(addressType ?? "default")}::${Number(index)}`;
  const hex = createHash("sha256").update(seed).digest("hex");
  const c = String(chain ?? "").trim().toLowerCase();

  if (c === "evm") {
    return `0x${hex.slice(0, 40)}`;
  }
  if (c === "trx") {
    return `T${hex.slice(0, 33)}`;
  }
  if (c === "btc") {
    const prefix = addressType === "p2tr" ? "bc1p" : "bc1q";
    return `${prefix}${hex.slice(0, 36)}`;
  }
  return `${c || "addr"}_${hex.slice(0, 24)}`;
}

function inferIndexFromPath(pathValue) {
  const path = String(pathValue ?? "").trim();
  if (!path) return null;
  const parts = path.split("/");
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function resolveSignerTypeByChain(chain, fallback = null) {
  if (fallback) return fallback;
  if (chain === "evm") return "ethers-signer";
  if (chain === "trx") return "tronweb-signer";
  if (chain === "btc") return "btc-signer";
  return null;
}

function toAddressRecord(row, keyMeta, fallback = {}) {
  const chain = String(row?.chain ?? fallback.chain ?? "").trim().toLowerCase();
  const indexFromRow = Number.isInteger(Number(row?.index)) ? Number(row?.index) : null;
  const inferredIndex = indexFromRow ?? inferIndexFromPath(row?.path ?? fallback.path);
  const indexSuffix = inferredIndex ?? row?.name ?? "addr";
  const keyId = String(row?.keyId ?? keyMeta?.keyId ?? fallback.keyId ?? "").trim() || null;
  const signerRef = row?.signerRef ?? fallback.signerRef ?? (keyId && chain ? `${chain}:${keyId}:${indexSuffix}` : null);

  return {
    chain,
    address: row?.address ?? fallback.address ?? null,
    addressType: row?.addressType ?? row?.type ?? fallback.addressType ?? null,
    signerRef,
    signerType: resolveSignerTypeByChain(chain, row?.signerType ?? fallback.signerType ?? null),
    index: inferredIndex,
    path: row?.path ?? fallback.path ?? null,
    source: row?.source ?? fallback.source ?? "existing",
    name: row?.name ?? fallback.name ?? keyMeta?.name ?? keyMeta?.keyName ?? null,
    keyId,
  };
}

function deriveNonConflictingAddresses({
  keyId,
  chain,
  addressType = null,
  needed = 1,
  occupiedAddressSet,
  usedIndexSet,
  startIndex = 0,
  maxAttempts = 128,
}) {
  const results = [];
  let cursor = Math.max(0, Number(startIndex) || 0);
  let attempts = 0;

  while (results.length < needed && attempts < maxAttempts) {
    attempts += 1;
    const candidate = mockDeriveAddress({ keyId, chain, addressType, index: cursor });
    const normalized = normalizeAddressForCompare(chain, candidate);
    const compareKey = `${chain}:${normalized}`;
    const indexOccupied = usedIndexSet.has(cursor);
    const addressOccupied = occupiedAddressSet.has(compareKey);

    if (!indexOccupied && !addressOccupied) {
      usedIndexSet.add(cursor);
      occupiedAddressSet.add(compareKey);
      results.push({
        keyId,
        chain,
        address: candidate,
        addressType: addressType ?? null,
        index: cursor,
        source: "derived",
      });
    }

    cursor += 1;
  }

  return results;
}

function findKeyIdsByNameFromAddresses(addresses = [], selectors = {}) {
  const rawName = String(selectors?.name ?? selectors?.keyName ?? "").trim();
  if (!rawName) return [];

  const needle = rawName.toLowerCase();
  const nameExact = Boolean(selectors?.nameExact);
  const ids = new Set();

  for (const row of addresses) {
    const keyId = String(row?.keyId ?? "").trim();
    if (!keyId) continue;

    const candidateName = String(row?.keyName ?? row?.name ?? "").trim().toLowerCase();
    if (!candidateName) continue;

    const matched = nameExact
      ? candidateName === needle
      : candidateName.includes(needle);

    if (matched) {
      ids.add(keyId);
    }
  }

  return Array.from(ids);
}

function prepareWalletCandidates(walletStatus = {}, request = {}) {
  const outputs = request.outputs ?? request.outps ?? {};
  const selectors = request.selectors ?? request.keyFilters ?? {};
  const requestedChains = normalizeChainsFromRequest(outputs.chains);
  const deriveEnabled = outputs.derive !== false;
  const deriveCountRaw = Number(outputs.deriveCount ?? outputs?.derive?.count ?? 1);
  const deriveCount = Number.isInteger(deriveCountRaw) && deriveCountRaw > 0 ? deriveCountRaw : 1;
  const deriveStartIndexRaw = Number(outputs.deriveStartIndex ?? outputs?.derive?.startIndex ?? 0);
  const deriveStartIndex = Number.isInteger(deriveStartIndexRaw) && deriveStartIndexRaw >= 0
    ? deriveStartIndexRaw
    : 0;

  const keys = Array.isArray(walletStatus?.keys) ? walletStatus.keys : [];
  const addresses = Array.isArray(walletStatus?.addresses) ? walletStatus.addresses : [];
  const occupiedAddressSet = buildOccupiedAddressSet(addresses);

  const selectedKeys = retrieveWalletKeyCandidates(selectors, walletStatus);
  const hasSelectorFilter = [
    selectors?.keyId,
    selectors?.name,
    selectors?.keyType,
    selectors?.source,
    selectors?.status,
  ].some((v) => String(v ?? "").trim());
  const selectedKeyIds = selectedKeys.map((k) => k.keyId).filter(Boolean);
  const addressNameMatchedKeyIds = selectedKeyIds.length === 0
    ? findKeyIdsByNameFromAddresses(addresses, selectors)
    : [];
  const fallbackKeyIds = hasSelectorFilter
    ? (selectedKeyIds.length > 0 ? selectedKeyIds : addressNameMatchedKeyIds)
    : Array.from(new Set(addresses.map((row) => row?.keyId).filter(Boolean)));

  return fallbackKeyIds.map((keyId) => {
    const keyMeta = selectedKeys.find((k) => k.keyId === keyId)
      ?? keys.find((k) => String(k?.keyId ?? "") === String(keyId));

    const keyRows = addresses.filter((row) => String(row?.keyId ?? "") === String(keyId));
    const usedIndexSet = collectUsedIndices(keyRows);
    const chainRequests = requestedChains.length
      ? requestedChains
      : Array.from(new Set(keyRows.map((row) => String(row?.chain ?? "").trim().toLowerCase()).filter(Boolean)))
          .map((chain) => ({ chain, addressTypes: null }));

    const addressRecords = [];
    for (const req of chainRequests) {
      const rowsByChain = keyRows.filter((row) => String(row?.chain ?? "").trim().toLowerCase() === req.chain);

      if (req.chain === "btc") {
        const grouped = groupAddressesByType(rowsByChain);
        const existingTypes = Object.keys(grouped);
        const effectiveTypes = Array.isArray(req.addressTypes) && req.addressTypes.length > 0
          ? req.addressTypes
          : existingTypes.length > 0
            ? existingTypes
            : ["p2wpkh"];

        for (const t of effectiveTypes) {
          const rowsByType = rowsByChain.filter(
            (row) => String(row?.addressType ?? row?.type ?? "default").trim().toLowerCase() === t,
          );
          const currentRecords = rowsByType.map((row) => toAddressRecord(row, keyMeta, { source: "existing" }));
          addressRecords.push(...currentRecords);

          if (deriveEnabled && currentRecords.length < deriveCount) {
            const missingCount = deriveCount - currentRecords.length;
            const derivedRows = deriveNonConflictingAddresses({
              keyId,
              chain: "btc",
              addressType: t,
              needed: missingCount,
              occupiedAddressSet,
              usedIndexSet,
              startIndex: deriveStartIndex,
            });
            addressRecords.push(
              ...derivedRows.map((item) =>
                toAddressRecord(item, keyMeta, {
                  source: "derived",
                  addressType: t,
                }),
              ),
            );
          }
        }
        continue;
      }

      const currentRecords = rowsByChain.map((row) => toAddressRecord(row, keyMeta, { source: "existing" }));
      addressRecords.push(...currentRecords);

      if (deriveEnabled && currentRecords.length < deriveCount) {
        const missingCount = deriveCount - currentRecords.length;
        const derivedRows = deriveNonConflictingAddresses({
          keyId,
          chain: req.chain,
          addressType: null,
          needed: missingCount,
          occupiedAddressSet,
          usedIndexSet,
          startIndex: deriveStartIndex,
        });
        addressRecords.push(
          ...derivedRows.map((item) =>
            toAddressRecord(item, keyMeta, {
              source: "derived",
              addressType: null,
            }),
          ),
        );
      }
    }

    const stableAddressRecords = addressRecords
      .filter((r) => r?.chain && r?.address)
      .sort((a, b) => {
        if (a.chain !== b.chain) return a.chain.localeCompare(b.chain);
        const ai = Number.isInteger(a.index) ? a.index : Number.MAX_SAFE_INTEGER;
        const bi = Number.isInteger(b.index) ? b.index : Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });

    const defaultSigner = outputs.signer ? normalizeSignerFromRows(keyRows) : null;
    const signerFromRecord = outputs.signer && stableAddressRecords.length > 0
      ? {
          ref: stableAddressRecords[0].signerRef,
          type: stableAddressRecords[0].signerType,
        }
      : null;

    return {
      name: keyMeta?.name ?? keyMeta?.keyName ?? null,
      key: {
        keyId: keyMeta?.keyId ?? keyId,
        keyName: keyMeta?.keyName ?? keyMeta?.name ?? null,
        keyType: keyMeta?.keyType ?? null,
        source: keyMeta?.source ?? null,
        status: keyMeta?.status ?? null,
      },
      signer: outputs.signer ? (defaultSigner ?? signerFromRecord) : null,
      addresses: stableAddressRecords,
    };
  });
}

function flattenWalletCandidates(candidates = [], request = {}) {
  const selectors = request?.selectors ?? request?.keyFilters ?? {};
  const rawName = String(selectors?.name ?? selectors?.keyName ?? "").trim();
  const nameNeedle = rawName.toLowerCase();
  const nameExact = Boolean(selectors?.nameExact);

  const grouped = new Map();

  for (const item of candidates) {
    const key = item?.key && typeof item.key === "object" ? item.key : {};
    const addresses = Array.isArray(item?.addresses) ? item.addresses : [];

    for (const addr of addresses) {
      const addressName = String(addr?.name ?? "").trim();
      if (nameNeedle) {
        const target = addressName.toLowerCase();
        const matched = nameExact ? target === nameNeedle : target.includes(nameNeedle);
        if (!matched) continue;
      }

      const keyId = String(addr?.keyId ?? key?.keyId ?? "").trim() || null;
      const keyType = String(key?.keyType ?? "").trim() || null;
      const sourceType = String(addr?.source ?? "").trim().toLowerCase() === "derived" ? "derive" : "orig";
      const path = String(addr?.path ?? "").trim() || null;
      const chain = String(addr?.chain ?? "").trim().toLowerCase() || null;
      const address = String(addr?.address ?? "").trim() || null;
      if (!keyId || !chain || !address) continue;

      const groupKey = `${keyId}::${addressName}::${path ?? ""}::${sourceType}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          keyId,
          name: addressName || null,
          keyType,
          sourceType,
          path,
          addresses: {},
        });
      }

      const row = grouped.get(groupKey);
      if (chain === "btc") {
        const current = Array.isArray(row.addresses.btc) ? row.addresses.btc : [];
        if (!current.includes(address)) {
          current.push(address);
        }
        row.addresses.btc = current;
      } else {
        const current = row.addresses[chain];
        if (current == null) {
          row.addresses[chain] = address;
        } else if (Array.isArray(current)) {
          if (!current.includes(address)) current.push(address);
        } else if (current !== address) {
          row.addresses[chain] = [current, address];
        }
      }
    }
  }

  return Array.from(grouped.values());
}

function pickWallet(request = {}, walletStatus = {}) {
  const scope = String(request?.scope ?? "single").trim().toLowerCase() || "single";
  const outputs = request.outputs ?? request.outps ?? {};
  const flatten = outputs?.flatten === true;
  const groupedCandidates = prepareWalletCandidates(walletStatus, request);
  const candidates = flatten ? flattenWalletCandidates(groupedCandidates, request) : groupedCandidates;
  if (scope === "all") {
    return candidates;
  }
  return candidates.length > 0 ? [candidates[0]] : [];
}

// ─── 测试 1：查看当前 inputs ───────────────────────────────────

async function testShowInputs() {
  divider("测试 1: 查看当前 inputs");
  
  try {
    // 从全局 inputs store 读取
    const inputsData = await showInputs();
    
    if (inputsData.count === 0) {
      info("当前没有设置 inputs，可以先运行：");
      info("  wallet inputs.set wallet --data '{\"address\":\"0x...\",\"chain\":\"evm\"}'");
    } else {
      success(`找到 ${inputsData.count} 个 inputs`);
        console.log(toJsonSafe(inputsData.items));
    }
  } catch (err) {
    error(`${err.message}`);
  }
}

// ─── 测试 2：创建 mock 钱包状态 ───────────────────────────────

function createMockWalletStatus() {
  divider("测试 2: 创建 mock 钱包状态");
  
  const walletStatus = {
    sessionId: "default",
    addresses: [
      // k1 EVM 地址
      {
        keyId: "k1",
        keyName: "alpha",
        chain: "evm",
        address: "0x1111111111111111111111111111111111111111",
        name: "main",
        path: "m/44'/60'/0'/0/0",
        signerRef: "evm:k1:main",
        signerType: "ethers-signer",
      },
      {
        keyId: "k1",
        keyName: "alpha",
        chain: "evm",
        address: "0x2222222222222222222222222222222222222222",
        name: "alt",
        path: "m/44'/60'/0'/0/1",
        signerRef: "evm:k1:alt",
        signerType: "ethers-signer",
      },
      // k2 TRX 地址
      {
        keyId: "k2",
        keyName: "beta",
        chain: "trx",
        address: "TQN7UoUE3oMF4GV7Hm2uC6Kz8gHqBdL7Cv",
        name: "trx-main",
        path: "m/44'/195'/0'/0/0",
        signerRef: "trx:k2:main",
        signerType: "tronweb-signer",
      },
    ],
  };
  
  success("Mock 钱包状态已创建");
  console.log(toJsonSafe(walletStatus));
  
  return walletStatus;
}

// ─── 测试 3: 检索候选地址（按名称）───────────────────────────

async function testRetrieveByName(walletStatus) {
  divider("测试 3: 检索候选地址（按名称 'main'）");
  
  try {
    const candidates = retrieveWalletCandidates(
      { name: "main", nameExact: true }, 
      walletStatus
    );
    
    success(`找到 ${candidates.length} 个候选`);
    console.log(toJsonSafe(candidates));
    
    return candidates;
  } catch (err) {
    error(`${err.message}`);
    return [];
  }
}

// ─── 测试 4: 生成地址（single 模式）───────────────────────────

async function testGenerateAddressSingle(candidates) {
  divider("测试 4: 从候选生成地址（single 模式）");
  
  if (candidates.length === 0) {
    error("没有候选可用");
    return null;
  }
  
  try {
    const result = generateAddressFromCandidates(
      candidates,
      { cardinality: "single" }
    );
    
    success("地址生成成功");
    console.log(toJsonSafe(result));
    
    return result;
  } catch (err) {
    error(`${err.message}`);
    return null;
  }
}

// ─── 测试 5: 生成地址（multi 模式）───────────────────────────

async function testGenerateAddressMulti(walletStatus) {
  divider("测试 5: 生成多个地址（multi 模式）");
  
  try {
    // 先检索所有 k1 的候选
    const candidates = retrieveWalletCandidates(
      { keyId: "k1" },
      walletStatus
    );
    
    if (candidates.length === 0) {
      error("没有候选可用");
      return null;
    }
    
    const result = generateAddressFromCandidates(
      candidates,
      { cardinality: "multi" }
    );
    
    success(`生成 ${result.addresses.length} 个地址`);
    console.log(toJsonSafe(result));
    
    return result;
  } catch (err) {
    error(`${err.message}`);
    return null;
  }
}

// ─── 测试 6: 生成 Signer（single 模式）───────────────────────

async function testGenerateSignerSingle(walletStatus) {
  divider("测试 6: 生成 Signer（single 模式）");
  
  try {
    // 检索 k1 的 EVM signer
    const candidates = retrieveWalletCandidates(
      { keyId: "k1", chain: "evm", name: "main", nameExact: true },
      walletStatus
    );
    
    if (candidates.length === 0) {
      error("没有候选可用");
      return null;
    }
    
    const result = generateSignerFromCandidates(
      candidates,
      { cardinality: "single" }
    );
    
    success("Signer 生成成功");
    info(`signerRef: ${result.signerRefs?.[0]}`);
    info(`signerType: ${result.signerTypes?.[0]}`);
    console.log(toJsonSafe(result));
    
    return result;
  } catch (err) {
    error(`${err.message}`);
    return null;
  }
}

// ─── 测试 7: 检索条件组合 ─────────────────────────────────────

async function testRetrieveCombinations(walletStatus) {
  divider("测试 7: 检索条件组合测试");
  
  const cases = [
    { label: "按 keyId", filters: { keyId: "k2" } },
    { label: "按 chain", filters: { chain: "evm" } },
    { label: "按 keyId + chain", filters: { keyId: "k1", chain: "evm" } },
    { label: "模糊名称搜索", filters: { name: "alt", nameExact: false } },
    { label: "获取全部", filters: { mode: "all" } },
  ];
  
  for (const { label, filters } of cases) {
    try {
      const candidates = retrieveWalletCandidates(filters, walletStatus);
      info(`${label}: 找到 ${candidates.length} 个候选`);
    } catch (err) {
      error(`${label}: ${err.message}`);
    }
  }
}

// ─── 测试 8: Search 地址资产查询（地址来自 inputs）─────────────────

async function testSearchAddressAssetsFromInputs(options) {
  divider("测试 8: Search 地址资产查询（地址来自 inputs）");

  const walletStatus = await importWalletStatusToOptions(options);
  const inputCandidates = collectInputCandidatesFromRuntime(options);
  const queryInput = pickAddressQueryFromInputs(inputCandidates, {
    rule: SEARCH_ADDRESS_ASSETS_INPUT_RULE,
    walletStatus,
    keyFilters: {
      keyId: options?.inputs?.keyId,
      name: resolveDebugName(options),
      nameExact: Boolean(options?.inputs?.nameExact),
      keyType: options?.inputs?.keyType,
      source: options?.inputs?.source,
      status: options?.inputs?.status,
    },
    chain: options?.inputs?.chain,
    network: options?.inputs?.network,
  });

  const targetQuery = queryInput?.query ?? DEFAULT_DEMO_ADDRESS;
  const targetNetwork = queryInput?.network ?? DEFAULT_DEMO_NETWORK;
  const targetLimit = queryInput?.limit ?? null;
  const targetTimeoutMs = queryInput?.timeoutMs ?? null;

  if (!queryInput?.ok) {
    info(`地址提取失败: ${queryInput?.errorCode ?? "UNKNOWN"}`);
    info("未在 inputs 或 wallet.status 中找到可用地址，使用默认演示地址继续查询");
    info(`demo.address: ${targetQuery}`);
    info(`demo.network: ${targetNetwork}`);
    info("如需查询你自己的地址，可先设置：wallet inputs.set wallet --data '{\"address\":\"0x...\",\"network\":\"eth\"}'");
  }

  try {
    info(`query.address: ${targetQuery}`);
    info(`query.network: ${queryInput?.network ?? `${targetNetwork} (default)`}`);
    const searchInput = {
      query: targetQuery,
      ...(targetNetwork ? { network: targetNetwork } : {}),
      ...(targetLimit ? { limit: targetLimit } : {}),
      ...(targetTimeoutMs ? { timeoutMs: targetTimeoutMs } : {}),
    };

    const result = await searchAddressAssetsTask(searchInput);

    success("Search 地址资产查询成功");
    info(`resolvedNetwork: ${result.network ?? "unknown"}`);
    info(`assetCount: ${Array.isArray(result.assets) ? result.assets.length : 0}`);

    console.log(toJsonSafe(result));
    return result;
  } catch (err) {
    error(`Search 查询失败: ${err.message}`);
    return null;
  }
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

async function testDebugPickAddressFromInputs(options, walletStatus) {
  divider("调试 B: 从 inputs 提取地址（含 key fallback）");

  const pickedWallets = pickWallet(
    {
      scope: "all",
      selectors: {
        // keyId: options?.inputs?.keyId,
        name: 'is',
        // nameExact: false
        // nameExact: Boolean(options?.inputs?.nameExact),
        // keyType: options?.inputs?.keyType,
        // source: options?.inputs?.source,
        // status: options?.inputs?.status,
      },
      outps: {
        flatten: true,
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
    walletStatus,
  );

  info(`pickWallet rows: ${pickedWallets.length}`);
  console.log(toJsonSafe(pickedWallets));
  return

  const inputCandidates = collectInputCandidatesFromRuntime(options);
  const picked = pickAddressQueryFromInputs(inputCandidates, {
    rule: SEARCH_ADDRESS_ASSETS_INPUT_RULE,
    walletStatus,
    keyFilters: {
      keyId: options?.inputs?.keyId,
      name: resolveDebugName(options),
      nameExact: Boolean(options?.inputs?.nameExact),
      keyType: options?.inputs?.keyType,
      source: options?.inputs?.source,
      status: options?.inputs?.status,
    },
    chain: options?.inputs?.chain,
    network: options?.inputs?.network,
  });

  info(`input candidates: ${inputCandidates.length}`);
  console.log(toJsonSafe(picked));
  return picked;
}

// ─── 主程序 ───────────────────────────────────────────────────

export async function run(options) {
  console.log("\n🔧 Wallet-Engine 测试工具\n");

//   // 测试 1：查看 inputs
//   await testShowInputs();

//   // 创建 mock 钱包状态（后续测试用）
//   const walletStatus = createMockWalletStatus();

//   // 测试 2：按名称检索
//   const candidates1 = await testRetrieveByName(walletStatus);

//   // 测试 3：生成单个地址
//   await testGenerateAddressSingle(candidates1);

//   // 测试 4：生成多个地址
//   await testGenerateAddressMulti(walletStatus);

//   // 测试 5：生成 Signer
//   await testGenerateSignerSingle(walletStatus);

//   // 测试 6：检索条件组合
//   await testRetrieveCombinations(walletStatus);

  const keyDebug = await testDebugRetrieveKeysFromWalletStatus(options);
  await testDebugPickAddressFromInputs(options, keyDebug.walletStatus);

  // 测试 8：search 地址资产查询（地址来自 inputs）
//   await testSearchAddressAssetsFromInputs(options);



  divider("所有测试完成");
  console.log("\n💡 提示：\n");
  console.log("  1. 测试中使用了 mock 钱包状态");
  console.log("  2. Search 地址资产查询会优先读取当前 inputs 中的 address/network");
  console.log("  3. 在 REPL 中运行: run test 来执行这个脚本\n");
}

