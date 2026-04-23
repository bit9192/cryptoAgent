# Execute 统一执行系统规范 (V2)

## 设计原则

1. **任务自动扫描** - 无需手动 index 注册，从 `tasks/*/index.mjs` 自动导入
2. **运行时 Helper** - 通过 `exec/runtime` 导入 confirm、wallet、getSigner，仅限 test/run/task 目录
3. **AsyncLocalStorage 隐藏 ctx** - 开发者不需要显式传递 context，运行时自动注入
4. **Checkpoint 驱动的暂停/恢复** - 任务可随时通过 checkpoint 保存状态并暂停
5. **分层覆盖** - 业务库代码不应知道 exec/runtime 的存在

---

## 核心生命周期

```
Task Execution Lifecycle:

request → resolve registry → load task → validate input → check policy
          ↓
      [confirm required?] → wait confirmation ← cx.confirm()
          ↓
      enter execution context (AsyncLocalStorage)
          ↓
      task.run(ctx) ← task handler
          ↓
          ├─ read input via ctx.input() / runtime helper
          ├─ confirm operation via ctx.confirm() / runtime helper  
          ├─ save checkpoint via ctx.checkpoint()
          ├─ get signer via ctx.wallet.getSigner() / runtime helper
          ├─ nested function calls (no ctx passing needed)
          └─ onSuccess / onError callbacks
          ↓
      [checkpoint requested?] → pause & return resumeToken
          ↓
      [error?] → normalize error & wrap
          ↓
      emit lifecycle events (onLifecycleEvent)
          ↓
      return { ok, data, error, meta }
```

### 主要事件阶段 (Lifecycle Phases)

| 阶段 | 触发时机 | 用途 |
|------|--------|------|
| `request.received` | 收到执行请求 | 记录执行开始 |
| `task.resolved` | 从注册表找到任务定义 | 验证任务存在性 |
| `input.validated` | 输入参数通过验证 | 记录参数是否有效 |
| `policy.checked` | 策略检查完成 | 记录权限和确认需求 |
| `confirmation.requested` | 需要人工确认 | 等待用户操作 |
| `confirmation.approved` | 用户同意执行 | 继续执行 |
| `confirmation.rejected` | 用户拒绝执行 | 中止执行（可恢复） |
| `execution.started` | 开始运行任务 handler | 记录执行开始时间 |
| `checkpoint.created` | 任务保存检查点 | 可选暂停点 |
| `execution.completed` | 任务返回成功 | 记录结果 |
| `execution.failed` | 任务抛出错误 | 记录错误信息 |
| `finished` | 完全结束 | 清理资源 |

---

## 1️⃣ 任务定义 (defineTask)

### 位置约定
- 文件：`packages/core/src/tasks/{type}/{name}/index.mjs`
- 导出：单个 default export 或命名导出 `task`
- 例：`tasks/evm/send/index.mjs`

### 任务对象结构 (Task Definition)

```javascript
export default defineTask({
  // 唯一标识，自动由路径推导：evm:send、btc:transfer 等
  // 或显式指定
  id: 'evm:send.token',
  
  // 人类可读的标题
  title: 'Send ERC20 Token',
  
  // 任务描述
  description: 'Transfer ERC20 tokens from one address to another',
  
  // 输入参数 Schema (JSON Schema + execute 扩展)
  inputSchema: {
    required: ['to', 'amount'],
    properties: {
      to: { 
        type: 'string', 
        description: '目标地址' 
      },
      amount: { 
        type: 'string | number | bigint',
        description: '发送数量' 
      },
      token: { 
        type: 'string',
        description: 'ERC20 合约地址' 
      },
      network: {
        type: 'string',
        description: '网络名称 (可选，默认取 cx 中的 network)'
      },
    }
  },
  
  // 输出数据 Schema
  outputSchema: {
    properties: {
      txHash: { type: 'string' },
      blockNumber: { type: 'number' },
      from: { type: 'string' },
      to: { type: 'string' },
      amount: { type: 'string' },
    }
  },
  
  // 权限策略
  readonly: false,  // 如果 true，不需要确认
  requiresConfirm: true,  // 必须人工确认
  sourcePolicy: ['cli', 'test'],  // 仅允许这些来源执行
  
  // 其他元数据
  tags: ['evm', 'transfer', 'token'],
  version: '1.0.0',
  author: 'team',
  
  // ===== 核心：任务执行函数 =====
  async run(ctx) {
    // ctx 是执行上下文，包含：
    // - ctx.input()         : 获取输入参数
    // - ctx.confirm(opts)   : 请求人工确认（已通过 requiresConfirm 筛选）
    // - ctx.checkpoint(state) : 保存检查点并暂停
    // - ctx.wallet          : 钱包实例（含 getSigner、unlock、lock 等）
    // - ctx.async()         : 创建执行作用域？
    // - ctx.onSuccess(cb)   : 注册成功回调
    // - ctx.onError(cb)     : 注册错误回调
    
    const { to, amount, token, network } = ctx.input();
    
    // 人工确认
    const approved = await ctx.confirm({
      type: 'task.confirm',
      message: \`确认向 \${to} 发送 \${amount} 个代币?\`,
      details: { to, amount, token }
    });
    if (!approved) {
      throw new Error('用户拒绝操作');
    }
    
    // 获取 Signer
    const signer = await ctx.wallet.getSigner({
      chain: 'evm',
      network: network || 'ethereum'
    });
    
    // 执行业务逻辑
    const result = await doSendToken({
      to,
      amount,
      token,
      signer,
      network
    });
    
    // 保存检查点（支持暂停恢复）
    ctx.checkpoint({
      phase: 'after_send',
      txHash: result.txHash,
      blockNumber: result.blockNumber
    });
    
    // 等待确认
    await waitForConfirmation(result.txHash, network);
    
    return {
      ok: true,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      from: signer.address,
      to,
      amount
    };
  }
})
```

### defineTask() 函数

```javascript
// packages/core/src/apps/exec/define-task.mjs
export function defineTask(config) {
  // 验证必需字段
  if (!config.id) throw new Error('Task id required');
  if (!config.title) throw new Error('Task title required');
  if (typeof config.run !== 'function') throw new Error('Task run handler required');
  
  // 返回规范化的任务对象
  return {
    id: config.id,
    title: config.title,
    description: config.description || '',
    inputSchema: config.inputSchema || {},
    outputSchema: config.outputSchema || {},
    readonly: config.readonly ?? false,
    requiresConfirm: config.requiresConfirm ?? false,
    sourcePolicy: config.sourcePolicy || [],
    tags: config.tags || [],
    version: config.version || '1.0.0',
    run: config.run
  };
}
```

---

## 2️⃣ 执行上下文 (Executive Context / cx)

### ctx 对象 API

```javascript
// cx 包含以下属性和方法

// ═══ 输入输出 ═══
ctx.input() 
  → 返回输入参数对象
  → 失败: 抛出 InputNotSetError

await ctx.confirm(options)
  → 请求人工确认
  → 返回 boolean (true=批准，false=拒绝)
  → options: { type, message, details, ... }
  → 失败: 抛出 ConfirmRequiredError

await ctx.interact(options)
  → 复杂交互：支持多字段、用户输入、密码输入等
  → 返回 { id, payload: {...}, actor, source, timestamp }
  → options: {
      type: 'input' | 'password' | 'select' | 'confirm' | 'upload' | 'custom',
      title?: '交互标题',
      message?: '交互说明',
      fields?: [
        {
          name: '字段名',
          type: 'string' | 'password' | 'number' | 'email' | ...,
          required: boolean,
          default?: '默认值',
          description?: '字段描述',
          options?: ['选项1', '选项2', ...]
        },
        ...
      ],
      timeoutMs?: 60000,  // 超时时间
      ...
    }
  → 字段类型说明：
    - 'string': 可见文本输入
    - 'password': 密码输入（隐藏）
    - 'number': 数字输入
    - 'email': 邮箱输入
    - 'select': 选择列表
    - 'custom': 自定义类型
  → 失败: 抛出 InteractionRequiredError

// ═══ 检查点和暂停 ═══
ctx.checkpoint(state)
  → 保存检查点，返回 resumeToken
  → state 会被序列化存储、敏感字段过滤
  → 调用后任务立即暂停，返回 { pauseToken: xxx }
  → 恢复时 ctx.resumed() 可查询

ctx.resumed()
  → 返回 { active: boolean, state: object, resumeToken: string }

// ═══ 钱包和签名 ═══
ctx.wallet
  → 完整钱包引用
  → 含 getSigner, unlock, lock, listKeys, getKeyMeta 等

await ctx.wallet.getSigner(options)
  → { chain, network, scope?, ... }
  → 返回 { address, sign, signMessage, ... }

// ═══ 策略和元数据 ═══
ctx.request
  → 原始执行请求：{ task, args, mode, source, ... }

ctx.policy
  → 策略检查结果：{ readonly, requiresConfirm, sourcePolicy, ... }

ctx.task
  → 当前任务定义

ctx.source
  → 执行来源：'cli', 'test', 'api', 'workflow', ...

ctx.network
  → 当前链网络名称（如果适用）

// ═══ 生命周期回调 ═══
ctx.onSuccess(callback)
  → 注册任务成功时的回调：fn(result, ctx)

ctx.onError(callback)
  → 注册任务失败时的回调：fn(error, ctx)

ctx.onLifecycleEvent?
  → （可选）监听所有生命周期事件：fn(event)
```

### cx 初始化

```javascript
// packages/core/src/apps/exec/context.mjs
export function createExecutionContext(options = {}) {
  return {
    input: () => {
      if (!options.inputData) throw new Error('Input not set');
      return options.inputData;
    },
    
    confirm: async (opts) => {
      if (!options.confirmHandler) {
        throw new Error('confirm() 仅在支持交互的环境可用');
      }
      return options.confirmHandler(opts);
    },

    interact: async (opts) => {
      if (!options.interactHandler) {
        throw new Error('interact() 仅在支持交互的环境可用');
      }
      return options.interactHandler(opts);
    },
    
    checkpoint: (state) => {
      const token = generateResumeToken();
      if (options.resumeStore) {
        options.resumeStore.save(token, { state, task: options.task.id });
      }
      return { pauseToken: token };
    },
    
    resumed: () => ({
      active: !!options.resumeState,
      state: options.resumeState?.data ?? null,
      resumeToken: options.resumeState?.token ?? null
    }),
    
    wallet: options.wallet,
    request: options.request,
    policy: options.policy,
    task: options.task,
    source: options.source,
    network: options.network,
    
    onSuccess: (cb) => options.successCallbacks?.push(cb),
    onError: (cb) => options.errorCallbacks?.push(cb),
  };
}
```

---

## 3️⃣ 运行时 Helper (Runtime Module)

### 路径限制
- ✅ 可用：`packages/core/src/test/**`, `packages/core/src/tasks/**`, `packages/core/src/run/**`
- ❌ 禁用：`packages/core/src/domain/**`, `packages/core/src/lib/**`, 其他库代码

### exec/runtime.mjs

```javascript
// packages/core/src/apps/exec/runtime.mjs
import { AsyncLocalStorage } from 'async_hooks';

const ctxStore = new AsyncLocalStorage();

// 导出用于 kernel 使用
export { ctxStore };

// ═══ Runtime Helper 函数 ═══

export const input = () => {
  const ctx = ctxStore.getStore();
  if (!ctx) throw new ContextNotFoundError('input()');
  return ctx.input();
};

export const confirm = async (options) => {
  const ctx = ctxStore.getStore();
  if (!ctx) throw new ContextNotFoundError('confirm()');
  return ctx.confirm(options);
};

export const interact = async (options) => {
  const ctx = ctxStore.getStore();
  if (!ctx) throw new ContextNotFoundError('interact()');
  return ctx.interact(options);
};

export const getSigner = async (options) => {
  const ctx = ctxStore.getStore();
  if (!ctx) throw new ContextNotFoundError('getSigner()');
  return ctx.wallet.getSigner(options);
};

export const checkpoint = (state) => {
  const ctx = ctxStore.getStore();
  if (!ctx) throw new ContextNotFoundError('checkpoint()');
  return ctx.checkpoint(state);
};

export const wallet = new Proxy({}, {
  get(target, prop) {
    const ctx = ctxStore.getStore();
    if (!ctx) throw new ContextNotFoundError('wallet');
    const fn = ctx.wallet[prop];
    if (typeof fn !== 'function') {
      return fn;  // 属性（如 address）
    }
    // 包装函数以保持 this 绑定
    return fn.bind(ctx.wallet);
  }
});

// 错误类
class ContextNotFoundError extends Error {
  constructor(api) {
    super(\`\${api} 仅在 task 执行上下文中可用（test/run/task 目录）\`);
    this.name = 'ContextNotFoundError';
  }
}
```

### 在 Task 中使用

```javascript
// tasks/evm/send/handler.mjs
import { confirm, interact, wallet, getSigner } from 'exec/runtime';

// ═══ 简单二选一确认 ═══
export async function simpleConfirm() {
  const approved = await confirm({
    message: '确认发送交易?',
    details: { to: '0x...', amount: '1 ETH' }
  });
  
  if (!approved) throw new Error('已取消');
  return approved;
}

// ═══ 复杂多字段交互（含密码输入）═══
export async function collectSigningCredentials() {
  const response = await interact({
    type: 'input',
    title: '输入签名信息',
    message: '请提供必要的签名参数',
    fields: [
      {
        name: 'walletAddress',
        type: 'string',
        required: true,
        description: '您的钱包地址'
      },
      {
        name: 'password',
        type: 'password',    // ← 隐藏输入
        required: true,
        description: '钱包密码（不会被记录）'
      },
      {
        name: 'gasPrice',
        type: 'number',
        required: false,
        default: 20,
        description: 'Gas 价格 (Gwei)'
      },
      {
        name: 'network',
        type: 'select',
        required: true,
        options: ['mainnet', 'testnet', 'sepolia'],
        description: '选择目标网络'
      }
    ],
    timeoutMs: 60000  // 60 秒超时
  });
  
  // response = { 
  //   id: 'uuid',
  //   payload: {
  //     walletAddress: '0x...',
  //     password: '***',  // 仅在内存中使用，不会被 log
  //     gasPrice: 25,
  //     network: 'mainnet'
  //   },
  //   actor: 'user',
  //   source: 'cli',
  //   timestamp: 'ISO-8601'
  // }
  
  return response.payload;
}

// 这个函数不接收 ctx，完全通过 runtime helper 访问
export async function processTransaction(txData) {
  const approved = await confirm({
    message: '确认发送交易?',
    details: txData
  });
  
  if (!approved) throw new Error('已取消');
  
  const signer = await getSigner({ chain: 'evm' });
  const tx = await signer.sendTransaction(txData);
  
  return tx;
}

// tasks/evm/send/index.mjs
import { defineTask, input, interact, confirm } from 'exec';
import { processTransaction, collectSigningCredentials } from './handler.mjs';

export default defineTask({
  id: 'evm:send',
  title: 'Send Transaction',
  
  async run(ctx) {
    const { to, amount } = input();  // or ctx.input()
    
    // 方式 1: 简单确认
    const approved = await confirm({
      message: \`确认向 \${to} 发送 \${amount} ETH?\`
    });
    if (!approved) throw new Error('已取消');
    
    // 方式 2: 收集复杂信息（密码输入 + 选择）
    const credentials = await interact({
      type: 'input',
      title: '完成交易',
      fields: [
        {
          name: 'senderAddress',
          type: 'string',
          required: true,
          description: '发送者地址'
        },
        {
          name: 'pinCode',
          type: 'password',
          required: true,
          description: 'PIN 码'
        }
      ]
    });
    
    // credentials.payload = { senderAddress: '0x...', pinCode: '****' }
    
    // 调用不知道 ctx 的嵌套函数
    const tx = await processTransaction({ to, amount, ...credentials.payload });
    
    return { txHash: tx.hash };
  }
});
```

---

## 4️⃣ 任务注册和扫描 (Task Registry)

### 自动扫描

```javascript
// packages/core/src/apps/exec/auto-register.mjs
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TASKS_ROOT = path.resolve(__dirname, '../../tasks');

/**
 * 自动从 tasks/ 目录扫描所有 index.mjs，导入任务定义
 * 约定：
 *   - 文件夹结构：tasks/{type}/{name}/index.mjs
 *   - Task ID：{type}:{name}（或文件中显式指定）
 *   - 导出：default 或 { task }
 */
export async function autoRegisterTasks() {
  const taskMap = new Map();
  
  // 递归扫描 tasks/ 目录
  async function scanDir(dir, pathSegments = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // 递归进入子目录
        await scanDir(fullPath, [...pathSegments, entry.name]);
      } else if (entry.isFile() && entry.name === 'index.mjs') {
        // 找到任务定义
        try {
          const relativePath = path.relative(TASKS_ROOT, fullPath);
          const taskPath = relativePath.replace(/\\index\\.mjs$/, '');
          const [type, ...nameParts] = taskPath.split(path.sep);
          const taskName = nameParts.join('.');
          const taskId = \`\${type}:\${taskName}\`;
          
          const module = await import(\`file://\${fullPath}\`);
          const taskDef = module.default || module.task;
          
          if (!taskDef) {
            console.warn(\`⚠️ 任务文件无 default 或 task 导出: \${fullPath}\`);
            continue;
          }
          
          // 覆盖或设置 task ID
          taskDef.id ??= taskId;
          
          taskMap.set(taskDef.id, taskDef);
          console.log(\`✅ 注册任务: \${taskDef.id}\`);
        } catch (error) {
          console.error(\`❌ 加载任务失败 \${fullPath}:\`, error);
        }
      }
    }
  }
  
  await scanDir(TASKS_ROOT);
  return taskMap;
}

export async function createTaskRegistry() {
  const tasks = await autoRegisterTasks();
  
  return {
    get: (taskId) => tasks.get(taskId),
    has: (taskId) => tasks.has(taskId),
    list: () => Array.from(tasks.values()),
    listIds: () => Array.from(tasks.keys()),
  };
}
```

### 任务注册表接口

```javascript
// Task Registry 需支持的操作
registry.get(taskId)          // 获取单个任务定义
registry.has(taskId)          // 检查任务是否存在
registry.list()               // 列出所有任务定义
registry.listIds()            // 列出所有任务 ID
```

---

## 5️⃣ 执行 (Execution Engine)

### 执行函数

```javascript
// packages/core/src/apps/exec/execute.mjs
import { ctxStore } from './runtime.mjs';

export async function execute(request, options = {}) {
  // 1. 验证和规范化请求
  const { task: taskId, args, source, network, ...rest } = request;
  
  // 2. 解析任务定义
  const registry = options.registry || await createTaskRegistry();
  const taskDef = registry.get(taskId);
  
  if (!taskDef) {
    return {
      ok: false,
      error: new Error(\`任务不存在: \${taskId}\`),
      meta: { task: taskId }
    };
  }
  
  // 3. 验证输入
  const inputErrors = validateInput(taskDef.inputSchema, args);
  if (inputErrors.length > 0) {
    return {
      ok: false,
      error: new Error('输入参数验证失败'),
      details: { errors: inputErrors },
      meta: { task: taskId }
    };
  }

  // 4. 检查策略（readonly、sourcePolicy）
  const policy = evaluatePolicy(taskDef, source, network);
  if (!policy.allowed) {
    return {
      ok: false,
      error: new Error(policy.reason),
      meta: { task: taskId }
    };
  }

  // 5. 确认检查（如果 requiresConfirm）
  if (taskDef.requiresConfirm && options.confirm) {
    const approved = await options.confirm({
      type: 'task.confirm',
      task: taskId,
      args,
      message: taskDef.title,
    });
    if (!approved) {
      return {
        ok: false,
        error: new Error('用户已拒绝'),
        recoverable: true,
        meta: { task: taskId }
      };
    }
  }

  // 6. 创建执行上下文
  const ctx = createExecutionContext({
    task: taskDef,
    inputData: args,
    wallet: options.wallet,
    source,
    network,
    confirmHandler: options.confirm,
    resumeStore: options.resumeStore,
    requestId: options.requestId || generateUUID(),
  });

  // 7. 进入 AsyncLocalStorage 上下文，运行任务
  try {
    const result = await ctxStore.run(ctx, async () => {
      // 触发 lifecycle event
      await emitEvent('execution.started', taskId);
      
      // 执行任务 handler
      const output = await taskDef.run(ctx);
      
      // 验证输出
      if (taskDef.outputSchema) {
        const outputErrors = validateInput(taskDef.outputSchema, output);
        if (outputErrors.length > 0) {
          throw new Error('输出参数验证失败');
        }
      }
      
      await emitEvent('execution.completed', taskId);
      return output;
    });

    return {
      ok: true,
      data: result,
      meta: { task: taskId, requestId: ctx.request.requestId }
    };
  } catch (error) {
    // 处理 checkpoint 暂停
    if (error.isPause) {
      return {
        ok: false,
        error: null,
        paused: true,
        resumeToken: error.token,
        meta: { task: taskId }
      };
    }

    // 处理普通错误
    await emitEvent('execution.failed', taskId, { error: error.message });
    
    return {
      ok: false,
      error,
      meta: { task: taskId, requestId: ctx.request.requestId }
    };
  } finally {
    // 清理
    if (options.onLifecycleEvent) {
      await emitEvent('finished', taskId);
    }
  }
}
```

---

## 6️⃣ 检查点和暂停/恢复 (Checkpoint & Resume)

### 检查点保存

```javascript
// packages/core/src/apps/exec/checkpoint-store.mjs
export class CheckpointStore {
  async save(token, checkpoint) {
    // token: 唯一标识
    // checkpoint: { task, state, timestamp, ... }
    // 实现：文件存储、数据库、内存等
  }

  async load(token) {
    // 返回检查点数据 or null
  }

  async delete(token) {
    // 清理检查点
  }
}

export class FileCheckpointStore extends CheckpointStore {
  constructor(baseDir = './checkpoints') {
    super();
    this.baseDir = baseDir;
  }

  async save(token, checkpoint) {
    const file = path.join(this.baseDir, \`\${token}.json\`);
    await fs.writeFile(file, JSON.stringify({
      token,
      task: checkpoint.task,
      state: sanitizeCheckpointState(checkpoint.state),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }, null, 2));
  }

  async load(token) {
    const file = path.join(this.baseDir, \`\${token}.json\`);
    try {
      const data = await fs.readFile(file, 'utf8');
      const checkpoint = JSON.parse(data);
      
      if (new Date(checkpoint.expiresAt) < new Date()) {
        await this.delete(token);
        return null;
      }
      
      return checkpoint;
    } catch {
      return null;
    }
  }
}
```

### 恢复流程

```javascript
// 执行时处理 resumeToken
export async function executeWithResume(request, options = {}) {
  const { resumeToken, ...execRequest } = request;

  if (resumeToken) {
    // 加载检查点
    const checkpoint = await options.checkpointStore?.load(resumeToken);
    if (!checkpoint) {
      return { ok: false, error: 'Checkpoint 已过期或不存在' };
    }

    // 验证任务匹配
    if (checkpoint.task !== execRequest.task) {
      return { ok: false, error: 'Checkpoint 对应任务不匹配' };
    }

    // 恢复后继续执行
    const ctx = {
      ...options.ctx,
      resumed: () => ({
        active: true,
        state: checkpoint.state,
        token: resumeToken
      })
    };

    // 继续执行...
    return execute({ ...execRequest, ctx }, options);
  }

  return execute(execRequest, options);
}
```

---

## 8️⃣ 交互机制 (Interaction System)

### 两层交互对比

| 维度 | confirm() | interact() |
|------|-----------|-----------|
| **用途** | 简单二选一确认 | 复杂多字段交互 |
| **返回值** | `boolean` | `{ id, payload, actor, source, timestamp }` |
| **支持字段** | 无字段 | 支持多个字段 |
| **字段类型** | - | string、password、number、email、select、upload 等 |
| **密码输入** | ❌ 不支持 | ✅ 支持（隐藏输入） |
| **超时控制** | ❌ 无 | ✅ 支持 timeoutMs |
| **生命周期事件** | confirmation.{requested/approved/rejected} | interaction.{requested/resolved/timeout/cancelled} |
| **应用场景** | 执行前最后确认 | 补充参数、钱包解锁、2FA验证 |
| **示例** | "确认发送 1 ETH?" | "输入钱包密码、选择网络、确认汽油价格" |

### 两层交互模型

#### **第一层：简单确认 (confirm)**
```javascript
// 仅支持 yes/no 二选一
const approved = await ctx.confirm({
  message: '确认操作?',
  details: { to: '0x...', amount: '100' }
});
// 返回: boolean
```

#### **第二层：复杂交互 (interact)** ✨
```javascript
// 支持多字段、多类型输入（可见、密码、数字、选择等）
const response = await ctx.interact({
  type: 'input',
  title: '输入签名信息',
  message: '请完成以下输入',
  fields: [
    // 可见文本输入
    { name: 'address', type: 'string', required: true },
    
    // 密码输入（隐藏）
    { name: 'password', type: 'password', required: true },
    
    // 数字输入
    { name: 'gasPrice', type: 'number', required: false, default: 20 },
    
    // 邮箱输入
    { name: 'email', type: 'email', required: false },
    
    // 下拉选择
    { 
      name: 'network', 
      type: 'select', 
      required: true,
      options: ['mainnet', 'testnet', 'sepolia']
    }
  ],
  timeoutMs: 60000
});
// 返回: { id, payload: {...}, actor, source, timestamp }
```

### 字段类型参考

| 类型 | 说明 | 用途 | 隐私 |
|------|------|------|------|
| `string` | 普通文本 | 地址、描述等 | 不隐藏 |
| `password` | 密码框 | 钱包密码、PIN 码 | **隐藏** |
| `number` | 数字输入 | Gas 价格、数量等 | 不隐藏 |
| `email` | 邮箱输入 | 通知邮箱、账户邮箱 | 不隐藏 |
| `select` | 下拉选择 | 网络选择、账户选择 | 不隐藏 |
| `upload` | 文件上传 | 上传密钥文件、证明文件 | 不隐藏 |
| `custom` | 自定义类型 | - | 不隐藏 |

### 隐私保护

```javascript
// ✅ 密码字段自动过滤，不会出现在日志中
const response = await ctx.interact({
  fields: [
    { name: 'password', type: 'password' }
  ]
});

// response.payload.password 仅在内存中使用
// - 不会被记录到日志
// - 不会被保存到 checkpoint（除非显式指定）
// - 不会出现在生命周期事件中

// ❌ 开发者不应该手动 log 密码
console.log(response.payload.password);  // ← 避免这样做
```

### interact() 生命周期事件

```
interaction.requested
  ↓
user provides input (visible or password)
  ↓
interaction.resolved (仅记录非敏感字段)
```

### 使用场景示例

**场景 1：钱包解锁**
```javascript
const creds = await ctx.interact({
  type: 'input',
  title: '解锁钱包',
  fields: [
    { name: 'keyfile', type: 'upload', required: true, description: '选择 keystore 文件' },
    { name: 'password', type: 'password', required: true, description: '钱包密码' }
  ]
});

await wallet.unlock({
  keyfile: creds.payload.keyfile,
  password: creds.payload.password
});
```

**场景 2：多链选择 + 确认**
```javascript
const config = await ctx.interact({
  type: 'input',
  title: '配置交易',
  fields: [
    { 
      name: 'network', 
      type: 'select', 
      options: ['ethereum', 'bsc', 'polygon'],
      required: true
    },
    { 
      name: 'gasPrice', 
      type: 'number',
      default: 20,
      required: false
    }
  ]
});

const confirmed = await ctx.confirm({
  message: `确认在 ${config.payload.network} 以 ${config.payload.gasPrice} Gwei 发送?`
});
```

**场景 3：2FA 验证**
```javascript
const twoFa = await ctx.interact({
  type: 'input',
  title: '二次验证',
  fields: [
    { 
      name: 'code', 
      type: 'string',
      required: true,
      description: '请输入 6 位验证码'
    }
  ],
  timeoutMs: 300000  // 5 分钟超时
});

if (verify2FA(twoFa.payload.code)) {
  // 继续执行
}
```

---

### 错误类型

```javascript
export class ExecError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ExecError';
    this.code = options.code;           // 错误代码：如 'INPUT_INVALID', 'TASK_NOT_FOUND'
    this.task = options.task;           // 关联任务 ID
    this.recoverable = options.recoverable ?? false;  // 是否可恢复
    this.details = options.details;     // 详细信息
  }
}

export const ERROR_CODES = {
  // 请求错误
  REQUEST_INVALID: 'request_invalid',
  TASK_NOT_FOUND: 'task_not_found',
  INPUT_INVALID: 'input_invalid',

  // 执行错误
  EXECUTION_FAILED: 'execution_failed',
  CONFIRM_REQUIRED: 'confirm_required',
  CONFIRM_REJECTED: 'confirm_rejected',
  CHECKPOINT_FAILED: 'checkpoint_failed',

  // 恢复错误
  RESUME_FAILED: 'resume_failed',
  RESUME_TOKEN_INVALID: 'resume_token_invalid',

  // 系统错误
  CONTEXT_NOT_FOUND: 'context_not_found',
  POLICY_VIOLATION: 'policy_violation',
};
```

### 错误处理最佳实践

```javascript
try {
  const result = await ctx.checkpoint({ phase: 'mid_task' });
  // 如果不支持暂停，返回 error 而不是抛出
} catch (error) {
  if (error.code === 'CHECKPOINT_FAILED') {
    // 处理检查点失败
    // 选项：重试、降级、记录
  }
}
```

---

## � 总结：核心 Action (动作) 集合

| 动作 | 来自 | 触发者 | 目的 |
|------|------|--------|------|
| **loadInput()** | Task Handler | 开发者 | 获取输入参数 |
| **confirm()** | Runtime Helper / ctx | Task Handler | 请求人工确认（二选一） |
| **interact()** | Runtime Helper / ctx | Task Handler | 复杂交互（多字段、密码输入等） |
| **getSigner()** | Runtime Helper / ctx.wallet | Nested Function | 获取签名器 |
| **checkpoint()** | ctx | Task Handler | 保存状态并暂停 |
| **onSuccess()** | ctx | Task Handler | 注册成功回调 |
| **onError()** | ctx | Task Handler | 注册错误回调 |
| **receiveInput()** | Caller | CLI/API/Test | 提供输入参数 |
| **approve/reject** | Caller | User/UI | 确认或拒绝执行 |
| **submitInteraction()** | Caller | User/UI | 提交交互响应（包括密码等） |
| **resumeExecution()** | Caller | CLI/API | 从检查点继续 |
| **emitLifecycleEvent()** | Kernel | Internal | 记录执行状态变化 |

---

## 📝 相比 Legacy 的改善

| 方面 | Legacy | New |
|------|--------|-----|
| **注册方式** | 手动在 index 里写 | 自动扫描 tasks/ 目录 |
| **Context 传递** | 显式参数传递 | AsyncLocalStorage 隐藏 |
| **Helper 访问** | 无统一入口 | exec/runtime 单一入口 |
| **使用范围** | 全项目可用 | 限 test/run/task 三层 |
| **简单确认** | confirm 回调 | ctx.confirm()  |
| **复杂交互** | interact 回调 | ctx.interact() (新增支持多字段、密码) |
| **密码输入** | 需要自定义 | 内置 field type='password' 支持 |
| **隐私过滤** | 手动处理 | 自动过滤敏感字段 |
| **Checkpoint** | 通过 interact 机制 | 直接 checkpoint() 调用 |
| **错误处理** | ExecError 统一格式 | 保持，增加 code 和 recoverable |
| **代码复用** | 需要手动传 ctx | 通过运行时 helper 自动注入 |
| **嵌套函数** | 必须传 ctx | 无需修改签名 |