function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function deduplicateSearchItems(items = []) {
  const map = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const key = String(item?.id ?? "").trim();
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }

    // 优先级：confidence 高的优先
    const existingConfidence = Number(existing?.confidence ?? 0);
    const nextConfidence = Number(item?.confidence ?? 0);
    if (nextConfidence > existingConfidence) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

export function createTokenAggregator(searchers = []) {
  const registeredSearchers = Array.isArray(searchers) ? searchers : [];

  async function search(input = {}) {
    const results = [];

    // 并发调用所有 searcher
    const promises = registeredSearchers.map(async (searcher) => {
      if (!searcher || typeof searcher.search !== "function") {
        return [];
      }

      try {
        const rows = await searcher.search(input);
        return Array.isArray(rows) ? rows : [];
      } catch {
        // 单个 searcher 失败不影响其他
        return [];
      }
    });

    const allResults = await Promise.all(promises);

    // 合并所有结果
    for (const batch of allResults) {
      if (Array.isArray(batch)) {
        results.push(...batch);
      }
    }

    // 去重
    return deduplicateSearchItems(results);
  }

  return {
    search,
    registerSearcher(searcher) {
      if (searcher && typeof searcher.search === "function") {
        registeredSearchers.push(searcher);
      }
    },
  };
}

export default {
  createTokenAggregator,
};
