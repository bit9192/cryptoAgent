export const EXEC_ERROR_CODES = Object.freeze({
  // 请求层
  REQUEST_INVALID: "request_invalid",
  TASK_NOT_FOUND: "task_not_found",
  INPUT_INVALID: "input_invalid",
  POLICY_VIOLATION: "policy_violation",

  // 确认层
  CONFIRM_REQUIRED: "confirm_required",
  CONFIRM_REJECTED: "confirm_rejected",

  // 交互层
  INTERACTION_REQUIRED: "interaction_required",
  INTERACTION_CANCELLED: "interaction_cancelled",
  INTERACTION_TIMEOUT: "interaction_timeout",

  // 执行层
  EXECUTION_FAILED: "execution_failed",
  CONTEXT_NOT_FOUND: "context_not_found",

  // 检查点
  CHECKPOINT_FAILED: "checkpoint_failed",
  RESUME_STATE_MISSING: "resume_state_missing",
  RESUME_TOKEN_INVALID: "resume_token_invalid",
});

export class ExecError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ExecError";
    this.code = options.code ?? null;
    this.task = options.task ?? null;
    this.recoverable = options.recoverable ?? false;
    this.details = options.details ?? null;
  }
}

export function toExecError(error, options = {}) {
  if (error instanceof ExecError && !options.code) {
    return error;
  }

  const msg = error instanceof Error ? error.message : String(error ?? "执行失败");
  const execError = new ExecError(msg, options);

  if (error instanceof Error && error.stack) {
    execError.stack = error.stack;
  }
  if (error?.details && !options.details) {
    execError.details = error.details;
  }

  return execError;
}
