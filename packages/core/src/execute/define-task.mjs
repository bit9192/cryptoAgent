/**
 * execute/define-task.mjs
 *
 * defineTask() —— 任务定义工厂函数
 * 对 task config 做规范化和验证，并标记为 defineTask 格式。
 */

const VALID_FIELD_TYPES = new Set([
  "string", "number", "integer", "boolean", "bigint", "array", "object",
]);

function coerceStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [String(value)];
}

function normalizeInputSchema(schema) {
  if (!schema || typeof schema !== "object") return {};
  return {
    required: coerceStringList(schema.required),
    properties: schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : {},
  };
}

/**
 * 定义一个任务。
 *
 * @param {object} config
 * @param {string}   config.id             - 唯一任务 ID，格式建议 "type:name"（如 evm:send.token）
 * @param {string}   config.title          - 人类可读的任务名称
 * @param {string}   [config.description]  - 任务描述
 * @param {object}   [config.inputSchema]  - 输入参数 Schema（JSON Schema 子集）
 * @param {object}   [config.outputSchema] - 输出数据 Schema（可选）
 * @param {boolean}  [config.readonly]     - 是否为只读操作（不需要确认）
 * @param {boolean}  [config.requiresConfirm] - 是否必须人工确认
 * @param {string[]} [config.sourcePolicy] - 允许的来源列表（空数组 = 允许所有）
 * @param {string[]} [config.tags]         - 标签
 * @param {Function} config.run            - 任务执行函数 async (ctx) => result
 * @returns {object}  TaskDefinition
 */
export function defineTask(config) {
  if (!config || typeof config !== "object") {
    throw new TypeError("defineTask: config 必须是对象");
  }
  if (!config.id || typeof config.id !== "string" || !config.id.trim()) {
    throw new TypeError("defineTask: id 不能为空");
  }
  if (!config.title || typeof config.title !== "string" || !config.title.trim()) {
    throw new TypeError("defineTask: title 不能为空");
  }
  if (typeof config.run !== "function") {
    throw new TypeError("defineTask: run 必须是 async 函数");
  }

  return {
    _isTaskDefinition: true,
    id: config.id.trim(),
    title: config.title.trim(),
    description: config.description ? String(config.description).trim() : "",
    inputSchema: normalizeInputSchema(config.inputSchema),
    outputSchema: config.outputSchema && typeof config.outputSchema === "object"
      ? config.outputSchema
      : null,
    readonly: Boolean(config.readonly),
    requiresConfirm: Boolean(config.requiresConfirm),
    sourcePolicy: coerceStringList(config.sourcePolicy),
    tags: coerceStringList(config.tags),
    run: config.run,
  };
}

/** 判断一个值是否是 defineTask 产出的任务定义 */
export function isTaskDefinition(value) {
  return Boolean(
    value
    && typeof value === "object"
    && value._isTaskDefinition === true
    && typeof value.run === "function"
    && typeof value.id === "string",
  );
}
