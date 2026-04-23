import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bs58 from "bs58";
import { HDNodeWallet, Wallet } from "ethers";

import { loadKeyQueueFromStoredFile, revealStoredFileContent } from "../../modules/key/store.mjs";

const DEFAULT_LOAD_SOURCE = "key";
const ENCRYPTED_FILE_SUFFIX = ".enc.json";
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

function normalizeStringList(input) {
  if (input == null) {
    return [];
  }

  if (Array.isArray(input)) {
    return input
      .flatMap((item) => normalizeStringList(item))
      .filter(Boolean);
  }

  const value = String(input).trim();
  return value ? [value] : [];
}

function normalizeTags(tags) {
  return Array.from(new Set(normalizeStringList(tags)));
}

function normalizeScope(scope = {}) {
  if (!scope || typeof scope !== "object") {
    return {};
  }

  const normalized = {};
  if (scope.chain) normalized.chain = String(scope.chain);
  if (scope.address) normalized.address = String(scope.address);

  const contracts = normalizeStringList(scope.contracts);
  if (contracts.length > 0) normalized.contracts = contracts;

  const selectors = normalizeStringList(scope.selectors);
  if (selectors.length > 0) normalized.selectors = selectors;

  return normalized;
}

function buildKeyId(entry) {
  return createHash("sha256")
    .update(`${entry.type}:${entry.secret}`)
    .digest("hex")
    .slice(0, 24);
}

function normalizeHexPrivateKey(raw) {
  const value = String(raw ?? "").trim();
  if (!value) {
    throw new Error("privateKey 不能为空");
  }
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("privateKey 格式无效（需 64 位 hex）");
  }
  return normalized;
}

function base58CheckDecode(text) {
  const raw = Buffer.from(bs58.decode(String(text ?? "").trim()));
  if (raw.length < 5) {
    throw new Error("WIF/Base58Check 长度无效");
  }

  const payload = raw.subarray(0, raw.length - 4);
  const checksum = raw.subarray(raw.length - 4);
  const expected = createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest()
    .subarray(0, 4);

  if (!checksum.equals(expected)) {
    throw new Error("WIF/Base58Check 校验失败");
  }

  return payload;
}

function normalizeSecp256k1PrivateKey(raw) {
  const value = String(raw ?? "").trim();
  if (!value) {
    throw new Error("privateKey 不能为空");
  }

  // WIF (compressed/uncompressed)
  if (/^[5KLc9][1-9A-HJ-NP-Za-km-z]{50,53}$/.test(value)) {
    const payload = base58CheckDecode(value);
    if (payload.length !== 33 && payload.length !== 34) {
      throw new Error("WIF payload 长度无效");
    }

    const keyBytes = payload.length === 34 ? payload.subarray(1, 33) : payload.subarray(1);
    return `0x${Buffer.from(keyBytes).toString("hex")}`;
  }

  return normalizeHexPrivateKey(value);
}

function normalizeBtcAddressType(input) {
  const raw = String(input ?? "p2pkh").trim().toLowerCase();
  if (raw === "legacy" || raw === "p2pkh") return "p2pkh";
  if (raw === "nested" || raw === "p2sh-p2wpkh" || raw === "p2sh") return "p2sh-p2wpkh";
  if (raw === "segwit" || raw === "p2wpkh" || raw === "bech32") return "p2wpkh";
  return "p2pkh";
}

function defaultDerivationPathByChain(input = {}) {
  const chain = String(input.chain ?? "").trim().toLowerCase();
  const network = String(input.network ?? "mainnet").toLowerCase();

  if (chain === "btc") {
    const coinType = network === "testnet" ? 1 : 0;
    const addressType = normalizeBtcAddressType(input.addressType);
    if (addressType === "p2wpkh") return `m/84'/${coinType}'/0'/0/0`;
    if (addressType === "p2sh-p2wpkh") return `m/49'/${coinType}'/0'/0/0`;
    return `m/44'/${coinType}'/0'/0/0`;
  }

  if (chain === "trx") {
    return "m/44'/195'/0'/0/0";
  }

  // evm and default secp256k1 chains
  return "m/44'/60'/0'/0/0";
}

function normalizePathList(pathInput, pathsInput, fallbackPath) {
  const out = [];
  if (Array.isArray(pathsInput)) {
    for (const item of pathsInput) {
      const value = String(item ?? "").trim();
      if (value) out.push(value);
    }
  }
  const single = String(pathInput ?? "").trim();
  if (single) out.push(single);

  const deduped = Array.from(new Set(out));
  if (deduped.length > 0) return deduped;
  return [fallbackPath];
}

async function walkEncryptedFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  for (const entry of entries) {
    const abs = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkEncryptedFiles(abs));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(ENCRYPTED_FILE_SUFFIX)) {
      files.push(abs);
    }
  }

  return files;
}

export function createWallet(options = {}) {
  const baseDir = path.resolve(String(options.baseDir ?? process.cwd()));
  const keyCatalog = new Map();
  const sessions = new Map();
  const providerRegistry = new Map();

  function toDisplayPath(targetPath) {
    const rel = path.relative(baseDir, targetPath);
    if (!rel || rel === "") {
      return ".";
    }
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return targetPath;
    }
    return rel;
  }

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

  function currentStatusForRecord(record) {
    if (!record.enabled) {
      return "disabled";
    }
    return cleanupExpiredSession(record.keyId) ? "unlocked" : "loaded";
  }

  function buildMeta(record) {
    return {
      keyId: record.keyId,
      name: record.name,
      type: record.type,
      source: record.source ?? "file",
      sourceFile: record.sourceFile,
      tags: [...record.tags],
      enabled: record.enabled,
      status: currentStatusForRecord(record),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  function getRecordOrThrow(keyId) {
    const normalizedKeyId = String(keyId ?? "").trim();
    if (!normalizedKeyId) {
      throw new Error("keyId 不能为空");
    }

    const record = keyCatalog.get(normalizedKeyId);
    if (!record) {
      throw new Error(`未找到 key: ${normalizedKeyId}`);
    }
    return record;
  }

  function getSessionOrThrow(keyId) {
    const session = cleanupExpiredSession(keyId);
    if (!session) {
      throw new Error(`key 未解锁或会话已过期: ${keyId}`);
    }
    return session;
  }

  async function findSecretByKeyId(record, password) {
    if (!record?.sourceFileAbs) {
      throw new Error(`key 缺少可读取的源文件: ${record?.keyId ?? "unknown"}`);
    }

    const parsed = await loadKeyQueueFromStoredFile({
      storedFile: record.sourceFileAbs,
      password,
    });

    for (const entry of parsed.entries) {
      const entryKeyId = buildKeyId(entry);
      if (entryKeyId === record.keyId) {
        return {
          type: entry.type,
          value: entry.secret,
          name: entry.name,
        };
      }
    }

    throw new Error(`未在源文件中找到 key: ${record.keyId}`);
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
    };
  }

  async function registerProvider(input = {}) {
    const provider = input?.provider;
    if (!provider || typeof provider !== "object") {
      throw new Error("provider 不能为空");
    }

    const chain = String(provider.chain ?? "").trim();
    if (!chain) {
      throw new Error("provider.chain 不能为空");
    }
    if (typeof provider.createSigner !== "function") {
      throw new Error(`provider.createSigner 必须是函数: ${chain}`);
    }

    const operations = Array.isArray(provider.operations)
      ? Array.from(new Set(provider.operations.map((op) => String(op).trim()).filter(Boolean)))
      : [];

    const replaced = providerRegistry.has(chain);
    if (replaced && !input.allowOverride) {
      throw new Error(`provider 已存在: ${chain}`);
    }

    const normalizedProvider = {
      ...provider,
      chain,
      operations,
      supports: typeof provider.supports === "function"
        ? provider.supports.bind(provider)
        : (operation) => operations.includes(String(operation ?? "")),
    };

    providerRegistry.set(chain, normalizedProvider);
    return {
      ok: true,
      chain,
      replaced,
    };
  }

  async function listChains() {
    const items = [...providerRegistry.values()]
      .map((provider) => ({
        chain: provider.chain,
        operations: [...provider.operations],
      }))
      .sort((a, b) => a.chain.localeCompare(b.chain));

    return {
      ok: true,
      items,
    };
  }

  async function supports(input = {}) {
    const chain = String(input.chain ?? "").trim();
    const operation = String(input.operation ?? "").trim();
    const provider = providerRegistry.get(chain);

    return {
      ok: true,
      chain,
      operation,
      supported: Boolean(provider && operation && provider.supports(operation)),
    };
  }

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

  async function collectStoredFiles(input = {}) {
    const rawSources = [
      ...normalizeStringList(input.file),
      ...normalizeStringList(input.files),
      ...normalizeStringList(input.path),
      ...normalizeStringList(input.paths),
      ...normalizeStringList(input.dir),
      ...normalizeStringList(input.dirs),
    ];
    const sources = rawSources.length > 0 ? rawSources : [DEFAULT_LOAD_SOURCE];
    const seen = new Set();
    const files = [];

    for (const source of sources) {
      const abs = path.resolve(baseDir, source);
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        throw new Error(`未找到 key 源路径: ${toDisplayPath(abs)}`);
      }

      if (stat.isDirectory()) {
        const nested = await walkEncryptedFiles(abs);
        for (const filePath of nested) {
          if (!seen.has(filePath)) {
            seen.add(filePath);
            files.push(filePath);
          }
        }
        continue;
      }

      if (stat.isFile()) {
        if (!abs.endsWith(ENCRYPTED_FILE_SUFFIX)) {
          throw new Error(`暂只支持加载 ${ENCRYPTED_FILE_SUFFIX} 文件: ${toDisplayPath(abs)}`);
        }
        if (!seen.has(abs)) {
          seen.add(abs);
          files.push(abs);
        }
        continue;
      }

      throw new Error(`不支持的 key 源路径: ${toDisplayPath(abs)}`);
    }

    if (files.length === 0) {
      throw new Error(`未找到任何 ${ENCRYPTED_FILE_SUFFIX} 文件`);
    }

    files.sort((a, b) => a.localeCompare(b));
    return files;
  }

  async function loadKeyFile(input = {}) {
    const password = String(input.password ?? "").trim();
    if (!password) {
      throw new Error("password 不能为空");
    }

    const files = await collectStoredFiles(input);
    const tags = normalizeTags(input.tags);
    const reload = Boolean(input.reload);
    const addedKeyIds = [];
    const skippedKeyIds = [];
    const warnings = [];
    let loaded = 0;

    for (const storedFile of files) {
      const parsed = await loadKeyQueueFromStoredFile({ storedFile, password });
      warnings.push(
        ...parsed.errors.map((message) => `${toDisplayPath(storedFile)}: ${message}`),
      );

      for (const entry of parsed.entries) {
        const keyId = buildKeyId(entry);
        const now = new Date().toISOString();
        const existing = keyCatalog.get(keyId);
        const mergedTags = Array.from(new Set([...(existing?.tags ?? []), ...tags]));

        if (existing && !reload) {
          skippedKeyIds.push(keyId);
          existing.tags = mergedTags;
          existing.updatedAt = now;
          continue;
        }

        keyCatalog.set(keyId, {
          keyId,
          name: entry.name,
          type: entry.type,
          sourceFile: toDisplayPath(storedFile),
          sourceFileAbs: storedFile,
          tags: mergedTags,
          enabled: true,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        loaded += 1;

        if (!existing) {
          addedKeyIds.push(keyId);
        }
      }
    }

    const result = {
      ok: true,
      loaded,
      addedKeyIds,
      skippedKeyIds: Array.from(new Set(skippedKeyIds)),
      files: files.map((filePath) => toDisplayPath(filePath)),
      warnings,
    };

    if (result.files.length === 1) {
      result.file = result.files[0];
    }

    return result;
  }

  async function listKeys(filter = {}) {
    const requiredTags = normalizeTags(filter.tags);
    const sourceFile = filter.sourceFile ? String(filter.sourceFile) : undefined;

    const items = [...keyCatalog.values()]
      .map((record) => buildMeta(record))
      .filter((item) => {
        if (filter.type && item.type !== filter.type) {
          return false;
        }
        if (typeof filter.enabled === "boolean" && item.enabled !== filter.enabled) {
          return false;
        }
        if (sourceFile && item.sourceFile !== sourceFile) {
          return false;
        }
        if (requiredTags.length > 0 && !requiredTags.every((tag) => item.tags.includes(tag))) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.keyId.localeCompare(b.keyId));

    return {
      ok: true,
      items,
      total: items.length,
    };
  }

  async function getKeyMeta(input = {}) {
    const record = getRecordOrThrow(input.keyId);
    return {
      ok: true,
      item: buildMeta(record),
    };
  }

  async function unlock(input = {}) {
    const record = getRecordOrThrow(input.keyId);
    if (!record.enabled) {
      throw new Error(`key 已禁用: ${record.keyId}`);
    }

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
      });

      const session = sessions.get(record.keyId);
      return {
        ok: true,
        keyId: record.keyId,
        unlockedAt: session.unlockedAt,
        expiresAt: session.expiresAt,
        scope: session.scope,
        source: "dev",
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
    return {
      ok: true,
      keyId: record.keyId,
      unlockedAt: session.unlockedAt,
      expiresAt: session.expiresAt,
      scope: session.scope,
    };
  }

  async function lock(input = {}) {
    const record = getRecordOrThrow(input.keyId);
    sessions.delete(record.keyId);
    return {
      ok: true,
      keyId: record.keyId,
      locked: true,
    };
  }

  async function lockAll() {
    const count = sessions.size;
    sessions.clear();
    return {
      ok: true,
      count,
    };
  }

  async function loadDevKeys(input = {}) {
    // 从预定义的 DEV_KEYS 中筛选和导入开发用密钥
    const selectedTags = normalizeTags(input.tags);
    const reload = Boolean(input.reload);
    const addedKeyIds = [];
    const skippedKeyIds = [];
    const loaded = 0;

    // 如果提供了 names，只导入指定的开发密钥；否则导入所有
    const selectedNames = normalizeStringList(input.names ?? input.name);
    const useAllKeys = selectedNames.length === 0;

    let addedCount = 0;
    const now = new Date().toISOString();

    for (const devKey of DEV_KEYS) {
      // 过滤：如果指定了名称，则只加载匹配的
      if (!useAllKeys && !selectedNames.includes(devKey.name)) {
        continue;
      }

      const keyId = buildKeyId(devKey);
      const existing = keyCatalog.get(keyId);
      const mergedTags = Array.from(
        new Set([...(existing?.tags ?? []), ...devKey.tags, ...selectedTags])
      );

      if (existing && !reload) {
        skippedKeyIds.push(keyId);
        existing.tags = mergedTags;
        existing.updatedAt = now;
        continue;
      }

      keyCatalog.set(keyId, {
        keyId,
        name: devKey.name,
        type: devKey.type,
        source: "dev",  // 标记为 dev 来源
        sourceFile: "<dev>",
        sourceFileAbs: null,
        tags: mergedTags,
        enabled: true,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        // 存储原始密钥，以便后续 getSigner 等操作使用
        _devSecret: devKey.secret,
      });
      addedCount += 1;

      if (!existing) {
        addedKeyIds.push(keyId);
      }
    }

    return {
      ok: true,
      loaded: addedCount,
      addedKeyIds,
      skippedKeyIds: Array.from(new Set(skippedKeyIds)),
      source: "dev",
    };
  }

  // ──────────────────── deriveConfiguredAddresses ────────────────────────────

  /**
   * 从原始密钥文档中提取指定 key 的 @address-config 指令行。
   * 返回 Map<keyName, string[]>。
   */
  function parseAddressConfigsFromText(rawText) {
    const rawLines = String(rawText ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n");

    function stripNoise(line) {
      return line.replace(/^(>\s*)+/, "").trim();
    }

    function looksLikeSecret(s) {
      if (/^(0x)?[a-fA-F0-9]{64}$/.test(s)) return true;
      if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(s)) return true;
      const words = s.split(/\s+/).filter((w) => /^[a-zA-Z]+$/.test(w));
      return words.length >= 12 && words.length <= 24;
    }

    const lines = rawLines.map((raw, idx) => ({ idx, trimmed: raw.trim() }));

    const secretIndices = lines
      .filter((l) => {
        const s = stripNoise(l.trimmed);
        return s && !l.trimmed.startsWith("#") && l.trimmed !== "" && looksLikeSecret(s);
      })
      .map((l) => l.idx);

    const result = new Map();

    for (let si = 0; si < secretIndices.length; si++) {
      const secretIdx = secretIndices[si];
      const nextSecretIdx = secretIndices[si + 1] ?? lines.length;

      // 向上找名称
      let name = null;
      for (let i = secretIdx - 1; i >= 0; i--) {
        const t = lines[i].trimmed;
        if (t === "" || t.startsWith("#")) continue;
        const s = stripNoise(t);
        if (looksLikeSecret(s)) break;
        name = t;
        break;
      }

      const directives = [];
      for (let i = secretIdx + 1; i < nextSecretIdx; i++) {
        const t = lines[i].trimmed;
        if (t.startsWith("@address-config")) {
          directives.push(t);
        }
      }

      if (name && directives.length > 0) {
        result.set(name, directives);
      }
    }

    return result;
  }

  /**
   * 解析单条 @address-config 指令参数。
   */
  function parseDirectiveParams(line) {
    const body = line.replace(/^@address-config\s*/, "").trim();
    const params = {};
    const regex = /(\w[\w-]*)=([\S]*)/g;
    let m;
    while ((m = regex.exec(body)) !== null) {
      params[m[1]] = m[2];
    }
    return params;
  }

  /**
   * 将 @address-config 指令展开为 { chain, addressType, pathPattern, name }[] 列表。
   * chain/type 支持逗号分隔的多值。
   */
  function expandDirective(params) {
    const rawChains = String(params.chain ?? "btc").split(",").map((s) => s.trim()).filter(Boolean);
    const rawTypes = params.type ? String(params.type).split(",").map((s) => s.trim()).filter(Boolean) : [null];
    const pathPattern = String(params.path ?? "").trim() || null;
    const nameTemplate = String(params.name ?? "").trim() || null;

    const expanded = [];
    for (const chain of rawChains) {
      for (const rawType of rawTypes) {
        let addressType = null;
        if (chain === "btc" && rawType) {
          const t = String(rawType).trim().toLowerCase();
          if (t === "p2wpkh" || t === "segwit" || t === "bech32") addressType = "p2wpkh";
          else if (t === "p2sh-p2wpkh" || t === "p2sh" || t === "nested") addressType = "p2sh-p2wpkh";
          else if (t === "p2tr" || t === "taproot") addressType = "p2tr";
          else if (t === "p2pkh" || t === "legacy") addressType = "p2pkh";
          else addressType = t; // keep as-is, will error when deriving
        } else if (chain === "btc") {
          addressType = "p2wpkh"; // default
        } else {
          addressType = null; // non-BTC doesn't use addressType
        }

        let name = nameTemplate;
        if (name) {
          name = name.replace(/\{type\}/g, addressType ?? "").replace(/\{chain\}/g, chain);
        }

        expanded.push({ chain, addressType, pathPattern, name });
      }
    }
    return expanded;
  }

  /**
   * 将通配符占位符替换为类型对应的实际值。
   * 路径规则：m/purpose'/coin_type'/account'/change/index
   * 支持：*' （带撇号）和 * （不带撇号）替换
   */
  function resolveWildcardPath(pathPattern, chain, addressType, network) {
    if (!pathPattern) return null;
    const isTestnet = String(network ?? "mainnet").toLowerCase() !== "mainnet";
    const coinType = isTestnet ? "1" : "0";

    let purposePrime;
    if (chain === "btc") {
      if (addressType === "p2wpkh") purposePrime = "84";
      else if (addressType === "p2sh-p2wpkh") purposePrime = "49";
      else if (addressType === "p2tr") purposePrime = "86";
      else purposePrime = "44"; // p2pkh
    } else if (chain === "trx") {
      purposePrime = "44";
    } else {
      // evm
      purposePrime = "44";
    }

    const segments = pathPattern.split("/");
    const resolved = segments.map((seg, i) => {
      // 处理带撇号的通配符 *'
      if (seg === "*'") {
        if (chain === "evm" || chain === "trx") {
          if (i === 1) return `${purposePrime}'`;
          if (i === 2) return chain === "evm" ? "60'" : "195'";
          if (i === 3) return "0'";
        } else {
          // btc
          if (i === 1) return `${purposePrime}'`;
          if (i === 2) return `${coinType}'`;
          if (i === 3) return "0'";
        }
      }
      // 处理不带撇号的通配符 * （change 字段，默认 0 表示接收地址）
      if (seg === "*") {
        if (i === 4) return "0";  // change/receive: 0 for receive
      }
      return seg;
    });
    return resolved.join("/");
  }

  /**
   * 将含范围 [start,end] 的路径展开为多条路径。
   * 同时生成对应的 name 后缀列表。
   * 返回 [{ path, nameSuffix }]
   */
  function expandPathRange(resolvedPath, baseName) {
    const rangeMatch = resolvedPath.match(/^(.*)\[(\d+),(\d+)\](.*)$/);
    if (!rangeMatch) {
      return [{ path: resolvedPath, name: baseName }];
    }

    const prefix = rangeMatch[1];
    const start = parseInt(rangeMatch[2], 10);
    const end = parseInt(rangeMatch[3], 10);
    const suffix = rangeMatch[4];

    if (start > end) return [];

    const items = [];
    for (let i = start; i <= end; i++) {
      items.push({
        path: `${prefix}${i}${suffix}`,
        name: baseName ? `${baseName}-${i}` : null,
      });
    }
    return items;
  }

  /**
   * 验证 BTC type 与 path purpose 是否匹配。
   * 返回错误消息字符串，或 null（无误）。
   */
  function validateBtcPurposeMatch(addressType, resolvedPath) {
    if (!resolvedPath) return null;
    const m = resolvedPath.match(/^m\/(\d+)'/);
    if (!m) return null;

    const purpose = parseInt(m[1], 10);
    const expected = { p2wpkh: 84, "p2sh-p2wpkh": 49, p2tr: 86, p2pkh: 44 };
    const expectedPurpose = expected[addressType];

    if (expectedPurpose !== undefined && purpose !== expectedPurpose) {
      return `type/path 不匹配: ${addressType} 期望 purpose ${expectedPurpose}', 实际为 ${purpose}'`;
    }
    return null;
  }

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
            if (strict) {
              throw new Error(mismatch);
            }
            warnings.push(mismatch);
            // 非 strict：继续派生（path 不匹配仍推导地址）
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

        // 获取原始内容，解析指令
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
        if (directives.length === 0) continue;

        const { items, warnings } = await deriveForRecord(record, directives, strict);
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
  };
}

export default createWallet;