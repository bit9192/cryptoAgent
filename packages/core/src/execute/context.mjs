/**
 * execute/context.mjs
 *
 * 创建执行上下文 (cx)，在每次 task 运行前构建，通过 AsyncLocalStorage 注入。
 */
import { randomUUID } from "node:crypto";
import { EXEC_ERROR_CODES, ExecError } from "./errors.mjs";

const SENSITIVE_NAME_PATTERNS = [
  /private.?key/i,
  /mnemonic/i,
  /password/i,
  /secret/i,
  /seed/i,
  /wif/i,
  /passphrase/i,
];

function isSensitiveField(name) {
  return SENSITIVE_NAME_PATTERNS.some((p) => p.test(String(name ?? "")));
}

/** 递归过滤敏感字段（用于日志/事件快照） */
function sanitize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitiveField(k) ? "[REDACTED]" : sanitize(v);
    }
    return out;
  }
  if (typeof value === "bigint") return String(value);
  return value;
}

/**
 * 创建执行上下文
 *
 * @param {object} options
 * @param {object} options.task          - 任务定义 (defineTask 输出)
 * @param {object} options.inputData     - 任务输入参数
 * @param {object} options.wallet        - wallet 实例
 * @param {string} options.source        - 调用来源 ('cli', 'test', 'api' ...)
 * @param {string} options.network       - 当前网络（链网络名）
 * @param {Function} options.confirmHandler  - 确认回调 async(opts) => boolean
 * @param {Function} options.interactHandler - 交互回调 async(opts) => { payload, ... }
 * @param {object} options.checkpointStore   - 检查点存储（可选）
 * @param {object} options.resumeState       - 恢复状态（可选）
 * @param {string} options.requestId         - 请求 ID（可选，自动生成）
 * @param {Function} options.onLifecycleEvent - 生命周期事件回调（可选）
 * @returns {object}  ctx
 */
export function createExecutionContext(options = {}) {
  const requestId = options.requestId ?? randomUUID();
  const successCallbacks = [];
  const errorCallbacks = [];
  const lifecycleTrace = [];

  let pauseRequested = false;
  let pauseToken = null;

  async function emitEvent(phase, details = null) {
    const event = {
      timestamp: new Date().toISOString(),
      phase,
      task: options.task?.id ?? null,
      requestId,
      ...(details ? { details: sanitize(details) } : {}),
    };
    lifecycleTrace.push(event);
    if (typeof options.onLifecycleEvent === "function") {
      try {
        await options.onLifecycleEvent(event);
      } catch {
        // 生命周期回调异常不影响主流程
      }
    }
    return event;
  }

  const ctx = {
    // ─── 基本信息 ───
    requestId,
    task: options.task ?? null,
    source: options.source ?? null,
    network: options.network ?? null,
    wallet: options.wallet ?? null,
    get trace() { return lifecycleTrace; },

    // ─── 输入 ───
    input() {
      if (options.inputData == null) {
        throw new ExecError("任务输入未设置", { code: EXEC_ERROR_CODES.INPUT_INVALID });
      }
      return options.inputData;
    },

    // ─── 确认 ───
    async confirm(opts = {}) {
      await emitEvent("confirmation.requested", { opts: sanitize(opts) });
      if (typeof options.confirmHandler !== "function") {
        throw new ExecError("当前环境不支持 confirm()（缺少 confirmHandler）", {
          code: EXEC_ERROR_CODES.CONFIRM_REQUIRED,
          recoverable: true,
        });
      }
      const approved = Boolean(await options.confirmHandler(opts));
      await emitEvent(approved ? "confirmation.approved" : "confirmation.rejected", {
        source: options.source,
      });
      return approved;
    },

    // ─── 多字段交互 ───
    async interact(opts = {}) {
      await emitEvent("interaction.requested", {
        type: opts.type ?? "input",
        fieldCount: Array.isArray(opts.fields) ? opts.fields.length : 0,
      });
      if (typeof options.interactHandler !== "function") {
        throw new ExecError("当前环境不支持 interact()（缺少 interactHandler）", {
          code: EXEC_ERROR_CODES.INTERACTION_REQUIRED,
          recoverable: true,
        });
      }
      const response = await options.interactHandler(opts);
      await emitEvent("interaction.resolved", {
        source: response?.source ?? options.source,
        // 不记录 payload（可能含敏感字段）
      });
      return response;
    },

    // ─── 检查点 ───
    checkpoint(state = {}) {
      if (pauseRequested) return { pauseToken };  // 已暂停，幂等

      const token = randomUUID();
      pauseToken = token;
      pauseRequested = true;

      if (options.checkpointStore && typeof options.checkpointStore.save === "function") {
        const safe = sanitize(state);
        // 异步保存（fire-and-forget，调用方可 await）
        options.checkpointStore.save(token, {
          task: options.task?.id ?? null,
          state: safe,
          createdAt: new Date().toISOString(),
        }).catch(() => {});
      }

      emitEvent("checkpoint.created", { token });

      // 抛出特殊错误让 execute engine 捕获并暂停
      const pause = new Error("checkpoint");
      pause.isPause = true;
      pause.token = token;
      throw pause;
    },

    // ─── 恢复状态 ───
    resumed() {
      return {
        active: Boolean(options.resumeState?.active),
        state: options.resumeState?.state ?? null,
        token: options.resumeState?.token ?? null,
      };
    },

    // ─── 生命周期回调 ───
    onSuccess(cb) { successCallbacks.push(cb); },
    onError(cb) { errorCallbacks.push(cb); },

    // ─── 内部 hook（给 execute engine 使用）───
    _emitEvent: emitEvent,
    _successCallbacks: successCallbacks,
    _errorCallbacks: errorCallbacks,
  };

  return ctx;
}
