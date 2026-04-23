/**
 * execute/runtime.mjs
 *
 * 运行时 Helper — 通过 AsyncLocalStorage 隐藏 ctx 传递。
 * 仅允许在 tasks/ run/ test/ 目录下导入。
 *
 * 使用限制（通过 ESLint 或代码约定强制）：
 *   ✅ src/tasks/**
 *   ✅ src/run/**
 *   ✅ src/test/**
 *   ❌ src/modules/**
 *   ❌ src/apps/**（除 execute 本身的 kernel）
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { EXEC_ERROR_CODES, ExecError } from "./errors.mjs";

// AsyncLocalStorage 实例 —— 由 execute engine 在每次任务执行时注入 ctx
export const ctxStore = new AsyncLocalStorage();

function getCtx(api) {
  const ctx = ctxStore.getStore();
  if (!ctx) {
    throw new ExecError(
      `${api} 仅可在 task 执行上下文中调用（tasks/ run/ test/ 目录）`,
      { code: EXEC_ERROR_CODES.CONTEXT_NOT_FOUND },
    );
  }
  return ctx;
}

// ═══ 输入 ═══

/** 获取当前任务的输入参数 */
export const input = () => getCtx("input()").input();

// ═══ 交互 ═══

/** 简单二选一确认，返回 boolean */
export const confirm = async (options) => getCtx("confirm()").confirm(options);

/** 复杂多字段交互（支持 string / password / number / select 字段类型） */
export const interact = async (options) => getCtx("interact()").interact(options);

// ═══ 钱包和签名 ═══

/**
 * 获取签名器
 * @param {{ chain?: "evm"|"btc"|"trx", network?: string, keyId?: string }} options
 */
export const getSigner = async (options) => {
  const ctx = getCtx("getSigner()");
  if (!ctx.wallet) {
    throw new ExecError("当前执行上下文中没有 wallet", {
      code: EXEC_ERROR_CODES.CONTEXT_NOT_FOUND,
    });
  }
  return ctx.wallet.getSigner(options);
};

/**
 * wallet Proxy —— 透明访问 ctx.wallet 的所有属性和方法
 * 访问时如果没有 ctx 会立即报错，而不是在调用时才报错
 */
export const wallet = new Proxy(
  {},
  {
    get(_target, prop) {
      const ctx = getCtx(`wallet.${String(prop)}`);
      if (!ctx.wallet) {
        throw new ExecError("当前执行上下文中没有 wallet", {
          code: EXEC_ERROR_CODES.CONTEXT_NOT_FOUND,
        });
      }
      const val = ctx.wallet[prop];
      return typeof val === "function" ? val.bind(ctx.wallet) : val;
    },
  },
);

// ═══ 检查点 ═══

/** 保存检查点，任务暂停，返回 { pauseToken } */
export const checkpoint = (state) => getCtx("checkpoint()").checkpoint(state);

/** 查询当前 task 是否从检查点恢复，及恢复时的状态 */
export const resumed = () => getCtx("resumed()").resumed();
