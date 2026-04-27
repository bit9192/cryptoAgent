import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_LOAD_SOURCE = "key";
const ENCRYPTED_FILE_SUFFIX = ".enc.json";

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

export function createCatalogOps(deps = {}) {
  const {
    baseDir,
    keyCatalog,
    cleanupExpiredSession,
    normalizeStringList,
    normalizeTags,
    buildKeyId,
    loadKeyQueueFromStoredFile,
    DEV_KEYS,
  } = deps;

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

  async function findSecretByKeyId(record, password) {
    if (!record?.sourceFileAbs) {
      throw new Error(`key 缺少可读取的源文件: ${record?.keyId ?? "unknown"}`);
    }

    const parsed = await loadKeyQueueFromStoredFile({
      storedFile: record.sourceFileAbs,
      password,
    });

    for (const [entryIndex, entry] of parsed.entries.entries()) {
      const entryKeyId = buildKeyId(entry, {
        source: "file",
        sourceRef: record.sourceFileAbs,
        entryIndex,
      });
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
    const reloadedKeyIds = [];
    const skippedKeyIds = [];
    const warnings = [];
    let loaded = 0;

    for (const storedFile of files) {
      const parsed = await loadKeyQueueFromStoredFile({ storedFile, password });
      warnings.push(
        ...parsed.errors.map((message) => `${toDisplayPath(storedFile)}: ${message}`),
      );

      for (const [entryIndex, entry] of parsed.entries.entries()) {
        const keyId = buildKeyId(entry, {
          source: "file",
          sourceRef: storedFile,
          entryIndex,
        });
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
        } else {
          reloadedKeyIds.push(keyId);
        }
      }
    }

    const result = {
      ok: true,
      loaded,
      addedKeyIds,
      reloadedKeyIds: Array.from(new Set(reloadedKeyIds)),
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

  async function loadDevKeys(input = {}) {
    const selectedTags = normalizeTags(input.tags);
    const reload = Boolean(input.reload);
    const addedKeyIds = [];
    const skippedKeyIds = [];

    const selectedNames = normalizeStringList(input.names ?? input.name);
    const useAllKeys = selectedNames.length === 0;

    let addedCount = 0;
    const now = new Date().toISOString();

    for (const devKey of DEV_KEYS) {
      if (!useAllKeys && !selectedNames.includes(devKey.name)) {
        continue;
      }

      const keyId = buildKeyId(devKey, {
        source: "dev",
        sourceRef: "builtin",
        entryIndex: DEV_KEYS.indexOf(devKey),
      });
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
        source: "dev",
        sourceFile: "<dev>",
        sourceFileAbs: null,
        tags: mergedTags,
        enabled: true,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
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

  return {
    getRecordOrThrow,
    findSecretByKeyId,
    loadKeyFile,
    listKeys,
    getKeyMeta,
    loadDevKeys,
  };
}
