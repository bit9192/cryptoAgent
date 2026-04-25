# contractHelper 开发守则 · Development Standards

本文档统一定义 contractHelper 工作区的**文件命名、代码结构和开发规范**，所有新增代码必须遵守。

---

## 目录

1. [文件命名规范](#一文件命名规范)
2. [代码结构规范](#二代码结构规范)
3. [模块导出规范](#三模块导出规范)
4. [测试文件规范](#四测试文件规范)
5. [文档文件规范](#五文档文件规范)
6. [配置驱动开发规范](#六配置驱动开发规范)
7. [快速参考](#七快速参考)

---

## 一、文件命名规范

### 1.1 JavaScript/TypeScript 文件

#### 通用规则

```
✅ 使用小写或 kebab-case（带连字符）
✅ 清晰表达文件用途
✅ avoid 过长（上限 40 字符）
✅ 使用 .mjs（ES modules）或 .js（CommonJS，仅 config/）

❌ 避免 CamelCase 文件名
❌ 避免 UPPER_CASE 文件名
❌ 避免特殊字符除了 - 和 _
```

#### 按文件类型分类

##### A. 模块入口文件

| 文件名 | 用途 | 位置 | 例子 |
|--------|------|------|------|
| `index.mjs` | 模块默认导出 | 任何模块目录 | `src/apps/evm/index.mjs` |
| `index.js` | CommonJS 模块导出 | config/ | `config/networks.ts` 的 re-export |

##### B. 核心功能文件

```
单一名词 + 可选后缀形式：
  <noun>.mjs          ← 单一能力模块
  <noun>-<verb>.mjs   ← 带操作的功能模块
  <noun>-<type>.mjs   ← 按类型分化的模块
```

**规范例子**：

| 文件名 | 说明 | 位置 |
|--------|------|------|
| `provider.mjs` | Provider 工厂 | `src/apps/evm/` |
| `deploy.mjs` | 合约部署能力 | `deploy/evm/` |
| `accounts.mjs` | 账户管理 | `deploy/evm/` |
| `price-quote.mjs` | 价格报价（如有需要） | `deploy/evm/` |
| `fork-state.mjs` | Fork 状态管理 | `src/apps/evm/fork/` |
| `import-accounts.mjs` | 账户冒充（importAddress） | `src/apps/evm/fork/` |

**写法统一**：
- 动作类：`import-accounts.mjs`（不是 `importAccounts.mjs`）
- 数据类：`deploy.mjs`、`provider.mjs`
- 状态类：`fork-state.mjs`（不是 `forkState.mjs`）

##### C. 任务定义文件

```
<domain>/<task-category>/index.mjs

命名约定：Domain 类（evm / btc / key / offchain）
```

**例子**：
- `tasks/evm/index.mjs` — EVM 任务合集
- `tasks/btc/index.mjs` — BTC 任务合集
- `tasks/key/index.mjs` — Key 管理任务

##### D. 脚本和 CLI 文件

```
<verb>-<noun>.mjs       ← 单一命令脚本
<verb>-<noun>-<subject>.mjs ← 复杂脚本

首字母小写，使用 kebab-case
```

**例子**：

| 文件名 | 用途 | 对应命令 |
|--------|------|---------|
| `start-fork.mjs` | 启动 Fork 节点 | `npm run fork` |
| `check-import-address.mjs` | 诊断工具 | `node check-import-address.mjs` |
| `fork-transfer-demo.mjs` | 演示脚本 | `node fork-transfer-demo.mjs` |
| `send.mjs` | 发送转账 CLI | `yarn send` |
| `list-deployments.mjs` | 列出部署记录 | `yarn deploy:list` |

##### E. 配置文件

```
config.<type>.ts        ← 配置文件
<service>-config.js     ← 服务配置
hardhat.config.js       ← Hardhat 配置
```

**例子**：
- `config.ts` / `cex.ts` / `chains.mjs` — 通用配置
- `network.btc.ts` — BTC 网络配置
- `hardhat.config.js` — Hardhat 配置

##### F. 工具函数文件

```
<domain>-<util-type>.mjs

简短动作+目标
```

**例子**：
- `address-utils.js` — 地址工具函数
- `contract-utils.mjs` — 合约工具函数
- `error-handler.mjs` — 错误处理工具

##### G. 测试文件

```
<module-name>.test.mjs           ← 单模块测试
<module-name>.integration.test.mjs ← 集成测试
<feature-name>.e2e.test.mjs      ← E2E 测试
```

**例子**：
- `deploy.test.mjs` — 部署模块测试
- `fork-network.integration.test.mjs` — Fork 网络集成测试
- `swap-flow.e2e.test.mjs` — Swap 完整流程测试

##### H. 文档文件

```
<feature>-GUIDE.md              ← 功能指南
<FEATURE>_REQUIRED.md           ← 必读文档
CONVENTIONS.md / STANDARDS.md   ← 约定俗成
```

**例子**：
- `IMPORT_ACCOUNTS_GUIDE.md` — importAddress 使用指南
- `FORK_IS_REQUIRED.md` — Fork 环境必读
- `FORK_TESTING_GUIDE.md` — Fork 测试指南
- `ARCHITECTURE_CONVENTIONS.md` — 架构规范

### 1.2 目录命名规范

```
所有目录使用小写或 kebab-case

✅ src/apps/evm/fork/
✅ packages/core/src/apps/evm/
✅ deploy/offchain/
✅ scripts/runtime/

❌ src/apps/EVM/
❌ packages/Core/
❌ deploy/OffChain/
```

#### 按用途分类

| 目录名 | 用途 | 位置 |
|--------|------|------|
| `apps/` | 各链应用（evm / btc / trx） | `src/` |
| `deploy/` | 链上/链下能力实现 | `packages/core/src/apps/` |
| `tasks/` | 任务定义和注册 | `packages/core/src/tasks/` |
| `modules/` | 独立子系统 | `packages/core/src/modules/` |
| `config/` | 网络配置 | `packages/core/src/apps/*/config/` |
| `contracts/` | 合约源代码 | 各包内 |
| `artifacts/` | 编译产物 | 各包内 |
| `test/` | 测试文件 | `src/` 下同级 |
| `scripts/runtime/` | CLI 适配脚本 | `packages/core/scripts/runtime/` |
| `scripts/run/` | 开发调试脚本 | `packages/core/src/run/` |
| `fork/` | Fork 网络工具 | `src/apps/evm/` |

### 1.3 导出和 Re-export 文件名

#### index.mjs 的用途

```javascript
// ✅ 正确：汇聚并导出该模块的所有公开 API
export {} from "./deploy.mjs";
export {} from "./provider.mjs";
export { ... } from "./fork/index.mjs";

// ❌ 错误：不是简单的 re-export，应改成具体名称
export function complexLogic() { ... }  // ✗ 应在 complex-logic.mjs 里定义
```

#### 特殊导出文件名

| 文件名 | 含义 | 例子 |
|--------|------|------|
| `__fixtures__.mjs` | 测试数据 | `test/__fixtures__.mjs` |
| `__setup__.mjs` | 测试初始化 | `test/__setup__.mjs` |
| `__mocks__.mjs` | Mock 对象 | `test/__mocks__.mjs` |

---

## 二、代码结构规范

### 2.1 模块结构

```
src/apps/evm/
├── index.mjs           ← 默认导出（汇总该领域所有公开 API）
├── provider.mjs        ← 核心实现
├── deploy.mjs          ← 合约部署
├── erc20.mjs           ← ERC20 操作
├── fork/
│   ├── index.mjs       ← Fork 子模块导出
│   ├── import-accounts.mjs  ← 账户冒充
│   ├── node.mjs        ← Fork 状态管理
│   └── IMPORT_ACCOUNTS_GUIDE.md
├── dapps/
│   ├── index.mjs
│   ├── swapv2.mjs
│   ├── swapv3.mjs
│   └── dapp-resolver.mjs
└── test/
    ├── deploy.test.mjs
    └── fork-network.integration.test.mjs
```

**设计原则**：
- ✅ 每个文件一个主要职责
- ✅ 相关功能分组在子目录（如 `fork/`、`dapps/`）
- ✅ `index.mjs` 只负责 re-export，不实现业务逻辑
- ✅ 测试与源文件相同目录结构

### 2.2 导入导出模式

#### 导出规范

```javascript
// ✅ 命名导出（明确）
export { importAddress };
export { removeImportedSigner };
export async function deploy() { ... }

// ✅ 默认导出（仅当模块只有一个主功能时）
export default ImportAddress;

// ❌ 混淆导出
export = { ... }; // ✗ CommonJS 模式不用在 .mjs 中

// ❌ 导出过多
export { a, b, c, d, ... }; // ✓ 可以，但在 index.mjs 中汇总
```

#### 导入规范

```javascript
// ✅ 具体导入
import { importAddress, getCachedImportedSignerAddresses } from "@ch/core";

// ✅ 模块导入
import * as fork from "./fork/index.mjs";
const signer = await fork.importAddress("0x...");

// ❌ 避免默认导入（除非必要）
import DefaultExport from "./module.mjs"; // ✗ 模糊

// ❌ 避免混用相对和绝对路径
import { foo } from "@ch/core";  // ✓ 用 @ch/core
import { bar } from "../../../deploy/index.mjs"; // ✗ 改成 @ch/core 的公开导出
```

---

## 三、模块导出规范

### 3.1 根入口导出

**`packages/core/src/index.mjs`** - 核心模块应导出所有公开 API

```javascript
// ✅ 按领域分类导出
export { createEvmProvider } from "./apps/evm/provider.mjs";
export { importAddress, removeImportedSigner } from "./apps/evm/fork/import-accounts.mjs";
export * as dapps from "./apps/evm/dapps/index.mjs";

// ✅ 命名空间导出
export { routerV2, deploySwapV2 } from "./apps/evm/dapps/swapv2.mjs";
export { routerV3, deploySwapV3 } from "./apps/evm/dapps/swapv3.mjs";

// ❌ 避免嵌套命名空间导出
export * from "./legacy-compat.mjs"; // ✗ 用具体导入
```

### 3.2 子模块导出

**`packages/core/src/apps/evm/index.mjs`** - 子领域导出

```javascript
export { createEvmProvider } from "./provider.mjs";
export { createErc20 } from "./erc20.mjs";
export * as fork from "./fork/index.mjs";  // Fork 工具namespace
export * as dapps from "./dapps/index.mjs";  // DApp 工具namespace
```

### 3.3 命名空间设计

```javascript
// ✅ 使用命名空间整理相关功能
import { importAddress, getCachedImportedSignerAddresses } from "@ch/core";

// 或

import * as fork from "@ch/core/fork";
const signer = await fork.importAddress("0x...");

---

## 六、配置驱动开发规范

目标：避免同一份业务配置在多个文件重复硬编码，降低改动漏改风险。

### 6.1 单一配置源（Single Source of Truth）

1. 网络列表、链 ID、RPC、主网标记等基础配置，必须以 `apps/*/config` 为唯一来源。
2. 业务模块（provider、task、search、adapter）禁止重复手写同一份网络清单。
3. 若模块需要网络列表，必须通过配置模块动态派生。

示例：

- ✅ 正确：从 `apps/evm/configs/networks.js` 派生 provider 的 `networks`。
- ❌ 错误：在 provider 内写死 `networks: ["eth", "bsc"]`。

### 6.2 禁止重复硬编码

以下字段若已在配置中定义，业务代码不得再次硬编码：

1. 网络名列表（如 eth/bsc/fork）。
2. chainId 与主网/测试网标识。
3. explorer URL、gas token、source policy。
4. 同一 domain 的 capability 白名单。

### 6.3 允许硬编码的例外

仅以下场景允许短期硬编码，且必须写注释说明迁移计划：

1. 启动兜底值（配置缺失时最小可运行 fallback）。
2. 测试桩与 mock 数据（仅测试目录）。
3. 历史兼容层（需标注删除条件）。

### 6.4 开发与评审检查项

每次涉及网络/链配置的开发，必须检查：

1. 新增网络是否只在配置文件中增加一次。
2. provider/task/search 是否通过配置派生，而非复制数组。
3. 是否新增测试断言“模块配置与配置源一致”。
4. 文档是否标注配置来源路径。

### 6.5 AI 开发强制规则

1. AI 修改网络相关逻辑前，先读取对应 `configs/*.js|ts`。
2. 若发现业务层存在重复配置，优先重构为“配置派生”。
3. 未确认配置源前，不得提交新的硬编码网络列表。

// ❌ 避免过度嵌套
import fork from "@ch/core";  // 不清楚 fork 是什么
```

---

## 四、测试文件规范

### 4.1 测试文件命名

```
<module>.test.mjs               ← 单元测试
<feature>.integration.test.mjs  ← 集成测试
<workflow>.e2e.test.mjs         ← 端对端测试
```

**例子**：
- `deploy.test.mjs` — 部署模块单元测试
- `swaps.test.mjs` — Swap V2/V3 集成测试
- `fork-network.integration.test.mjs` — Fork 网络集成测试

### 4.2 测试框架约定

```javascript
// ✅ 使用 node:test（Node 18+）
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("Module Name", () => {
  it("should do something", async () => {
    assert.equal(result, expected);
  });
});

// ✓ Before/After hooks
before(async () => { /* setup */ });
after(async () => { /* cleanup */ });

// ❌ 避免 Jest/Mocha 特有语法（项目已迁移到 node:test）
describe.skip("test"); // ✗
it.only("test"); // ✗
```

### 4.3 测试数据和 Mock 文件

```
test/
├── __setup__.mjs      ← 全局测试初始化
├── __fixtures__.mjs   ← 测试数据
├── __mocks__.mjs      ← Mock 对象
└── modules/
    └── module.test.mjs
```

---

## 五、文档文件规范

### 5.1 文档文件命名

```
✅ <FEATURE>_GUIDE.md            ← 功能使用指南
✅ <FEATURE>_REQUIRED.md         ← 必读指南
✅ CONVENTIONS.md / STANDARDS.md ← 约定俗成
✅ README.md                     ← 项目根文档

❌ <feature>Guide.md             ✗ 改成 UPPER_CASE
❌ guide-feature.md              ✗ 改成 UPPER_CASE_WITH_UNDERSCORES
```

**例子**：
- `IMPORT_ACCOUNTS_GUIDE.md` — importAddress 使用指南
- `FORK_IS_REQUIRED.md` — Fork 必读
- `FORK_TESTING_GUIDE.md` — Fork 测试指南
- `ARCHITECTURE_CONVENTIONS.md` — 架构约定

### 5.2 文档内容组织

```markdown
# 标题 · English Title

## 概述 (Overview)

## 快速开始 (Quick Start)

## 使用示例 (Usage Examples)

## API 参考 (API Reference)

## 常见问题 (FAQ)

## 故障排除 (Troubleshooting)

## 参考资源 (References)
```

---

## 七、快速参考

### 文件命名检查清单

```
□ 是否全部小写或 kebab-case？
□ 是否清晰表达文件用途？
□ 是否在 40 字符以内？
□ 是否避免了 CamelCase 或 UPPER_CASE？
□ 如果是 ES module，是否用了 .mjs？
□ 如果是 CommonJS config，是否用了 .js？
□ 如果是文档，是否用了 UPPER_CASE？
□ 如果是脚本，是否用了 <verb>-<noun>.mjs？
```

### 推荐的文件夹结构

```
packages/core/
├── src/
│   ├── index.mjs                      ← 根导出
│   ├── apps/
│   │   ├── evm/
│   │   │   ├── index.mjs
│   │   │   ├── provider.mjs
│   │   │   ├── erc20.mjs
│   │   │   ├── fork/
│   │   │   │   ├── index.mjs
│   │   │   │   ├── import-accounts.mjs
│   │   │   │   ├── node.mjs
│   │   │   │   └── IMPORT_ACCOUNTS_GUIDE.md
│   │   │   └── dapps/
│   │   │       ├── index.mjs
│   │   │       ├── swapv2.mjs
│   │   │       ├── swapv3.mjs
│   │   │       └── dapp-resolver.mjs
│   │   ├── btc/
│   │   │   ├── index.mjs
│   │   │   └── provider.mjs
│   │   └── offchain/
│   │       └── index.mjs
│   ├── test/
│   │   ├── apps/
│   │   │   └── evm/
│   │   │       ├── dapps/
│   │   │       │   └── swaps.test.mjs
│   │   │       └── fork-network.integration.test.mjs
│   │   └── __fixtures__.mjs
│   ├── cli/
│   │   └── (CLI 入口脚本)
│   └── (其他模块)
├── scripts/
│   ├── runtime/
│   │   ├── start-fork.mjs
│   │   ├── send.mjs
│   │   └── (其他 CLI 脚本)
│   └── run/
│       └── (开发调试脚本)
├── hardhat.config.js
├── package.json
└── FORK_IS_REQUIRED.md
```

###导出链示例

```javascript
// packages/core/src/index.mjs
export { importAddress } from "./apps/evm/fork/import-accounts.mjs";
export * as fork from "./apps/evm/fork/index.mjs";

// packages/core/src/apps/evm/index.mjs
export { importAddress } from "./fork/import-accounts.mjs";
export * as fork from "./fork/index.mjs";

// packages/core/src/apps/evm/fork/index.mjs
export { importAddress, removeImportedSigner } from "./import-accounts.mjs";
export * from "./node.mjs";
```

### 常见命名错误表

| ❌ 错误 | ✅ 正确 | 原因 |
|--------|--------|------|
| `ImportAccounts.mjs` | `import-accounts.mjs` | 文件名应全小写 kebab-case |
| `improtAccounts.mjs` | `import-accounts.mjs` | 避免 CamelCase |
| `IMPORT_ACCOUNTS.mjs` | `import-accounts.mjs` | UPPER_CASE 仅用于文档 |
| `import_accounts.mjs` | `import-accounts.mjs` | kebab-case（带连字符）而不是 snake_case |
| `check_import.mjs` | `check-import.mjs` | kebab-case 规范 |
| `ForkTestingGuide.md` | `FORK_TESTING_GUIDE.md` | 文档用 UPPER_CASE_WITH_UNDERSCORES |
| `fork-testing-guide.md` | `FORK_TESTING_GUIDE.md` | 文档用 UPPER_CASE |

---

## 附注

本规范参照 **Airbnb JavaScript 风格指南** 和 **Google Shell 风格指南** 的命名规范改编。

如有新增规范需求，应更新本文档并通知所有开发人员。
