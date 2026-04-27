function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createResolveError(code, message, meta = {}) {
  const err = new Error(message);
  err.code = code;
  err.meta = meta;
  return err;
}

function resolveRequirement(input = {}) {
  const kind = normalizeLower(input?.requirement?.kind || "address") || "address";
  const cardinality = normalizeLower(input?.requirement?.cardinality || "single") || "single";

  if (!["address", "signer"].includes(kind)) {
    throw createResolveError("INVALID_REQUIREMENT_KIND", `requirement.kind 非法: ${kind}`);
  }
  if (!["single", "multi"].includes(cardinality)) {
    throw createResolveError("INVALID_CARDINALITY", `requirement.cardinality 非法: ${cardinality}`);
  }

  return { kind, cardinality };
}

/**
 * 安全检验：确保输出中不含敏感字段
 *
 * @param {Object} obj - 要检验的对象
 * @param {String[]} sensitiveKeys - 敏感字段列表（默认：privateKey, mnemonic, password, secretKey, seed）
 * @throws {Error} 如果发现敏感字段
 */
function checkNoSensitiveFields(obj = {}, sensitiveKeys = []) {
  const defaultSensitive = ["privateKey", "mnemonic", "password", "secretKey", "seed", "passphrase"];
  const keysToCheck = sensitiveKeys.length > 0 ? sensitiveKeys : defaultSensitive;

  function deepCheck(item, path = "") {
    if (!item || typeof item !== "object") return;

    for (const key of keysToCheck) {
      if (key in item) {
        const itemPath = path ? `${path}.${key}` : key;
        throw createResolveError(
          "SECURITY_VIOLATION",
          `输出包含敏感字段: ${itemPath}`,
          { field: itemPath },
        );
      }
    }

    // 递归检查嵌套对象和数组
    for (const [k, v] of Object.entries(item)) {
      if (Array.isArray(v)) {
        v.forEach((item, idx) => deepCheck(item, `${path}${path ? "." : ""}${k}[${idx}]`));
      } else if (typeof v === "object" && v !== null) {
        deepCheck(v, `${path}${path ? "." : ""}${k}`);
      }
    }
  }

  deepCheck(obj);
}

function toAddressCandidate(item = {}) {
  const address = normalizeText(item?.address);
  const keyId = normalizeText(item?.keyId);
  if (!address) return null;
  return {
    keyId,
    keyName: normalizeText(item?.keyName) || null,
    chain: normalizeLower(item?.chain) || null,
    address,
    name: normalizeText(item?.name) || null,
    path: normalizeText(item?.path) || null,
    // 保留 signer 相关字段
    signerRef: normalizeText(item?.signerRef) || null,
    signerType: normalizeText(item?.signerType) || null,
  };
}

function toKeyCandidate(item = {}) {
  const keyId = normalizeText(item?.keyId);
  if (!keyId) return null;
  return {
    keyId,
    keyName: normalizeText(item?.keyName || item?.name) || null,
    keyType: normalizeText(item?.keyType || item?.type) || null,
    source: normalizeText(item?.source) || null,
    status: normalizeText(item?.status) || null,
  };
}

function normalizeNonEmptyString(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizePositiveInteger(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.floor(num);
}

function pickFirstRawValue(input = {}, from = []) {
  for (const key of from) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const raw = input[key];
    if (raw == null) continue;
    if (typeof raw === "string" && raw.trim() === "") continue;
    return raw;
  }
  return null;
}

function getFieldNormalizer(name) {
  if (name === "nonEmptyString") {
    return normalizeNonEmptyString;
  }
  if (name === "positiveNumber") {
    return normalizePositiveInteger;
  }
  return (value) => value;
}

function mapByRule(input = {}, rule = {}) {
  const fields = rule?.fields && typeof rule.fields === "object" ? rule.fields : {};
  const mapped = {};

  for (const [fieldName, fieldRule] of Object.entries(fields)) {
    const from = Array.isArray(fieldRule?.from) ? fieldRule.from : [fieldName];
    const raw = pickFirstRawValue(input, from);
    const normalize = getFieldNormalizer(fieldRule?.normalize);
    const normalized = raw == null ? null : normalize(raw);

    if (normalized == null) {
      if (fieldRule?.required) {
        return null;
      }
      continue;
    }

    mapped[fieldName] = normalized;
  }

  return mapped;
}

function mergeKeyFiltersFromInputs(candidates = []) {
  const merged = {
    keyId: null,
    name: null,
    keyName: null,
  };

  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;

    if (!merged.keyId) {
      merged.keyId = normalizeText(item.keyId) || null;
    }
    if (!merged.name) {
      merged.name = normalizeText(item.name) || null;
    }
    if (!merged.keyName) {
      merged.keyName = normalizeText(item.keyName) || null;
    }

    const targets = asArray(item.targets);
    for (const target of targets) {
      if (!merged.keyId) {
        merged.keyId = normalizeText(target?.keyId) || null;
      }
      if (!merged.name) {
        merged.name = normalizeText(target?.name) || null;
      }
      if (!merged.keyName) {
        merged.keyName = normalizeText(target?.keyName) || null;
      }
    }
  }

  return merged;
}

/**
 * 从 wallet.status.keys 中检索 key 候选。
 * 支持 keyId / name / keyName / keyType / source / status 过滤。
 */
export function retrieveWalletKeyCandidates(filters = {}, walletStatus = {}) {
  const keys = asArray(walletStatus?.keys)
    .map((item) => toKeyCandidate(item))
    .filter(Boolean);

  const keyId = normalizeText(filters?.keyId);
  const keyType = normalizeLower(filters?.keyType || filters?.type);
  const source = normalizeLower(filters?.source);
  const status = normalizeLower(filters?.status);
  const name = normalizeText(filters?.name || filters?.keyName);
  const nameExact = Boolean(filters?.nameExact);

  let candidates = keys;
  if (keyId) {
    candidates = candidates.filter((k) => k.keyId === keyId);
  }
  if (keyType) {
    candidates = candidates.filter((k) => normalizeLower(k.keyType) === keyType);
  }
  if (source) {
    candidates = candidates.filter((k) => normalizeLower(k.source) === source);
  }
  if (status) {
    candidates = candidates.filter((k) => normalizeLower(k.status) === status);
  }
  if (name) {
    const needle = normalizeLower(name);
    if (nameExact) {
      candidates = candidates.filter((k) => normalizeLower(k.keyName) === needle);
    } else {
      candidates = candidates.filter((k) => normalizeLower(k.keyName).includes(needle));
    }
  }

  candidates.sort((a, b) => a.keyId.localeCompare(b.keyId));
  return candidates;
}

/**
 * 通过输入候选提取 address 查询参数。
 * 优先直接提取 query/address；无地址时退化为 key 检索并反查地址。
 */
export function pickAddressQueryFromInputs(inputs = [], options = {}) {
  const candidates = Array.isArray(inputs) ? inputs : [];
  const rule = options?.rule && typeof options.rule === "object"
    ? options.rule
    : {
      strategy: "first-valid",
      fields: {
        query: { from: ["query", "address"], required: true, normalize: "nonEmptyString" },
        network: { from: ["network", "chain"], required: false, normalize: "nonEmptyString" },
        limit: { from: ["limit"], required: false, normalize: "positiveNumber" },
        timeoutMs: { from: ["timeoutMs"], required: false, normalize: "positiveNumber" },
      },
    };

  if ((rule?.strategy ?? "first-valid") !== "first-valid") {
    throw createResolveError("UNSUPPORTED_PICK_STRATEGY", "暂不支持的提取策略");
  }

  for (const item of candidates) {
    const mapped = mapByRule(item, rule);
    if (mapped && mapped.query) {
      return {
        ok: true,
        source: "inputs",
        ...mapped,
      };
    }
  }

  const walletStatus = options?.walletStatus && typeof options.walletStatus === "object"
    ? options.walletStatus
    : {};
  const inputKeyFilters = mergeKeyFiltersFromInputs(candidates);
  const keyFilters = {
    ...inputKeyFilters,
    ...(options?.keyFilters && typeof options.keyFilters === "object" ? options.keyFilters : {}),
  };

  const keyCandidates = retrieveWalletKeyCandidates(keyFilters, walletStatus);
  if (keyCandidates.length === 0) {
    return {
      ok: false,
      errorCode: "NO_KEY_MATCH",
      message: "未匹配到 key，无法反查地址",
      keyFilters,
    };
  }

  if (keyCandidates.length > 1) {
    return {
      ok: false,
      errorCode: "MULTIPLE_KEY_MATCH",
      message: "命中多个 key，请补充 keyId 或更精确的 name",
      keyFilters,
      keyCandidates,
    };
  }

  const selectedKey = keyCandidates[0];
  const addressCandidates = retrieveWalletCandidates({
    keyId: selectedKey.keyId,
    chain: normalizeLower(options?.chain || options?.network) || "",
  }, walletStatus);

  if (addressCandidates.length === 0) {
    return {
      ok: false,
      errorCode: "NO_ADDRESS_FOR_KEY",
      message: "key 已命中，但尚未配置地址",
      key: selectedKey,
      hint: "请先执行 wallet derive 或配置地址后再重试",
    };
  }

  if (addressCandidates.length > 1) {
    return {
      ok: false,
      errorCode: "MULTIPLE_ADDRESS_MATCH",
      message: "key 下存在多个地址，请补充 chain/name 约束",
      key: selectedKey,
      addressCandidates,
    };
  }

  const picked = addressCandidates[0];
  return {
    ok: true,
    source: "wallet-status",
    query: picked.address,
    network: picked.chain || null,
    key: selectedKey,
    address: picked,
  };
}

/**
 * 检索阶段：从 wallet 状态中按过滤条件检索候选地址
 *
 * @param {Object} filters - 检索条件
 *   - nameExact: boolean - 名称是否精确匹配（默认 false 模糊）
 *   - name: string - 按名称过滤
 *   - keyId: string - 按 keyId 精确匹配
 *   - chain: string - 按 chain 过滤
 *   - mode: string - 'all'(全部) 或默认按过滤条件
 *   - hdSubkeys: boolean - 是否只返回 HD 子钱包（需配合 keyId）
 * @param {Object} walletStatus - 钱包状态，包含 { addresses: [...] }
 * @returns {Array} 候选地址列表 [{ keyId, keyName, chain, address, name, path }]
 */
export function retrieveWalletCandidates(filters = {}, walletStatus = {}) {
  const addresses = asArray(walletStatus?.addresses || []);
  let candidates = addresses
    .map((item) => toAddressCandidate(item))
    .filter(Boolean);

  const mode = normalizeLower(filters?.mode) || "";
  const keyId = normalizeText(filters?.keyId);
  const name = normalizeText(filters?.name);
  const chain = normalizeLower(filters?.chain);
  const nameExact = !!filters?.nameExact;
  const hdSubkeys = !!filters?.hdSubkeys;

  // mode='all' 返回全部候选
  if (mode === "all") {
    return candidates;
  }

  // 按 keyId 过滤
  if (keyId) {
    candidates = candidates.filter((c) => c.keyId === keyId);
  }

  // 按名称过滤（精确或模糊）
  if (name) {
    const nameLower = normalizeLower(name);
    if (nameExact) {
      // 精确匹配
      candidates = candidates.filter((c) => normalizeLower(c.name) === nameLower);
    } else {
      // 模糊匹配（包含）
      candidates = candidates.filter((c) => normalizeLower(c.name).includes(nameLower));
    }
  }

  // 按 chain 过滤
  if (chain) {
    candidates = candidates.filter((c) => c.chain === chain);
  }

  // HD 子钱包过滤（仅当有 path 时）
  if (hdSubkeys && keyId) {
    candidates = candidates.filter((c) => !!normalizeText(c.path));
  }

  // 排序稳定性：首先 keyId 字典序，其次 chain 字典序，再次 path 字典序
  candidates.sort((a, b) => {
    if (a.keyId !== b.keyId) return a.keyId.localeCompare(b.keyId);
    if (a.chain !== b.chain) return a.chain.localeCompare(b.chain);
    return (a.path || "").localeCompare(b.path || "");
  });

  return candidates;
}

/**
 * 生成阶段：从候选地址列表生成最终输出
 *
 * @param {Array} candidates - 检索阶段的候选地址列表
 * @param {Object} requirement - 输出要求 { cardinality: 'single'|'multi', ... }
 * @returns {Object} { ok: true, addresses: [...], query, chain, cardinality, resolutionMeta }
 * @throws {Error} 当无命中或多命中 single 模式时报错
 */
export function generateAddressFromCandidates(candidates = [], requirement = {}) {
  const cardinality = normalizeLower(requirement?.cardinality || "single") || "single";

  if (candidates.length === 0) {
    throw createResolveError("NO_MATCH", "未匹配到可用地址", {
      candidateCount: 0,
    });
  }

  if (cardinality === "single" && candidates.length > 1) {
    throw createResolveError("MULTIPLE_MATCH", "命中多个地址，请补充约束", {
      count: candidates.length,
    });
  }

  const picked = cardinality === "single"
    ? [candidates[0]]
    : candidates;

  const result = {
    ok: true,
    kind: "address",
    cardinality,
    query: picked[0].address,
    chain: picked[0].chain,
    addresses: picked,
    resolutionMeta: {
      candidateCount: candidates.length,
      selectedCount: picked.length,
      source: "wallet-engine",
    },
  };

  // 安全检验
  checkNoSensitiveFields(result);

  return result;
}

/**
 * 生成阶段（Signer）：从候选列表生成 signerRef 输出
 *
 * @param {Array} candidates - 检索阶段的候选列表（需包含 signerRef 字段）
 * @param {Object} requirement - 输出要求 { cardinality: 'single'|'multi', ... }
 * @returns {Object} { ok: true, signerRefs: [...], resolutionMeta }
 * @throws {Error} 当无命中或多命中 single 模式时报错
 */
export function generateSignerFromCandidates(candidates = [], requirement = {}) {
  const cardinality = normalizeLower(requirement?.cardinality || "single") || "single";

  if (candidates.length === 0) {
    throw createResolveError("NO_MATCH", "未匹配到可用 signer", {
      candidateCount: 0,
    });
  }

  if (cardinality === "single" && candidates.length > 1) {
    throw createResolveError("MULTIPLE_MATCH", "命中多个 signer，请补充约束", {
      count: candidates.length,
    });
  }

  const picked = cardinality === "single"
    ? [candidates[0]]
    : candidates;

  const signerRefs = picked
    .map((c) => normalizeText(c.signerRef))
    .filter(Boolean);

  if (signerRefs.length === 0) {
    throw createResolveError("NO_SIGNER_REF", "候选中不含 signerRef", {
      candidateCount: candidates.length,
    });
  }

  // 收集 paths 和 signerTypes
  const paths = picked
    .map((c) => normalizeText(c.path))
    .filter(Boolean);

  const signerTypes = [...new Set(
    picked
      .map((c) => normalizeText(c.signerType))
      .filter(Boolean),
  )];

  const result = {
    ok: true,
    kind: "signer",
    cardinality,
    signerRefs,
    chain: picked[0].chain || null,
    addresses: picked.map((c) => c.address),
    ...(paths.length > 0 && { paths }),
    ...(signerTypes.length > 0 && { signerTypes }),
    resolutionMeta: {
      candidateCount: candidates.length,
      selectedCount: picked.length,
      source: "wallet-engine",
      signerCount: signerRefs.length,
    },
  };

  // 安全检验：确保输出中没有敏感字段
  checkNoSensitiveFields(result);

  return result;
}

function normalizeChainRequests(chains) {
  if (!Array.isArray(chains) || chains.length === 0) {
    return [];
  }

  const normalized = [];
  for (const item of chains) {
    if (typeof item === "string") {
      const chain = normalizeLower(item);
      if (chain) {
        normalized.push({ chain, addressTypes: null });
      }
      continue;
    }

    if (item && typeof item === "object") {
      const chain = normalizeLower(item?.chain);
      if (!chain) continue;
      const addressTypes = Array.isArray(item?.addressTypes)
        ? item.addressTypes.map((v) => normalizeLower(v)).filter(Boolean)
        : null;
      normalized.push({ chain, addressTypes });
    }
  }

  return normalized;
}

function inferIndexFromPath(pathValue) {
  const path = normalizeText(pathValue);
  if (!path) return null;
  const parts = path.split("/");
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function normalizeAddressForCompare(chain, address) {
  const text = normalizeText(address);
  if (!text) return "";
  const c = normalizeLower(chain);
  if (c === "evm") {
    return text.toLowerCase();
  }
  return text;
}

function buildOccupiedAddressSet(addresses = []) {
  const occupied = new Set();
  for (const row of addresses) {
    const chain = normalizeLower(row?.chain);
    const address = normalizeAddressForCompare(chain, row?.address);
    if (chain && address) {
      occupied.add(`${chain}:${address}`);
    }
  }
  return occupied;
}

function collectUsedIndices(rows = []) {
  const used = new Set();
  for (const row of rows) {
    const direct = Number(row?.index);
    const inferred = inferIndexFromPath(row?.path);
    const index = Number.isInteger(direct) && direct >= 0 ? direct : inferred;
    if (Number.isInteger(index) && index >= 0) {
      used.add(index);
    }
  }
  return used;
}

function resolveSignerTypeByChain(chain, fallback = null) {
  if (fallback) return fallback;
  const c = normalizeLower(chain);
  if (c === "evm") return "ethers-signer";
  if (c === "trx") return "tronweb-signer";
  if (c === "btc") return "btc-signer";
  return null;
}

function toWalletAddressRecord(item = {}, keyMeta = {}, fallback = {}) {
  const chain = normalizeLower(item?.chain || fallback?.chain);
  const indexRaw = Number(item?.index);
  const index = Number.isInteger(indexRaw) && indexRaw >= 0
    ? indexRaw
    : inferIndexFromPath(item?.path ?? fallback?.path);
  const keyId = normalizeText(item?.keyId || keyMeta?.keyId || fallback?.keyId) || null;
  const signerSuffix = (index ?? normalizeText(item?.name)) || "addr";
  const signerRef = normalizeText(item?.signerRef || fallback?.signerRef)
    || (keyId && chain ? `${chain}:${keyId}:${signerSuffix}` : null);

  return {
    chain,
    address: normalizeText(item?.address || fallback?.address) || null,
    addressType: normalizeLower(item?.addressType || item?.type || fallback?.addressType) || null,
    signerRef,
    signerType: resolveSignerTypeByChain(chain, normalizeText(item?.signerType || fallback?.signerType) || null),
    index,
    path: normalizeText(item?.path || fallback?.path) || null,
    source: normalizeLower(item?.source || fallback?.source) || "existing",
    name: normalizeText(item?.name || fallback?.name || keyMeta?.name || keyMeta?.keyName) || null,
    keyId,
  };
}

function hasKeySelectorFilter(selectors = {}) {
  return [
    selectors?.keyId,
    selectors?.name,
    selectors?.keyName,
    selectors?.keyType,
    selectors?.type,
    selectors?.source,
    selectors?.status,
  ].some((v) => normalizeText(v));
}

function collectKeyIdsByAddressName(selectors = {}, addresses = []) {
  const targetName = normalizeText(selectors?.name || selectors?.keyName);
  if (!targetName) return [];

  const target = normalizeLower(targetName);
  const nameExact = Boolean(selectors?.nameExact);
  const ids = new Set();

  for (const row of asArray(addresses)) {
    const keyId = normalizeText(row?.keyId);
    if (!keyId) continue;

    const candidate = normalizeLower(row?.keyName || row?.name);
    if (!candidate) continue;

    const matched = nameExact ? candidate === target : candidate.includes(target);
    if (matched) {
      ids.add(keyId);
    }
  }

  return Array.from(ids);
}

function deriveMissingRecords({
  keyId,
  keyMeta,
  chain,
  addressType = null,
  needed = 1,
  occupiedAddressSet,
  usedIndexSet,
  startIndex = 0,
  maxAttempts = 128,
  deriveAddress,
}) {
  if (typeof deriveAddress !== "function" || needed <= 0) {
    return [];
  }

  const records = [];
  let cursor = Math.max(0, Number(startIndex) || 0);
  let attempts = 0;

  while (records.length < needed && attempts < maxAttempts) {
    attempts += 1;

    if (usedIndexSet.has(cursor)) {
      cursor += 1;
      continue;
    }

    let raw;
    try {
      raw = deriveAddress({
        keyId,
        key: keyMeta,
        chain,
        addressType,
        index: cursor,
      });
    } catch {
      cursor += 1;
      continue;
    }

    const row = typeof raw === "string"
      ? {
        keyId,
        chain,
        addressType,
        address: raw,
        index: cursor,
        source: "derived",
      }
      : {
        keyId,
        chain,
        addressType,
        index: cursor,
        source: "derived",
        ...(raw && typeof raw === "object" ? raw : {}),
      };

    const candidate = toWalletAddressRecord(row, keyMeta, {
      source: "derived",
      chain,
      addressType,
      keyId,
      index: cursor,
    });

    if (!candidate.address || !candidate.chain) {
      cursor += 1;
      continue;
    }

    const compareAddress = normalizeAddressForCompare(candidate.chain, candidate.address);
    const compareKey = `${candidate.chain}:${compareAddress}`;
    if (!compareAddress || occupiedAddressSet.has(compareKey)) {
      cursor += 1;
      continue;
    }

    occupiedAddressSet.add(compareKey);
    usedIndexSet.add(candidate.index ?? cursor);
    records.push(candidate);
    cursor += 1;
  }

  return records;
}

export function prepareWalletCandidates(request = {}, walletStatus = {}) {
  const outputs = request?.outputs && typeof request.outputs === "object"
    ? request.outputs
    : request?.outps && typeof request.outps === "object"
      ? request.outps
      : {};
  const selectors = request?.selectors && typeof request.selectors === "object"
    ? request.selectors
    : request?.keyFilters && typeof request.keyFilters === "object"
      ? request.keyFilters
      : {};

  const deriveEnabled = outputs?.derive !== false;
  const deriveAddress = typeof outputs?.deriveAddress === "function" ? outputs.deriveAddress : null;
  const deriveCountRaw = Number(outputs?.deriveCount ?? outputs?.derive?.count ?? 1);
  const deriveCount = Number.isInteger(deriveCountRaw) && deriveCountRaw > 0 ? deriveCountRaw : 1;
  const deriveStartIndexRaw = Number(outputs?.deriveStartIndex ?? outputs?.derive?.startIndex ?? 0);
  const deriveStartIndex = Number.isInteger(deriveStartIndexRaw) && deriveStartIndexRaw >= 0 ? deriveStartIndexRaw : 0;

  const keys = asArray(walletStatus?.keys);
  const addresses = asArray(walletStatus?.addresses);
  const occupiedAddressSet = buildOccupiedAddressSet(addresses);

  const selectedKeys = retrieveWalletKeyCandidates(selectors, walletStatus);
  const hasSelector = hasKeySelectorFilter(selectors);
  const keyIdSelector = normalizeText(selectors?.keyId);
  const selectedKeyIds = selectedKeys.map((k) => k.keyId).filter(Boolean);
  const addressNameMatchedKeyIds = selectedKeyIds.length === 0
    && !keyIdSelector
    ? collectKeyIdsByAddressName(selectors, addresses)
    : [];

  const targetKeyIds = hasSelector
    ? (selectedKeyIds.length > 0 ? selectedKeyIds : addressNameMatchedKeyIds)
    : Array.from(new Set(addresses.map((row) => normalizeText(row?.keyId)).filter(Boolean)));

  const requestedChains = normalizeChainRequests(outputs?.chains);

  return targetKeyIds.map((keyId) => {
    const keyMeta = selectedKeys.find((k) => k.keyId === keyId)
      ?? keys.find((k) => normalizeText(k?.keyId) === keyId)
      ?? { keyId };

    const keyName = normalizeText(keyMeta?.keyName || keyMeta?.name);
    let keyRows = addresses.filter((row) => normalizeText(row?.keyId) === keyId);
    // Some wallet snapshots keep address rows under keyName-linked records.
    // Keep existing-first behavior, but fallback to keyName mapping when keyId has no rows.
    if (keyRows.length === 0 && keyName) {
      keyRows = addresses.filter(
        (row) => normalizeText(row?.keyName || row?.name) === keyName,
      );
    }
    const usedIndexSet = collectUsedIndices(keyRows);

    const chainRequests = requestedChains.length > 0
      ? requestedChains
      : Array.from(new Set(
        keyRows.map((row) => normalizeLower(row?.chain)).filter(Boolean),
      )).map((chain) => ({ chain, addressTypes: null }));

    const addressRecords = [];
    for (const req of chainRequests) {
      const chain = normalizeLower(req?.chain);
      if (!chain) continue;

      const rowsByChain = keyRows.filter((row) => normalizeLower(row?.chain) === chain);

      if (chain === "btc") {
        const existingTypes = Array.from(new Set(
          rowsByChain.map((row) => normalizeLower(row?.addressType || row?.type || "default")).filter(Boolean),
        ));
        const effectiveTypes = Array.isArray(req?.addressTypes) && req.addressTypes.length > 0
          ? req.addressTypes
          : existingTypes.length > 0
            ? existingTypes
            : ["p2wpkh"];

        for (const type of effectiveTypes) {
          const rowsByType = rowsByChain.filter(
            (row) => normalizeLower(row?.addressType || row?.type || "default") === type,
          );
          const current = rowsByType.map((row) => toWalletAddressRecord(row, keyMeta, { source: "existing" }));
          addressRecords.push(...current);

          if (deriveEnabled && deriveAddress && current.length < deriveCount) {
            const missing = deriveCount - current.length;
            const derived = deriveMissingRecords({
              keyId,
              keyMeta,
              chain,
              addressType: type,
              needed: missing,
              occupiedAddressSet,
              usedIndexSet,
              startIndex: deriveStartIndex,
              deriveAddress,
            });
            addressRecords.push(...derived);
          }
        }
        continue;
      }

      const current = rowsByChain.map((row) => toWalletAddressRecord(row, keyMeta, { source: "existing" }));
      addressRecords.push(...current);

      if (deriveEnabled && deriveAddress && current.length < deriveCount) {
        const missing = deriveCount - current.length;
        const derived = deriveMissingRecords({
          keyId,
          keyMeta,
          chain,
          addressType: null,
          needed: missing,
          occupiedAddressSet,
          usedIndexSet,
          startIndex: deriveStartIndex,
          deriveAddress,
        });
        addressRecords.push(...derived);
      }
    }

    const stableRecords = addressRecords
      .filter((row) => row?.chain && row?.address)
      .sort((a, b) => {
        if (a.chain !== b.chain) return a.chain.localeCompare(b.chain);
        const ai = Number.isInteger(a.index) ? a.index : Number.MAX_SAFE_INTEGER;
        const bi = Number.isInteger(b.index) ? b.index : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return a.address.localeCompare(b.address);
      });

    const signer = outputs?.signer
      ? stableRecords.length > 0
        ? { ref: stableRecords[0].signerRef, type: stableRecords[0].signerType }
        : null
      : null;

    return {
      name: normalizeText(keyMeta?.name || keyMeta?.keyName) || null,
      key: {
        keyId: normalizeText(keyMeta?.keyId || keyId) || null,
        keyName: normalizeText(keyMeta?.keyName || keyMeta?.name) || null,
        keyType: normalizeText(keyMeta?.keyType || keyMeta?.type) || null,
        source: normalizeText(keyMeta?.source) || null,
        status: normalizeText(keyMeta?.status) || null,
      },
      signer,
      addresses: stableRecords,
    };
  });
}

function flattenWalletCandidates(candidates = []) {
  const rows = [];

  for (const item of asArray(candidates)) {
    const key = item?.key && typeof item.key === "object" ? item.key : {};
    const addresses = asArray(item?.addresses);

    for (const addr of addresses) {
      const normalized = addr && typeof addr === "object" ? addr : {};
      rows.push({
        ...normalized,
        keyId: normalizeText(normalized?.keyId || key?.keyId) || null,
        keyName: normalizeText(key?.keyName || item?.name) || null,
        keyType: normalizeText(key?.keyType) || null,
        keySource: normalizeText(key?.source) || null,
        keyStatus: normalizeText(key?.status) || null,
        signerRef: normalizeText(normalized?.signerRef || item?.signer?.ref) || null,
        signerType: normalizeText(normalized?.signerType || item?.signer?.type) || null,
      });
    }
  }

  return rows;
}

export function pickWallet(request = {}, walletStatus = {}) {
  const scope = normalizeLower(request?.scope) || "single";
  const outputs = request?.outputs && typeof request.outputs === "object"
    ? request.outputs
    : request?.outps && typeof request.outps === "object"
      ? request.outps
      : {};
  const flatten = outputs?.flatten === true;

  const groupedCandidates = prepareWalletCandidates(request, walletStatus);
  const candidates = flatten ? flattenWalletCandidates(groupedCandidates) : groupedCandidates;

  if (scope === "all") {
    return candidates;
  }
  return candidates.length > 0 ? [candidates[0]] : [];
}

function buildResolvedInput(input = {}) {
  const defaults = input?.defaults && typeof input.defaults === "object" ? input.defaults : {};
  const inputs = input?.inputs && typeof input.inputs === "object" ? input.inputs : {};
  const args = input?.args && typeof input.args === "object" ? input.args : {};
  return { ...defaults, ...inputs, ...args };
}

function collectCandidates(resolved = {}, walletStatus = {}) {
  const statusAddresses = asArray(walletStatus?.addresses)
    .map((item) => toAddressCandidate(item))
    .filter(Boolean);

  const directAddress = normalizeText(resolved?.address);
  const directKeyId = normalizeText(resolved?.keyId);
  const directName = normalizeLower(resolved?.name);
  const directChain = normalizeLower(resolved?.chain);

  let candidates = statusAddresses;

  if (directAddress) {
    const hit = statusAddresses.find((item) => item.address === directAddress);
    if (hit) {
      return [hit];
    }
    return [{
      keyId: directKeyId || null,
      keyName: null,
      chain: directChain || null,
      address: directAddress,
      name: directName || null,
      path: null,
    }];
  }

  if (directKeyId) {
    candidates = candidates.filter((item) => item.keyId === directKeyId);
  }

  if (directName) {
    candidates = candidates.filter((item) => normalizeLower(item?.name).includes(directName));
  }

  if (directChain) {
    candidates = candidates.filter((item) => item.chain === directChain);
  }

  // 兼容 inputs.targets（可能只有 keyId）：有 targets 时始终参与约束
  const targets = asArray(resolved?.targets);
  const targetAddresses = targets
    .map((item) => normalizeText(item?.address))
    .filter(Boolean);
  const targetKeyIds = targets
    .map((item) => normalizeText(item?.keyId))
    .filter(Boolean);

  if (targetAddresses.length > 0) {
    const addressSet = new Set(targetAddresses);
    const filtered = candidates.filter((item) => addressSet.has(item.address));
    if (filtered.length > 0) {
      candidates = filtered;
    } else {
      candidates = targetAddresses.map((address) => {
        const hit = statusAddresses.find((item) => item.address === address);
        return hit ?? {
          keyId: null,
          keyName: null,
          chain: directChain || null,
          address,
          name: null,
          path: null,
        };
      });
    }
  }

  if (targetKeyIds.length > 0) {
    const keySet = new Set(targetKeyIds);
    candidates = candidates.filter((item) => keySet.has(item.keyId));
  }

  return candidates;
}

/**
 * 原 resolveSearchAddressRequest 改为使用新的两步 API
 *
 * @param {Object} input - { inputs, defaults, args, requirement, walletStatus }
 * @returns {Object} { ok, addresses, query, chain, network, resolutionMeta }
 */
export function resolveSearchAddressRequest(input = {}) {
  const requirement = resolveRequirement(input);
  const resolved = buildResolvedInput(input);
  
  // 使用旧的 collectCandidates 保持兼容（内部逻辑），然后调用新的生成阶段
  const candidates = collectCandidates(resolved, input?.walletStatus);

  // 调用生成阶段
  const generated = generateAddressFromCandidates(candidates, requirement);

  // 添加额外字段
  return {
    ...generated,
    network: normalizeLower(resolved?.network) || null,
  };
}

/**
 * Signer 解析接口：从 wallet 状态解析 signer 引用
 *
 * 使用与 resolveSearchAddressRequest 相同的过滤逻辑，但返回 signerRef 而非 address
 *
 * @param {Object} input - { inputs, defaults, args, requirement, walletStatus, walletTree }
 *   - walletStatus: { addresses: [...] } 地址列表
 *   - walletTree: 包含 signer 引用的钱包树（可选）
 *   - requirement: { kind: 'signer', cardinality: 'single'|'multi' }
 * @returns {Object} { ok, signerRefs: [...], chain, resolutionMeta }
 */
export function resolveSignerRefs(input = {}) {
  const requirement = resolveRequirement(input);
  
  if (requirement.kind !== "signer") {
    throw createResolveError("INVALID_REQUIREMENT_KIND", `resolveSignerRefs 需要 kind='signer'`);
  }

  const resolved = buildResolvedInput(input);
  
  // 使用相同的检索逻辑
  const candidates = collectCandidates(resolved, input?.walletStatus);

  // 调用生成阶段（signer）
  const generated = generateSignerFromCandidates(candidates, requirement);

  // 添加额外字段
  return {
    ...generated,
    network: normalizeLower(resolved?.network) || null,
  };
}
