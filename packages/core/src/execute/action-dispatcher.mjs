function isPresent(v) {
  return v !== undefined && v !== null;
}

function matchType(v, typeSpec) {
  const parts = String(typeSpec ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  return parts.some((t) => {
    switch (t) {
      case "string": return typeof v === "string";
      case "number": return typeof v === "number" && Number.isFinite(v);
      case "integer": return Number.isInteger(v);
      case "boolean": return typeof v === "boolean";
      case "array": return Array.isArray(v);
      case "object": return v !== null && typeof v === "object" && !Array.isArray(v);
      default: return false;
    }
  });
}

function validateArgsSchema(argsSchema, input) {
  if (!argsSchema || typeof argsSchema !== "object") return;

  const required = Array.isArray(argsSchema.required) ? argsSchema.required : [];
  const properties = argsSchema.properties && typeof argsSchema.properties === "object"
    ? argsSchema.properties
    : {};

  for (const field of required) {
    if (!isPresent(input?.[field])) {
      throw new Error(`参数缺失: ${field}`);
    }
  }

  for (const [field, def] of Object.entries(properties)) {
    if (!def?.type || !isPresent(input?.[field])) continue;
    if (!matchType(input[field], def.type)) {
      throw new Error(`参数类型不匹配: ${field} 期望 ${def.type}`);
    }
  }
}

function resolveHandler(spec) {
  if (typeof spec?.handler === "function") return spec.handler;
  if (typeof spec?.run === "function") return spec.run;
  if (typeof spec?.execute === "function") return spec.execute;
  return null;
}

/**
 * Build a structured action dispatcher from action definitions.
 *
 * Action spec format:
 * {
 *   "cache.list": {
 *     sub: "list",
 *     usage: "wallet list ...",
 *     description: "...",
 *     argsSchema: { required: [], properties: {} },
 *     validate(input) {},
 *     handler(ctx, input) {}
 *   }
 * }
 */
export function buildActionDispatcher(options = {}) {
  const actionObject = options.actionObject ?? {};
  const actionLabel = String(options.actionLabel ?? "action").trim() || "action";

  const entries = [];
  for (const [action, rawSpec] of Object.entries(actionObject)) {
    const spec = rawSpec && typeof rawSpec === "object" ? { ...rawSpec } : {};
    const handler = resolveHandler(spec);
    if (!handler) {
      throw new Error(`${actionLabel} 处理器缺失: ${action}`);
    }

    entries.push({ action, ...spec, handler });
  }

  const byAction = new Map(entries.map((entry) => [entry.action, entry]));
  const bySub = new Map(entries.map((entry) => [String(entry.sub ?? "").trim(), entry]));

  function getByAction(action) {
    return byAction.get(String(action ?? "").trim()) ?? null;
  }

  function getBySub(sub) {
    return bySub.get(String(sub ?? "").trim()) ?? null;
  }

  function list() {
    return entries.map((entry) => ({ ...entry }));
  }

  function listPublic() {
    return entries.map((entry) => {
      const out = { ...entry };
      delete out.handler;
      return out;
    });
  }

  function validate(action, input) {
    const meta = getByAction(action);
    if (!meta) {
      throw new Error(`不支持的 ${actionLabel}: ${action}`);
    }

    validateArgsSchema(meta.argsSchema, input);
    if (typeof meta.validate === "function") {
      meta.validate(input);
    }
    return meta;
  }

  async function dispatch(action, ctx, input) {
    const meta = validate(action, input);
    return await meta.handler(ctx, input);
  }

  return {
    getByAction,
    getBySub,
    list,
    listPublic,
    validate,
    dispatch,
  };
}
