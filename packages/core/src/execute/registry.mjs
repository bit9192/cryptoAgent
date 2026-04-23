/**
 * execute/registry.mjs
 *
 * 任务注册表 —— 自动从 src/tasks/ 目录扫描 index.mjs，注册 defineTask() 格式的任务。
 *
 * 约定：
 *   - 路径：tasks/{type}/{name}/index.mjs
 *   - 导出：default 或命名导出 "task"
 *   - Task ID：{type}:{name}（可在 defineTask 中显式覆盖）
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTaskDefinition } from "./define-task.mjs";

const TASKS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tasks",
);

/**
 * 递归查找所有 index.mjs 文件（最多 3 层深度：type/name/index.mjs）
 */
async function findTaskIndexFiles(dir, depth = 0) {
  if (depth > 3) return [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...await findTaskIndexFiles(abs, depth + 1));
    } else if (entry.isFile() && entry.name === "index.mjs") {
      found.push(abs);
    }
  }
  return found;
}

/**
 * 从文件路径推导任务 ID
 * tasks/evm/send.token/index.mjs → "evm:send.token"
 */
function inferTaskId(filePath) {
  const rel = path.relative(TASKS_ROOT, filePath);
  const parts = rel.replace(/[\\/]index\.mjs$/, "").split(path.sep).filter(Boolean);
  if (parts.length < 2) return null;
  const [type, ...nameParts] = parts;
  return `${type}:${nameParts.join(".")}`;
}

/**
 * 从模块对象中提取任务定义
 * 支持：default export、export { task }
 */
function extractTaskDef(mod, inferredId, filePath) {
  const candidates = [mod?.default, mod?.task].filter(Boolean);

  for (const candidate of candidates) {
    if (isTaskDefinition(candidate)) {
      // 如果没有显式 id，用从路径推导的 id
      if (!candidate.id && inferredId) {
        candidate.id = inferredId;
      }
      return candidate;
    }
  }

  return null;
}

/**
 * 构建任务注册表 —— 懒加载，首次调用时扫描文件系统。
 */
export async function buildTaskRegistry(options = {}) {
  const root = options.tasksRoot ?? TASKS_ROOT;
  const taskMap = new Map();
  const warnings = [];

  const indexFiles = await findTaskIndexFiles(root);

  await Promise.all(
    indexFiles.map(async (filePath) => {
      const inferredId = inferTaskId(filePath);

      try {
        const mod = await import(`file://${filePath}`);
        const taskDef = extractTaskDef(mod, inferredId, filePath);

        if (!taskDef) {
          // 不是 defineTask 格式，跳过（不报错，支持旧式导出）
          return;
        }

        if (!taskDef.id) {
          warnings.push(`⚠️ 无法确定任务 ID: ${filePath}，跳过`);
          return;
        }

        if (taskMap.has(taskDef.id)) {
          warnings.push(`⚠️ 任务 ID 重复: ${taskDef.id}，后者被忽略 (${filePath})`);
          return;
        }

        taskMap.set(taskDef.id, taskDef);
      } catch (err) {
        warnings.push(`❌ 加载任务失败 ${filePath}: ${err.message}`);
      }
    }),
  );

  if (warnings.length > 0 && options.verbose) {
    for (const w of warnings) console.warn(w);
  }

  return {
    get: (id) => taskMap.get(id) ?? null,
    has: (id) => taskMap.has(id),
    list: () => Array.from(taskMap.values()),
    listIds: () => Array.from(taskMap.keys()),
    size: taskMap.size,
    warnings,
  };
}

// ─── 手动注册（可追加自定义任务，不依赖文件系统扫描）─────────

/**
 * 创建一个空的可写注册表，支持手动注册
 */
export function createMutableRegistry(base = null) {
  const taskMap = new Map(base ? base.list().map((t) => [t.id, t]) : []);

  return {
    register(taskDef) {
      if (!isTaskDefinition(taskDef)) {
        throw new TypeError("register: 参数必须是 defineTask() 返回的任务定义");
      }
      taskMap.set(taskDef.id, taskDef);
    },
    unregister(id) {
      taskMap.delete(id);
    },
    get: (id) => taskMap.get(id) ?? null,
    has: (id) => taskMap.has(id),
    list: () => Array.from(taskMap.values()),
    listIds: () => Array.from(taskMap.keys()),
    get size() { return taskMap.size; },
  };
}

/** 默认注册表缓存（懒加载） */
let _defaultRegistry = null;
let _defaultRegistryPromise = null;

export async function getDefaultRegistry(options = {}) {
  if (_defaultRegistry && !options.fresh) {
    return _defaultRegistry;
  }
  if (_defaultRegistryPromise && !options.fresh) {
    return _defaultRegistryPromise;
  }
  _defaultRegistryPromise = buildTaskRegistry(options).then((r) => {
    _defaultRegistry = r;
    return r;
  });
  return _defaultRegistryPromise;
}

/** 热加载时清除缓存 */
export function clearRegistryCache() {
  _defaultRegistry = null;
  _defaultRegistryPromise = null;
}
