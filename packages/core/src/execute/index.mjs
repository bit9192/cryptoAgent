/**
 * execute/index.mjs
 *
 * Execute 模块统一出口
 */

// 执行引擎
export { execute, createMemoryCheckpointStore } from "./execute.mjs";

// 任务定义
export { defineTask, isTaskDefinition } from "./define-task.mjs";

// 任务注册表
export {
  buildTaskRegistry,
  createMutableRegistry,
  getDefaultRegistry,
  clearRegistryCache,
} from "./registry.mjs";

// 运行时 helpers（供任务内部使用）
export {
  ctxStore,
  input,
  confirm,
  interact,
  getSigner,
  wallet,
  checkpoint,
  resumed,
} from "./runtime.mjs";

// 执行上下文工厂
export { createExecutionContext } from "./context.mjs";

// 错误类型
export { ExecError, toExecError, EXEC_ERROR_CODES } from "./errors.mjs";
