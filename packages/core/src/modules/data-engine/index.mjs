const SUPPORTED_OPS = new Set([
  "eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "exists",
]);

export {
  createRuleRegistry,
  saveRuleSpec,
  listRuleVersions,
  activateRuleVersion,
  getRuleSpec,
  rollbackRuleVersion,
} from "./rules-registry.mjs";

const SUPPORTED_AGGREGATES = new Set([
  "count", "sum", "min", "max", "avg", "groupBy",
]);

const SUPPORTED_NUMERIC_MODES = new Set([
  "number", "decimal-string", "bigint",
]);

const RULE_SPEC_VERSION = "1.0";

const CHANNEL_ALLOW_LEVELS = {
  ai: new Set(["public"]),
  ui: new Set(["public"]),
  internal: new Set(["public", "internal", "private"]),
  secure: new Set(["public", "internal", "private", "secret"]),
};

function toPathTokens(path) {
  if (!path || path === "$") return [];
  return String(path)
    .replace(/^\$\.?/, "")
    .split(".")
    .flatMap((part) => {
      const m = part.match(/^(.*)\[\*\]$/);
      if (!m) return [part];
      const head = m[1];
      return head ? [head, "*"] : ["*"];
    })
    .filter(Boolean);
}

function resolvePathValues(input, path) {
  const tokens = toPathTokens(path);
  let current = [input];

  for (const token of tokens) {
    const next = [];
    for (const node of current) {
      if (node == null) continue;
      if (token === "*") {
        if (Array.isArray(node)) next.push(...node);
        continue;
      }
      const value = node[token];
      if (value !== undefined) next.push(value);
    }
    current = next;
    if (current.length === 0) break;
  }

  return current;
}

function getFieldValue(item, fieldPath) {
  const values = resolvePathValues(item, fieldPath);
  return values.length > 0 ? values[0] : undefined;
}

function assertValidFilter(filter) {
  if (!filter || typeof filter !== "object") {
    throw new TypeError("filter 必须是对象");
  }
  if (!filter.field || typeof filter.field !== "string") {
    throw new TypeError("filter.field 必须是字符串");
  }
  if (!SUPPORTED_OPS.has(filter.op)) {
    throw new TypeError(`不支持的过滤操作符: ${filter.op}`);
  }
}

function evalFilter(item, filter) {
  assertValidFilter(filter);
  const value = getFieldValue(item, filter.field);

  switch (filter.op) {
    case "eq": return value === filter.value;
    case "ne": return value !== filter.value;
    case "gt": return Number(value) > Number(filter.value);
    case "gte": return Number(value) >= Number(filter.value);
    case "lt": return Number(value) < Number(filter.value);
    case "lte": return Number(value) <= Number(filter.value);
    case "in": return Array.isArray(filter.value) && filter.value.includes(value);
    case "contains": {
      if (typeof value === "string") return String(value).includes(String(filter.value));
      if (Array.isArray(value)) return value.includes(filter.value);
      return false;
    }
    case "exists": return value !== undefined && value !== null;
    default:
      return false;
  }
}

function applyFilters(items, filters = []) {
  if (!Array.isArray(filters) || filters.length === 0) return items;
  return items.filter((item) => filters.every((f) => evalFilter(item, f)));
}

function applySelect(item, select) {
  if (!select) return item;

  if (Array.isArray(select)) {
    const out = {};
    for (const key of select) {
      out[key] = getFieldValue(item, key);
    }
    return out;
  }

  if (typeof select === "object") {
    const out = {};
    for (const [alias, path] of Object.entries(select)) {
      out[alias] = getFieldValue(item, path);
    }
    return out;
  }

  return item;
}

function splitDecimalParts(value) {
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new TypeError(`非法十进制数字: ${String(value)}`);
  }
  const sign = raw.startsWith("-") ? -1n : 1n;
  const abs = raw.startsWith("-") ? raw.slice(1) : raw;
  const [intPart, fracPart = ""] = abs.split(".");
  return {
    sign,
    intPart,
    fracPart,
    scale: fracPart.length,
  };
}

function decimalToScaledBigInt(value, scale) {
  const p = splitDecimalParts(value);
  const frac = p.fracPart.padEnd(scale, "0");
  const digits = `${p.intPart}${frac}`.replace(/^0+(?=\d)/, "");
  const n = BigInt(digits || "0");
  return p.sign * n;
}

function scaledBigIntToDecimalString(n, scale) {
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  if (scale === 0) return `${sign}${abs.toString()}`;

  const raw = abs.toString().padStart(scale + 1, "0");
  const intPart = raw.slice(0, -scale) || "0";
  const fracPart = raw.slice(-scale).replace(/0+$/, "");
  return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

function decimalSum(values) {
  if (values.length === 0) return "0";
  const parts = values.map((v) => splitDecimalParts(v));
  const maxScale = Math.max(...parts.map((p) => p.scale));
  const total = values
    .map((v) => decimalToScaledBigInt(v, maxScale))
    .reduce((a, b) => a + b, 0n);
  return scaledBigIntToDecimalString(total, maxScale);
}

export function validateRuleSpec(spec = {}) {
  if (!spec || typeof spec !== "object") {
    throw new TypeError("rule spec 必须是对象");
  }

  const version = spec.version ?? RULE_SPEC_VERSION;
  if (version !== RULE_SPEC_VERSION) {
    throw new TypeError(`不支持的规则版本: ${version}`);
  }

  if (spec.sourcePath != null && typeof spec.sourcePath !== "string") {
    throw new TypeError("sourcePath 必须是字符串");
  }

  if (spec.filters != null) {
    if (!Array.isArray(spec.filters)) {
      throw new TypeError("filters 必须是数组");
    }
    for (const f of spec.filters) {
      assertValidFilter(f);
    }
  }

  if (spec.aggregate != null) {
    if (typeof spec.aggregate !== "object") {
      throw new TypeError("aggregate 必须是对象");
    }
    if (!SUPPORTED_AGGREGATES.has(spec.aggregate.type)) {
      throw new TypeError(`不支持的聚合类型: ${spec.aggregate.type}`);
    }
    if (spec.aggregate.numericMode != null
      && !SUPPORTED_NUMERIC_MODES.has(spec.aggregate.numericMode)) {
      throw new TypeError(`不支持的数字模式: ${spec.aggregate.numericMode}`);
    }

    if (spec.aggregate.type === "groupBy" && spec.aggregate.metric) {
      const mode = spec.aggregate.metric.numericMode;
      if (mode != null && !SUPPORTED_NUMERIC_MODES.has(mode)) {
        throw new TypeError(`不支持的数字模式: ${mode}`);
      }
    }
  }

  return {
    ...spec,
    version,
  };
}

export function extractData(options = {}) {
  const {
    input,
    sourcePath = "$",
    filters = [],
    select = null,
  } = options;

  const source = resolvePathValues(input, sourcePath);
  const normalized = source.flatMap((x) => (Array.isArray(x) ? x : [x]));
  const filtered = applyFilters(normalized, filters);
  return filtered.map((item) => applySelect(item, select));
}

function toNumberStrict(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`字段 ${field} 不是可计算数字: ${String(value)}`);
  }
  return n;
}

function toBigIntStrict(value, field) {
  if (typeof value === "bigint") return value;

  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(`字段 ${field} 不是可计算 bigint: ${String(value)}`);
    }
    return BigInt(value);
  }

  const raw = String(value).trim();
  if (!/^-?\d+$/.test(raw)) {
    throw new TypeError(`字段 ${field} 不是可计算 bigint: ${String(value)}`);
  }
  return BigInt(raw);
}

function aggregateSimple(rows, aggregate) {
  const { type, field, numericMode = "number" } = aggregate;
  const nums = field ? rows.map((r) => toNumberStrict(getFieldValue(r, field), field)) : [];

  if (type === "sum" && field && numericMode === "decimal-string") {
    const decimalValues = rows.map((r) => {
      const raw = getFieldValue(r, field);
      if (raw === undefined || raw === null) {
        throw new TypeError(`字段 ${field} 不是可计算数字: ${String(raw)}`);
      }
      return String(raw);
    });
    return decimalSum(decimalValues);
  }

  if (field && numericMode === "bigint") {
    const bigintValues = rows.map((r) => {
      const raw = getFieldValue(r, field);
      if (raw === undefined || raw === null) {
        throw new TypeError(`字段 ${field} 不是可计算 bigint: ${String(raw)}`);
      }
      return toBigIntStrict(raw, field);
    });

    switch (type) {
      case "count": return rows.length;
      case "sum": return bigintValues.reduce((a, b) => a + b, 0n);
      case "min": return bigintValues.length
        ? bigintValues.reduce((a, b) => (a < b ? a : b))
        : null;
      case "max": return bigintValues.length
        ? bigintValues.reduce((a, b) => (a > b ? a : b))
        : null;
      case "avg":
        return bigintValues.length
          ? bigintValues.reduce((a, b) => a + b, 0n) / BigInt(bigintValues.length)
          : null;
      default:
        throw new TypeError(`不支持的聚合类型: ${type}`);
    }
  }

  switch (type) {
    case "count": return rows.length;
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "min": return nums.length ? Math.min(...nums) : null;
    case "max": return nums.length ? Math.max(...nums) : null;
    case "avg": return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    default:
      throw new TypeError(`不支持的聚合类型: ${type}`);
  }
}

function aggregateGroupBy(rows, aggregate) {
  const { by, metric } = aggregate;
  if (!by || !metric || typeof metric !== "object") {
    throw new TypeError("groupBy 需要 by 和 metric");
  }

  const groups = new Map();
  for (const row of rows) {
    const key = getFieldValue(row, by) ?? "__unknown__";
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const out = {};
  for (const [key, bucket] of groups.entries()) {
    out[String(key)] = aggregateSimple(bucket, metric);
  }
  return out;
}

export function computeData(options = {}) {
  const {
    input,
    sourcePath = "$",
    filters = [],
    aggregate,
  } = options;

  validateRuleSpec({ sourcePath, filters, aggregate });

  const rows = extractData({ input, sourcePath, filters });

  if (aggregate.type === "groupBy") {
    return aggregateGroupBy(rows, aggregate);
  }
  return aggregateSimple(rows, aggregate);
}

function inferLevel(key) {
  if (/private.?key|mnemonic|password|secret|seed|passphrase/i.test(key)) {
    return "secret";
  }
  return "public";
}

function shouldKeep(level, channel) {
  const allow = CHANNEL_ALLOW_LEVELS[channel] ?? CHANNEL_ALLOW_LEVELS.internal;
  return allow.has(level);
}

export function sanitizeForChannel(options = {}) {
  const {
    data,
    channel = "ai",
    fieldLevels = {},
    mode = "redact",
  } = options;

  function walk(value, path = "") {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((x, i) => walk(x, `${path}[${i}]`));
    if (typeof value !== "object") return value;

    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const keyPath = path ? `${path}.${k}` : k;
      const level = fieldLevels[keyPath] ?? fieldLevels[k] ?? inferLevel(k);
      if (shouldKeep(level, channel)) {
        out[k] = walk(v, keyPath);
      } else if (mode === "redact") {
        out[k] = "[REDACTED]";
      }
    }
    return out;
  }

  return walk(data);
}

export default {
  extractData,
  computeData,
  sanitizeForChannel,
  validateRuleSpec,
};
