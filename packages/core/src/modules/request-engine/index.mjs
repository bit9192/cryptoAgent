function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fieldName} 必须是非空字符串`);
  }
}

function assertFunction(value, fieldName) {
  if (typeof value !== "function") {
    throw new TypeError(`${fieldName} 必须是函数`);
  }
}

function assertNonNegativeNumber(value, fieldName) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${fieldName} 必须是非负数字`);
  }
}

function isFresh(entry, nowMs) {
  return entry && typeof entry.expireAt === "number" && entry.expireAt > nowMs;
}

function normalizeFanoutMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) {
    return {};
  }
  return rawMap;
}

function resolveTtlPolicy(input = {}, defaultTtlMs) {
  const { ttlMs, ttlPolicy } = input;

  let requestTtlMs = defaultTtlMs;
  let chainTtlMs = defaultTtlMs;

  if (ttlMs != null) {
    assertNonNegativeNumber(ttlMs, "ttlMs");
    requestTtlMs = ttlMs;
    chainTtlMs = ttlMs;
  }

  if (ttlPolicy != null) {
    if (!ttlPolicy || typeof ttlPolicy !== "object" || Array.isArray(ttlPolicy)) {
      throw new TypeError("ttlPolicy 必须是对象");
    }
    if (ttlPolicy.requestTtlMs != null) {
      assertNonNegativeNumber(ttlPolicy.requestTtlMs, "ttlPolicy.requestTtlMs");
      requestTtlMs = ttlPolicy.requestTtlMs;
    }
    if (ttlPolicy.chainTtlMs != null) {
      assertNonNegativeNumber(ttlPolicy.chainTtlMs, "ttlPolicy.chainTtlMs");
      chainTtlMs = ttlPolicy.chainTtlMs;
    }
  }

  return {
    requestTtlMs,
    chainTtlMs,
  };
}

function deleteByPrefix(map, prefix) {
  let deletedCount = 0;
  for (const key of map.keys()) {
    if (key.startsWith(prefix)) {
      map.delete(key);
      deletedCount += 1;
    }
  }
  return deletedCount;
}

export function createRequestEngine(options = {}) {
  const {
    now = () => Date.now(),
    defaultTtlMs = 30_000,
  } = options;

  assertFunction(now, "now");

  const requestCache = new Map();
  const chainCache = new Map();
  const inFlight = new Map();

  const stats = {
    requestCacheHitCount: 0,
    chainCacheHitCount: 0,
    inFlightJoinCount: 0,
    fetchCount: 0,
    fanoutWriteCount: 0,
    invalidateCount: 0,
    invalidateByPrefixCount: 0,
  };

  function setRequestCache(requestKey, value, ttlMs) {
    const ttl = Number.isFinite(ttlMs) ? Math.max(0, ttlMs) : defaultTtlMs;
    const expireAt = now() + ttl;
    requestCache.set(requestKey, { value, expireAt });
  }

  function setChainCache(chainKey, value, ttlMs) {
    const ttl = Number.isFinite(ttlMs) ? Math.max(0, ttlMs) : defaultTtlMs;
    const expireAt = now() + ttl;
    chainCache.set(chainKey, { value, expireAt });
  }

  function getRequestCache(requestKey) {
    const entry = requestCache.get(requestKey);
    if (!isFresh(entry, now())) {
      if (entry) requestCache.delete(requestKey);
      return null;
    }
    stats.requestCacheHitCount += 1;
    return entry.value;
  }

  function getChainCache(chainKey) {
    const entry = chainCache.get(chainKey);
    if (!isFresh(entry, now())) {
      if (entry) chainCache.delete(chainKey);
      return null;
    }
    stats.chainCacheHitCount += 1;
    return entry.value;
  }

  async function fetchShared(input = {}) {
    const {
      requestKey,
      fetcher,
      fanout,
    } = input;
    const ttlPolicy = resolveTtlPolicy(input, defaultTtlMs);

    assertNonEmptyString(requestKey, "requestKey");
    assertFunction(fetcher, "fetcher");

    const cached = getRequestCache(requestKey);
    if (cached !== null) {
      return cached;
    }

    const pending = inFlight.get(requestKey);
    if (pending) {
      stats.inFlightJoinCount += 1;
      return pending;
    }

    const promise = (async () => {
      stats.fetchCount += 1;
      const response = await fetcher();
      setRequestCache(requestKey, response, ttlPolicy.requestTtlMs);

      if (fanout) {
        assertFunction(fanout, "fanout");
        const fanoutMap = normalizeFanoutMap(fanout(response));
        for (const [chainKey, chainSlice] of Object.entries(fanoutMap)) {
          if (!chainKey) continue;
          setChainCache(chainKey, chainSlice, ttlPolicy.chainTtlMs);
          stats.fanoutWriteCount += 1;
        }
      }

      return response;
    })();

    inFlight.set(requestKey, promise);

    try {
      return await promise;
    } finally {
      inFlight.delete(requestKey);
    }
  }

  async function getChainSlice(input = {}) {
    const {
      requestKey,
      chainKey,
      fetcher,
      fanout,
    } = input;
    const ttlPolicy = resolveTtlPolicy(input, defaultTtlMs);

    assertNonEmptyString(requestKey, "requestKey");
    assertNonEmptyString(chainKey, "chainKey");
    assertFunction(fetcher, "fetcher");
    assertFunction(fanout, "fanout");

    const chainCached = getChainCache(chainKey);
    if (chainCached !== null) {
      return chainCached;
    }

    const response = await fetchShared({
      requestKey,
      fetcher,
      fanout,
      ttlPolicy,
    });

    const chainAfterFanout = getChainCache(chainKey);
    if (chainAfterFanout !== null) {
      return chainAfterFanout;
    }

    const fallbackMap = normalizeFanoutMap(fanout(response));
    if (Object.prototype.hasOwnProperty.call(fallbackMap, chainKey)) {
      const value = fallbackMap[chainKey];
      setChainCache(chainKey, value, ttlPolicy.chainTtlMs);
      stats.fanoutWriteCount += 1;
      return value;
    }

    return null;
  }

  function invalidate(input = {}) {
    const {
      requestKey,
      chainKey,
      requestPrefix,
      chainPrefix,
      all = false,
    } = input;

    let requestDeleted = false;
    let chainDeleted = false;
    let requestDeletedCount = 0;
    let chainDeletedCount = 0;

    if (all) {
      requestDeleted = requestCache.size > 0;
      chainDeleted = chainCache.size > 0;
      requestDeletedCount = requestCache.size;
      chainDeletedCount = chainCache.size;
      requestCache.clear();
      chainCache.clear();
      stats.invalidateCount += 1;
      return {
        requestDeleted,
        chainDeleted,
        requestDeletedCount,
        chainDeletedCount,
      };
    }

    if (requestPrefix != null) {
      assertNonEmptyString(requestPrefix, "requestPrefix");
      requestDeletedCount += deleteByPrefix(requestCache, requestPrefix);
    }

    if (chainPrefix != null) {
      assertNonEmptyString(chainPrefix, "chainPrefix");
      chainDeletedCount += deleteByPrefix(chainCache, chainPrefix);
    }

    if (requestDeletedCount > 0 || chainDeletedCount > 0) {
      stats.invalidateByPrefixCount += 1;
    }

    if (requestKey != null) {
      assertNonEmptyString(requestKey, "requestKey");
      requestDeleted = requestCache.delete(requestKey);
      if (requestDeleted) requestDeletedCount += 1;
    }

    if (chainKey != null) {
      assertNonEmptyString(chainKey, "chainKey");
      chainDeleted = chainCache.delete(chainKey);
      if (chainDeleted) chainDeletedCount += 1;
    }

    requestDeleted = requestDeleted || requestDeletedCount > 0;
    chainDeleted = chainDeleted || chainDeletedCount > 0;

    stats.invalidateCount += 1;
    return {
      requestDeleted,
      chainDeleted,
      requestDeletedCount,
      chainDeletedCount,
    };
  }

  function getStats() {
    return {
      ...stats,
      requestCacheSize: requestCache.size,
      chainCacheSize: chainCache.size,
      inFlightSize: inFlight.size,
    };
  }

  return {
    fetchShared,
    getChainSlice,
    invalidate,
    getStats,
  };
}
