/**
 * execute/execute.mjs
 *
 * 执行引擎：验证输入 → 检查策略 → 确认 → 进入 AsyncLocalStorage → 运行任务
 */
import { ctxStore } from "./runtime.mjs";
import { createExecutionContext } from "./context.mjs";
import { EXEC_ERROR_CODES, ExecError, toExecError } from "./errors.mjs";
import { getDefaultRegistry } from "./registry.mjs";

// ─── 输入验证 ─────────────────────────────────────────────────

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
      case "bigint": return typeof v === "bigint";
      case "array": return Array.isArray(v);
      case "object": return v !== null && typeof v === "object" && !Array.isArray(v);
      default: return false;
    }
  });
}

function validateInput(schema, args) {
  if (!schema || typeof schema !== "object") return [];
  const errors = [];
  const { required = [], properties = {} } = schema;

  for (const field of required) {
    if (!isPresent(args?.[field])) {
      errors.push({ field, reason: "required", message: `缺少必填参数: ${field}` });
    }
  }
  for (const [field, def] of Object.entries(properties)) {
    if (!def?.type || !isPresent(args?.[field])) continue;
    if (!matchType(args[field], def.type)) {
      errors.push({ field, reason: "type", message: `参数 ${field} 类型不匹配，期望 ${def.type}` });
    }
  }
  return errors;
}

// ─── 策略评估 ─────────────────────────────────────────────────

function evaluatePolicy(taskDef, source) {
  const sourcePolicy = taskDef.sourcePolicy ?? [];
  if (sourcePolicy.length > 0 && source && !sourcePolicy.includes(source)) {
    throw new ExecError(
      `来源 "${source}" 不允许执行任务 ${taskDef.id}`,
      { code: EXEC_ERROR_CODES.POLICY_VIOLATION, task: taskDef.id },
    );
  }
  return {
    readonly: Boolean(taskDef.readonly),
    requiresConfirm: Boolean(taskDef.requiresConfirm),
    source,
  };
}

// ─── 主执行函数 ───────────────────────────────────────────────

/**
 * 执行一个任务
 *
 * @param {object} request
 * @param {string}  request.task    - 任务 ID
 * @param {object}  [request.args]  - 输入参数
 * @param {string}  [request.source] - 来源 ('cli', 'test', 'api', 'workflow')
 * @param {string}  [request.network] - 链网络名
 * @param {string}  [request.resumeToken] - 恢复 token（从检查点继续）
 *
 * @param {object}  options
 * @param {object}  [options.registry]   - 任务注册表（默认使用全局）
 * @param {object}  [options.wallet]     - wallet 实例
 * @param {Function} [options.confirm]   - 确认回调 async(opts) => boolean
 * @param {Function} [options.interact]  - 交互回调 async(opts) => { payload, ... }
 * @param {object}  [options.checkpointStore] - 检查点存储
 * @param {Function} [options.onLifecycleEvent] - 生命周期事件监听器
 *
 * @returns {Promise<{ ok: boolean, data: any, error: ExecError|null, meta: object }>}
 */
export async function execute(request, options = {}) {
  const taskId = String(request?.task ?? "").trim();

  if (!taskId) {
    return {
      ok: false,
      data: null,
      error: new ExecError("task 不能为空", { code: EXEC_ERROR_CODES.REQUEST_INVALID }),
      meta: { task: "<unknown>", source: request?.source },
    };
  }

  // 1. 解析任务定义
  const registry = options.registry ?? await getDefaultRegistry();
  const taskDef = registry.get(taskId);

  if (!taskDef) {
    return {
      ok: false,
      data: null,
      error: new ExecError(`未找到任务: ${taskId}`, {
        code: EXEC_ERROR_CODES.TASK_NOT_FOUND,
        task: taskId,
      }),
      meta: { task: taskId, source: request?.source },
    };
  }

  const source = request?.source ?? null;
  const args = request?.args ?? {};

  // 2. 验证输入
  const inputErrors = validateInput(taskDef.inputSchema, args);
  if (inputErrors.length > 0) {
    return {
      ok: false,
      data: null,
      error: new ExecError("输入参数验证失败", {
        code: EXEC_ERROR_CODES.INPUT_INVALID,
        task: taskId,
        details: { errors: inputErrors },
      }),
      meta: { task: taskId, source },
    };
  }

  // 3. 检查策略
  let policy;
  try {
    policy = evaluatePolicy(taskDef, source);
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: toExecError(err),
      meta: { task: taskId, source },
    };
  }

  // 4. requiresConfirm —— 在进入执行上下文之前做的外层确认
  if (policy.requiresConfirm && typeof options.confirm === "function") {
    let approved;
    try {
      approved = await options.confirm({
        type: "task.execute.confirm",
        task: taskId,
        args,
        readonly: policy.readonly,
      });
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: toExecError(err, {
          code: EXEC_ERROR_CODES.CONFIRM_REJECTED,
          task: taskId,
          recoverable: true,
        }),
        meta: { task: taskId, source },
      };
    }

    if (!approved) {
      return {
        ok: false,
        data: null,
        error: new ExecError(`任务 ${taskId} 已被拒绝执行`, {
          code: EXEC_ERROR_CODES.CONFIRM_REJECTED,
          task: taskId,
          recoverable: true,
        }),
        meta: { task: taskId, source },
      };
    }
  }

  // 5. 构建恢复状态（如果有 resumeToken）
  let resumeState = null;
  if (request?.resumeToken && options.checkpointStore) {
    const checkpoint = await options.checkpointStore.load(request.resumeToken).catch(() => null);
    if (!checkpoint) {
      return {
        ok: false,
        data: null,
        error: new ExecError(`未找到检查点: ${request.resumeToken}`, {
          code: EXEC_ERROR_CODES.RESUME_STATE_MISSING,
          task: taskId,
          recoverable: true,
        }),
        meta: { task: taskId, source },
      };
    }
    if (checkpoint.task !== taskId) {
      return {
        ok: false,
        data: null,
        error: new ExecError("检查点对应的任务不匹配", {
          code: EXEC_ERROR_CODES.RESUME_TOKEN_INVALID,
          task: taskId,
          recoverable: true,
        }),
        meta: { task: taskId, source },
      };
    }
    resumeState = { active: true, state: checkpoint.state, token: request.resumeToken };
  }

  // 6. 创建执行上下文
  const ctx = createExecutionContext({
    task: taskDef,
    inputData: args,
    wallet: options.wallet ?? null,
    source,
    network: request?.network ?? options.network ?? null,
    confirmHandler: options.confirm,
    interactHandler: options.interact,
    checkpointStore: options.checkpointStore ?? null,
    resumeState,
    onLifecycleEvent: options.onLifecycleEvent,
  });

  // 7. 进入 AsyncLocalStorage 上下文，运行任务
  await ctx._emitEvent("execution.started");
  try {
    const result = await ctxStore.run(ctx, () => taskDef.run(ctx));

    await ctx._emitEvent("execution.completed");

    // 触发成功回调
    for (const cb of ctx._successCallbacks) {
      try { await cb(result, ctx); } catch { /* ignore */ }
    }

    return {
      ok: true,
      data: result ?? null,
      error: null,
      meta: {
        task: taskId,
        source,
        requestId: ctx.requestId,
        trace: ctx.trace,
      },
    };
  } catch (err) {
    // 处理 checkpoint 暂停
    if (err?.isPause) {
      await ctx._emitEvent("checkpoint.pause", { token: err.token });
      return {
        ok: false,
        data: null,
        error: null,
        paused: true,
        resumeToken: err.token,
        meta: {
          task: taskId,
          source,
          requestId: ctx.requestId,
          trace: ctx.trace,
        },
      };
    }

    const execError = toExecError(err, {
      code: err.code ?? EXEC_ERROR_CODES.EXECUTION_FAILED,
      task: taskId,
    });

    await ctx._emitEvent("execution.failed", { error: execError.message });

    // 触发错误回调
    for (const cb of ctx._errorCallbacks) {
      try { await cb(execError, ctx); } catch { /* ignore */ }
    }

    return {
      ok: false,
      data: null,
      error: execError,
      meta: {
        task: taskId,
        source,
        requestId: ctx.requestId,
        trace: ctx.trace,
      },
    };
  }
}

// ─── 内存检查点存储（简单实现，用于 CLI 模式）────────────────

export function createMemoryCheckpointStore() {
  const store = new Map();

  return {
    async save(token, checkpoint) {
      store.set(token, { ...checkpoint, savedAt: new Date().toISOString() });
    },
    async load(token) {
      return store.get(token) ?? null;
    },
    async delete(token) {
      store.delete(token);
    },
    size() { return store.size; },
  };
}
