import path from "node:path";
import { HDNodeWallet, Wallet } from "ethers";

import { loadKeyQueueFromStoredFile, revealStoredFileContent } from "../../modules/key/store.mjs";
import { buildWalletTree } from "../../modules/wallet-tree/index.mjs";
import {
  normalizeStringList,
  normalizeTags,
  normalizeScope,
  buildKeyId,
  normalizeSecp256k1PrivateKey,
  defaultDerivationPathByChain,
  normalizePathList,
  normalizeChainRequests,
} from "./utils.mjs";
import {
  parseAddressConfigsFromText,
  parseDirectiveParams,
  expandDirective,
  resolveWildcardPath,
  expandPathRange,
  validateBtcPurposeMatch,
} from "./address-config.mjs";
import { createProviderOps } from "./provider-ops.mjs";
import {
  ensureRequestedAddressesForRecord,
  collectDerivedAddressesFromSession,
} from "./tree-cache.mjs";
import { createCatalogOps } from "./catalog-ops.mjs";

const DEFAULT_UNLOCK_TTL_MS = 10 * 60 * 1000;

// ──────────────────── 预定义开发用密钥 ────────────────────────
const DEV_KEYS = [
  // Hardhat 默认助记词
  {
    name: "hardhat-default",
    secret: "test test test test test test test test test test test junk",
    type: "mnemonic",
    tags: ["hardhat", "test"],
  },
  // 测试用私钥（Hardhat 账户 0）
  {
    name: "hardhat-account-0",
    secret: "0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02d5d8f3e1f2c3d",
    type: "privateKey",
    tags: ["hardhat", "test", "account-0"],
  },
  // 测试用私钥（Hardhat 账户 1）
  {
    name: "hardhat-account-1",
    secret: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    type: "privateKey",
    tags: ["hardhat", "test", "account-1"],
  },
];

export function createWallet(options = {}) {
  const baseDir = path.resolve(String(options.baseDir ?? process.cwd()));
  const keyCatalog = new Map();
  const sessions = new Map();
  const providerRegistry = new Map();
  
  // ──────────────────── Tree Snapshot Cache ────────────────────
  let treeSnapshotCache = null; // Cache entire tree snapshot
  let cacheInvalidated = true; // Start with invalid cache
  const providerOps = createProviderOps(providerRegistry);

  function cleanupExpiredSession(keyId) {
    const session = sessions.get(keyId);
    if (!session) {
      return null;
    }

    if (Date.now() >= session.expiresAtMs) {
      sessions.delete(keyId);
      return null;
    }

    return session;
  }

  const catalogOps = createCatalogOps({
    baseDir,
    keyCatalog,
    cleanupExpiredSession,
    normalizeStringList,
    normalizeTags,
    buildKeyId,
    loadKeyQueueFromStoredFile,
    DEV_KEYS,
  });
  const getRecordOrThrow = catalogOps.getRecordOrThrow;
  const findSecretByKeyId = catalogOps.findSecretByKeyId;
  const loadKeyFile = catalogOps.loadKeyFile;
  const listKeys = catalogOps.listKeys;
  const getKeyMeta = catalogOps.getKeyMeta;
  const loadDevKeys = catalogOps.loadDevKeys;

  function getSessionOrThrow(keyId) {
    const session = cleanupExpiredSession(keyId);
    if (!session) {
      throw new Error(`key 未解锁或会话已过期: ${keyId}`);
    }
    return session;
  }

  async function getSessionState(input = {}) {
    const record = getRecordOrThrow(input.keyId);
    const session = cleanupExpiredSession(record.keyId);

    return {
      ok: true,
      keyId: record.keyId,
      unlocked: Boolean(session),
      unlockedAt: session?.unlockedAt,
      expiresAt: session?.expiresAt,
      scope: session?.scope,
      tree: session?.tree,
    };
  }

  const registerProvider = providerOps.registerProvider;
  const listChains = providerOps.listChains;
  const supports = providerOps.supports;

  async function requireCapability(input = {}) {
    const keyId = String(input.keyId ?? "").trim();
    const chain = String(input.chain ?? "").trim();
    const operation = String(input.operation ?? "").trim();

    if (!keyId || !chain || !operation) {
      throw new Error("requireCapability 缺少必要参数（keyId/chain/operation）");
    }

    const record = getRecordOrThrow(keyId);
    if (!record.enabled) {
      throw new Error(`key 已禁用: ${keyId}`);
    }

    const provider = providerRegistry.get(chain);
    if (!provider) {
      throw new Error(`chain provider 未注册: ${chain}`);
    }
    if (!provider.supports(operation)) {
      throw new Error(`operation 不支持: ${chain}.${operation}`);
    }

    const session = getSessionOrThrow(keyId);
    const scope = session.scope ?? {};
    if (scope.chain && scope.chain !== chain) {
      throw new Error(`scope 限制: 不允许链 ${chain}`);
    }

    const target = input.target ?? {};
    if (scope.address && target.address && scope.address !== String(target.address)) {
      throw new Error("scope 限制: address 不匹配");
    }
    if (scope.contracts?.length && target.contract) {
      const contract = String(target.contract).toLowerCase();
      const allowedContracts = scope.contracts.map((v) => String(v).toLowerCase());
      if (!allowedContracts.includes(contract)) {
        throw new Error("scope 限制: contract 不允许");
      }
    }
    if (scope.selectors?.length && target.selector) {
      const selector = String(target.selector).toLowerCase();
      const allowedSelectors = scope.selectors.map((v) => String(v).toLowerCase());
      if (!allowedSelectors.includes(selector)) {
        throw new Error("scope 限制: selector 不允许");
      }
    }

    return {
      ok: true,
      allowed: true,
    };
  }

  async function audit(event = {}) {
    if (typeof options.onAudit === "function") {
      await options.onAudit({ ...event });
    }
  }

  async function withUnlockedSecret(input = {}, executor) {
    if (typeof executor !== "function") {
      throw new Error("executor 必须是函数");
    }

    await requireCapability(input);

    const keyId = String(input.keyId ?? "").trim();
    const record = getRecordOrThrow(keyId);
    const session = getSessionOrThrow(keyId);

    let secret;
    if (record.source === "dev") {
      secret = {
        type: record.type,
        value: record._devSecret,
        name: record.name,
      };
    } else {
      secret = await findSecretByKeyId(record, session.password ?? "");
    }

    try {
      return await executor(secret);
    } finally {
      if (secret && typeof secret === "object") {
        secret.value = undefined;
      }
    }
  }

  function deriveKeyMaterialFromSecret(secret, input = {}) {
    if (!secret || typeof secret !== "object") {
      throw new Error("secret 无效");
    }

    if (secret.type === "mnemonic") {
      const phrase = String(secret.value ?? "").trim();
      if (!phrase) {
        throw new Error("mnemonic 不能为空");
      }

      const fallbackPath = defaultDerivationPathByChain(input);
      const paths = normalizePathList(input.path, input.paths, fallbackPath);
      const items = paths.map((derivePath) => ({
        path: derivePath,
        privateKeyHex: HDNodeWallet.fromPhrase(phrase, undefined, derivePath).privateKey,
      }));

      return {
        curve: "secp256k1",
        chain: String(input.chain ?? "").trim().toLowerCase(),
        sourceType: "mnemonic",
        privateKeyHex: items[0]?.privateKeyHex,
        path: items[0]?.path,
        items,
      };
    }

    if (secret.type === "privateKey") {
      const privateKeyHex = normalizeSecp256k1PrivateKey(secret.value);
      return {
        curve: "secp256k1",
        chain: String(input.chain ?? "").trim().toLowerCase(),
        sourceType: "privateKey",
        privateKeyHex,
        path: null,
        items: [{ path: null, privateKeyHex }],
      };
    }

    throw new Error(`不支持的 secret type: ${String(secret.type ?? "unknown")}`);
  }

  async function deriveKeyMaterial(input = {}, provider = null) {
    const chain = String(input.chain ?? "").trim();
    const keyId = String(input.keyId ?? "").trim();
    const operation = String(input.operation ?? "getAddress").trim();

    if (!chain || !keyId) {
      throw new Error("deriveKeyMaterial 缺少必要参数（chain/keyId）");
    }

    return withUnlockedSecret(
      {
        keyId,
        chain,
        operation,
        target: input.target,
      },
      async (secret) => {
        const defaultDerive = (deriveInput = {}) => {
          return deriveKeyMaterialFromSecret(secret, {
            ...input,
            ...deriveInput,
          });
        };

        const chainEcProvider = provider?.ecProvider;
        if (chainEcProvider && typeof chainEcProvider.deriveKeyMaterial === "function") {
          return chainEcProvider.deriveKeyMaterial({
            secret,
            input,
            defaultDerive,
          });
        }

        return defaultDerive();
      },
    );
  }

  async function getSigner(input = {}) {
    const chain = String(input.chain ?? "").trim();
    const keyId = String(input.keyId ?? "").trim();
    if (!chain) {
      throw new Error("chain 不能为空");
    }
    if (!keyId) {
      throw new Error("keyId 不能为空");
    }

    const provider = providerRegistry.get(chain);
    if (!provider) {
      throw new Error(`chain provider 未注册: ${chain}`);
    }

    const record = getRecordOrThrow(keyId);
    if (!record.enabled) {
      throw new Error(`key 已禁用: ${keyId}`);
    }

    const providerContext = {
      withUnlockedSecret,
      requireCapability,
      audit,
      getKeyMeta,
      deriveKeyMaterial: (deriveInput = {}) => {
        return deriveKeyMaterial(
          {
            ...deriveInput,
            chain,
            keyId,
          },
          provider,
        );
      },
    };

    const signer = await provider.createSigner({
      wallet: providerContext,
      keyId,
      rpc: input.rpc,
      options: input.options,
    });

    return {
      ok: true,
      signer,
    };
  }

  async function unlock(input = {}) {
    const record = getRecordOrThrow(input.keyId);
    if (!record.enabled) {
      throw new Error(`key 已禁用: ${record.keyId}`);
    }
    const rebuildTree = input.rebuildTree !== false;
    // Dev keys 无需密码
    if (record.source === "dev") {
      const ttlMs = Number.isFinite(input.ttlMs) && Number(input.ttlMs) > 0
        ? Number(input.ttlMs)
        : DEFAULT_UNLOCK_TTL_MS;
      const unlockedAt = new Date();
      const expiresAtMs = unlockedAt.getTime() + ttlMs;
      const scope = normalizeScope(input.scope);

      sessions.set(record.keyId, {
        keyId: record.keyId,
        password: null,  // dev keys 无密码
        unlockedAt: unlockedAt.toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresAtMs,
        reason: input.reason ? String(input.reason) : undefined,
        scope,
        _configuredAddresses: [], // dev keys 无文件指令，地址为空
      });

      const session = sessions.get(record.keyId);
      // Invalidate tree cache when unlocking new key
      cacheInvalidated = true;
      let tree = null;
      if (rebuildTree) {
        tree = await buildWalletTreeSnapshot();
        session.tree = tree;
      }
      return {
        ok: true,
        keyId: record.keyId,
        unlockedAt: session.unlockedAt,
        expiresAt: session.expiresAt,
        scope: session.scope,
        source: "dev",
        tree,
      };
    }

    // 加密密钥需要密码
    const password = String(input.password ?? "").trim();
    if (!password) {
      throw new Error("password 不能为空");
    }

    try {
      await loadKeyQueueFromStoredFile({
        storedFile: record.sourceFileAbs,
        password,
      });
    } catch (error) {
      throw new Error(`key 解锁失败: ${record.keyId}`);
    }

    const ttlMs = Number.isFinite(input.ttlMs) && Number(input.ttlMs) > 0
      ? Number(input.ttlMs)
      : DEFAULT_UNLOCK_TTL_MS;
    const unlockedAt = new Date();
    const expiresAtMs = unlockedAt.getTime() + ttlMs;
    const scope = normalizeScope(input.scope);

    sessions.set(record.keyId, {
      keyId: record.keyId,
      password,
      unlockedAt: unlockedAt.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      reason: input.reason ? String(input.reason) : undefined,
      scope,
    });

    const session = sessions.get(record.keyId);
    // 只为本 key 派生地址并缓存，后续 buildWalletTreeSnapshot 读缓存而非重派生所有 key
    if (providerRegistry.size > 0) {
      try {
        const singleDerived = await deriveConfiguredAddresses({ keyId: record.keyId, strict: false });
        session._configuredAddresses = Array.isArray(singleDerived?.items) ? singleDerived.items : [];
      } catch {
        session._configuredAddresses = [];
      }
    }
    let tree = null;
    // Invalidate tree cache when unlocking new key
    cacheInvalidated = true;
    if (rebuildTree) {
      tree = await buildWalletTreeSnapshot();
      session.tree = tree;
    }
    return {
      ok: true,
      keyId: record.keyId,
      unlockedAt: session.unlockedAt,
      expiresAt: session.expiresAt,
      scope: session.scope,
      tree,
    };
  }

  async function lock(input = {}) {
    const record = getRecordOrThrow(input.keyId);
    sessions.delete(record.keyId);
    // Invalidate tree cache when locking a key
    cacheInvalidated = true;
    return {
      ok: true,
      keyId: record.keyId,
      locked: true,
    };
  }

  async function lockAll() {
    const count = sessions.size;
    sessions.clear();
    // Invalidate tree cache when locking all keys
    cacheInvalidated = true;
    treeSnapshotCache = null;
    return {
      ok: true,
      count,
    };
  }

  // ──────────────────── deriveConfiguredAddresses ────────────────────────────

  /**
   * 为单个 key record 派生 @address-config 地址列表。
   * 返回 { items, warnings }
   */
  async function deriveForRecord(record, directives, strict) {
    const isMnemonicKey = record.type === "mnemonic";
    const network = "mainnet"; // 可扩展：从 directive 读取
    const items = [];
    const warnings = [];
    // 用于 privateKey 去重：Set<"chain:addressType">
    const seenPrivateKeyVariants = new Set();

    for (const directiveLine of directives) {
      const params = parseDirectiveParams(directiveLine);

      // 检查非法 type（如 "invalid-type"）
      if (record.type !== "mnemonic" && params.type) {
        // 允许继续，provider 会报错
      }

      const expanded = expandDirective(params);

      for (const { chain, addressType, pathPattern, name } of expanded) {
        // 检查 provider 是否已注册
        const provider = providerRegistry.get(chain);
        if (!provider) {
          warnings.push(`chain provider 未注册: ${chain}，跳过规则: ${directiveLine}`);
          continue;
        }

        // 解析路径通配符
        const resolvedPattern = resolveWildcardPath(pathPattern, chain, addressType, network);

        // 无路径时助记词补默认路径，privateKey 无需路径
        const effectivePattern = resolvedPattern
          ?? (isMnemonicKey ? defaultDerivationPathByChain({ chain, addressType }) : null);

        // 验证 BTC type/path 匹配
        if (chain === "btc" && addressType && effectivePattern) {
          const mismatch = validateBtcPurposeMatch(addressType, effectivePattern);
          if (mismatch) {
            warnings.push(mismatch);
            // path 优先：即使 type/path 不匹配也不中断，仅给出提示
          }
        }

        // 展开范围路径
        const pathItems = effectivePattern
          ? expandPathRange(effectivePattern, name)
          : [{ path: null, name }];

        for (const { path: derivePath, name: itemName } of pathItems) {
          // 对非助记词去重：只保留每个 (chain, addressType) 的第一次
          if (!isMnemonicKey) {
            const variantKey = `${chain}:${addressType ?? "_"}`;
            if (seenPrivateKeyVariants.has(variantKey)) continue;
            seenPrivateKeyVariants.add(variantKey);
          }

          // 调用 getSigner 获取地址
          let address;
          try {
            const { signer } = await getSigner({ chain, keyId: record.keyId });
            if (chain === "btc") {
              if (isMnemonicKey && derivePath) {
                address = await signer.getAddress({ addressType, path: derivePath });
              } else {
                // privateKey: 无需 path，btc provider 内部忽略 path for privateKey
                address = await signer.getAddress({ addressType });
              }
            } else {
              // evm / trx
              if (isMnemonicKey && derivePath) {
                address = await signer.getAddress({ path: derivePath });
              } else {
                address = await signer.getAddress({});
              }
            }
          } catch (err) {
            const msg = `派生地址失败 (${itemName ?? chain}): ${err.message}`;
            if (strict) throw new Error(msg);
            warnings.push(msg);
            continue;
          }

          items.push({
            keyId: record.keyId,
            keyName: record.name,
            chain,
            network,
            addressType: addressType ?? null,
            path: isMnemonicKey ? (derivePath ?? null) : null,
            name: itemName ?? null,
            address,
          });
        }
      }
    }

    return { items, warnings };
  }

  async function deriveConfiguredAddresses(input = {}) {
    const strict = Boolean(input.strict ?? false);

    // 批量模式：未传 keyId
    if (input.keyId === undefined) {
      const allResults = [];
      const allItems = [];
      const allWarnings = [];

      for (const record of keyCatalog.values()) {
        if (record.source === "dev") continue;
        const session = cleanupExpiredSession(record.keyId);
        if (!session || !session.password) continue;

        // 优先使用 unlock 时预缓存的派生地址，避免对已解锁 key 重复读文件
        if (Array.isArray(session._configuredAddresses)) {
          const items = session._configuredAddresses;
          if (items.length > 0) {
            allResults.push({ keyId: record.keyId, keyName: record.name, items, warnings: [] });
            allItems.push(...items);
          }
          continue;
        }

        // 无缓存时走文件派生（并写入缓存供后续调用复用）
        let directivesMap;
        try {
          const { content } = await revealStoredFileContent({
            storedFile: record.sourceFileAbs,
            password: session.password,
          });
          directivesMap = parseAddressConfigsFromText(content);
        } catch {
          continue;
        }

        const directives = directivesMap.get(record.name) ?? [];
        if (directives.length === 0) {
          session._configuredAddresses = [];
          continue;
        }

        const { items, warnings } = await deriveForRecord(record, directives, strict);
        session._configuredAddresses = items; // 缓存供后续复用
        allResults.push({ keyId: record.keyId, keyName: record.name, items, warnings });
        allItems.push(...items);
        allWarnings.push(...warnings);
      }

      return {
        ok: true,
        keyId: null,
        results: allResults,
        items: allItems,
        warnings: allWarnings,
      };
    }

    // 单 key 模式
    const keyId = String(input.keyId ?? "").trim();
    const record = getRecordOrThrow(keyId);
    const session = cleanupExpiredSession(record.keyId);
    if (!session) {
      throw new Error(`key 未解锁或会话已过期: ${record.keyId}`);
    }

    if (record.source === "dev" || !record.sourceFileAbs || !session.password) {
      return { ok: true, keyId: record.keyId, keyName: record.name, items: [], warnings: [] };
    }

    const { content } = await revealStoredFileContent({
      storedFile: record.sourceFileAbs,
      password: session.password,
    });

    const directivesMap = parseAddressConfigsFromText(content);
    const directives = directivesMap.get(record.name) ?? [];

    const { items, warnings } = await deriveForRecord(record, directives, strict);

    return {
      ok: true,
      keyId: record.keyId,
      keyName: record.name,
      items,
      warnings,
    };
  }

  async function buildWalletTreeSnapshot(input = {}) {
    const unlockedRecords = [...keyCatalog.values()]
      .filter((record) => Boolean(cleanupExpiredSession(record.keyId)));
    const chainRequests = normalizeChainRequests(input?.chains ?? input?.ensureChains);

    const keys = unlockedRecords.map((record) => ({
      keyId: record.keyId,
      keyName: record.name,
      keyType: record.type,
    }));

    const addresses = [];
    const warnings = [];

    for (const record of unlockedRecords) {
      const session = cleanupExpiredSession(record.keyId);
      if (!session) continue;

      if (!Array.isArray(session._configuredAddresses) && record.source !== "dev" && record.sourceFileAbs && session.password) {
        // 无缓存时（如直接调用 wallet.unlock() 未经 task 层）按单 key 派生并缓存
        try {
          const derived = await deriveConfiguredAddresses({ keyId: record.keyId, strict: false });
          const items = Array.isArray(derived?.items) ? derived.items : [];
          session._configuredAddresses = items;
          if (Array.isArray(derived?.warnings)) warnings.push(...derived.warnings);
        } catch (error) {
          warnings.push(String(error?.message ?? error));
        }
      }

      if (chainRequests.length > 0) {
        const ensured = await ensureRequestedAddressesForRecord(record, session, chainRequests, {
          hasProvider: (chain) => providerRegistry.has(chain),
          getSigner,
        });
        if (Array.isArray(ensured?.warnings) && ensured.warnings.length > 0) {
          warnings.push(...ensured.warnings);
        }
      }

      addresses.push(...collectDerivedAddressesFromSession(session));
    }

    const built = buildWalletTree({
      keys,
      addresses,
    });

    return {
      ok: true,
      action: "wallet.tree",
      tree: built.tree,
      counts: built.counts,
      warnings: [...(Array.isArray(built.warnings) ? built.warnings : []), ...warnings],
    };
  }

  async function getTree(input = {}) {
    // Use cache if available and no parameters (for now, simple caching strategy)
    const hasParams = (input?.chains?.length > 0) || (input?.ensureChains?.length > 0);
    
    if (!hasParams && !cacheInvalidated && treeSnapshotCache) {
      // Return cached result
      return treeSnapshotCache;
    }
    
    // Build tree snapshot
    const result = await buildWalletTreeSnapshot(input);
    
    // Cache it if no parameters
    if (!hasParams) {
      treeSnapshotCache = result;
      cacheInvalidated = false;
    }
    
    return result;
  }

  function invalidateTreeCache() {
    cacheInvalidated = true;
    treeSnapshotCache = null;
  }

  return {
    loadKeyFile,
    loadDevKeys,
    listKeys,
    getKeyMeta,
    unlock,
    lock,
    lockAll,
    getSessionState,
    registerProvider,
    listChains,
    supports,
    getSigner,
    deriveConfiguredAddresses,
    getTree,
    invalidateTreeCache,
  };
}

export default createWallet;