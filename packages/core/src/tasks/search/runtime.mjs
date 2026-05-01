import { createDefaultSearchEngine } from "../../modules/search-engine/index.mjs";

// 进程内单例，首次调用后缓存，避免重复装配 provider
let _engine = null;

export function getSearchEngineSingleton() {
  if (!_engine) {
    _engine = createDefaultSearchEngine();
  }
  return _engine;
}

export function normalizeString(value) {
  return String(value ?? "").trim();
}

export function resolveContextItem(context) {
  const items = Array.isArray(context?.items) ? context.items : [];
  return items[0] ?? null;
}

export default {
  getSearchEngineSingleton,
  normalizeString,
  resolveContextItem,
};
