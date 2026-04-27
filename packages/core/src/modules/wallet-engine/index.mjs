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
