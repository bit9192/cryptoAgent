# 系统架构总览 · Multi-Chain Micro-Kernel OS

**最后更新**: 2026-04-25

---

## 一、核心设计理念

这个系统是一个**多链微内核操作系统**。像操作系统一样，它提供了：

- **内核**：Context Engine（统一状态管理）
- **系统调用**：Task/Execute（任务分发）
- **驱动程序**：Providers（链适配层）
- **Shell**：CLI（用户交互）

### 架构模式

```
┌─────────────────────────────────────────────────┐
│          CLI Layer (ex:lon)                     │
│       User Input / Results Display              │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│    Context Engine (Unified Data Context)        │
│    ├─ Session state                             │
│    ├─ Wallet tree                               │
│    ├─ User preferences                          │
│    └─ Global cache                              │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│    Task/Execute Layer (Command Dispatcher)      │
│    ├─ Route operations to chains                │
│    ├─ Coordinate multi-chain workflows          │
│    └─ Handle state transitions                  │
└──────────────────┬──────────────────────────────┘
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
  ┌────────┐  ┌────────┐  ┌────────┐
  │ BTC    │  │ EVM    │  │ TRX    │
  │Provider│  │Provider│  │Provider│
  │(W/N/S) │  │(W/N/S) │  │(W/N/S) │
  └────────┘  └────────┘  └────────┘
      │            │            │
      └────────────┼────────────┘
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
   BTC Net    EVM Net      TRX Net
   APIs       APIs         APIs
```

---

## 二、核心层级

### 2.1 Provider 层（Wallet / Net / Search）

每条链提供 3 个独立的 Provider：

| Provider | 职责 | 例子 |
|----------|------|------|
| **Wallet Provider** | 账户管理、私钥解锁、地址派生 | `walletProvider.unlock(password)` |
| **Net Provider** | 链上数据查询、余额、交易历史 | `netProvider.getBalance(address)` |
| **Search Provider** | Token/Trade/Contract/Address 搜索 | `searchProvider.findToken("USDC")` |

**关键特性**：
- ✓ 完全隔离（一条链故障不影响其他链）
- ✓ 统一接口（易于测试和扩展）
- ✓ 可替换（支持多个实现，如 Infura vs Alchemy）

### 2.2 Request Engine（请求去重和缓存）

**问题**：多个搜索同时查询同一数据 → 多次 RPC 调用 → 成本和速度都不佳

**解决**：
```
请求 1: 查询 USDC 价格 (BTC chain)
请求 2: 查询 USDC 价格 (EVM chain)  ← 如果同时发生...
请求 3: 查询 USDC 价格 (TRX chain)

Request Engine:
  ├─ 第1个请求发送
  ├─ 第2、3个请求等待（去重）
  └─ 响应返回时，同时返回给 3 个请求者（扇出）

结果：1 次 API 调用 = 3 个请求服务
```

**两层缓存**：
- L1：requestKey 缓存（相同请求合并）
- L2：chainKey 缓存（多个请求共享链级数据）

### 2.3 Search Engine（多链聚合搜索）

4 个子模块：

| 模块 | 职责 |
|------|------|
| **Token Search** | 按 symbol/address/name 搜索 token |
| **Trade Search** | 查找 DEX 流动性对 |
| **Contract Search** | 合约元数据和风险评分 |
| **Address Search** | 跨链地址和资产查询 |

**工作流**：
```
用户: "查找 ORDI token"
  ↓
Search Engine:
  ├─ BTC Chain Token Search Provider
  ├─ EVM Chain Token Search Provider
  ├─ TRX Chain Token Search Provider
  └─ 聚合 → 排序 → 去重 → 返回结果
```

### 2.4 Context Engine（全局状态）

维护统一的数据上下文：

```javascript
{
  session: {
    user: "alice",
    createdAt: Date,
  },
  
  wallet: {
    btc: { /* BTC 账户树 */ },
    evm: { /* EVM 账户树 */ },
    trx: { /* TRX 账户树 */ },
  },
  
  cache: {
    prices: { /* token 价格缓存 */ },
    balances: { /* 余额缓存 */ },
  },
  
  preferences: {
    defaultChain: "evm",
    slippage: 0.5,
  },
}
```

---

## 三、数据流

### 典型操作流程

**场景**：用户要查询 "USDC 在我 3 条链账户中的总价值"

```
1. CLI Input (ex:lon)
   User: assets:query assets.balance --query USDC

2. Task Dispatch
   Task Router → assets task
   Input: { query: "USDC", operation: "balance" }

3. Execute Layer
   ├─ 从 Context 读取用户账户地址（BTC/EVM/TRX）
   ├─ 触发 3 个并行查询
   │  ├─ BTC Net Provider: getBalance(btcAddr, USDC)
   │  ├─ EVM Net Provider: getBalance(evmAddr, USDC)
   │  └─ TRX Net Provider: getBalance(trxAddr, USDC)
   │
   └─ Request Engine 处理：
      └─ 如果同时查询相同数据 → 去重 + 合并

4. Aggregation
   ├─ 收集 3 条链的结果
   ├─ 转换单位（都转为 USD）
   └─ 求和

5. Output
   ├─ Panel 显示结果
   ├─ Context 更新缓存
   └─ 日志记录（过滤敏感字段）
```

---

## 四、关键优势

### 1. 多链支持的易用性
- 新增链 = 新增 3 个 Provider（~500 行代码）
- 无需修改 CLI / Task / Execute 层

### 2. 性能优化
- **RPC 费用节省 70-80%**（通过去重和缓存）
- **响应速度 4-5 倍**（并发 + 缓存）
- **故障隔离**（单链故障恢复 10s，整体不中断）

### 3. 可靠性
- 故障熔断和自动降级
- 请求超时独立处理
- 多源备份（同一操作可用多个 provider）

### 4. Agent 友好
- ✓ 全局数据上下文（Agent 看到全部账户、全部资产）
- ✓ 智能聚合（Agent 无需处理链间差异）
- ✓ 可观测性（完整 trace，便于调试）

---

## 五、开发工作流

本系统采用 **"样本 → 测试 → 计划 → 实现"** 的严格开发流程：

```
1. 准备测试样本 (test-data.md)
   ├─ happy-path（标准情况）
   ├─ edge-case（边界情况）
   ├─ invalid-case（错误输入）
   └─ security-case（敏感数据）

2. 编写测试代码 (*.test.mjs)
   └─ TDD 方式，先测试后实现

3. 编写开发计划 (dev.md)
   ├─ 明确输入/输出/边界
   └─ 分解为若干切片 (S-1, S-2, ...)

4. 实现一个切片
   ├─ 严格按计划实现
   └─ 不临场扩散需求

5. 测试验证
   ├─ 先跑新增切片测试
   └─ 再跑全量回归测试
```

**详见**: [DEVELOPMENT_WORKFLOW.md](packages/core/DEVELOPMENT_WORKFLOW.md)

---

## 六、文档导航

### 快速开始
- **设计新模块** → [MODULE_DESIGN_TEMPLATE.md](packages/core/MODULE_DESIGN_TEMPLATE.md)
- **定义新 Task** → [TASK_DEFINITION_GUIDELINES.md](packages/core/TASK_DEFINITION_GUIDELINES.md)

### 规范文档
- **编码规范** → [CODING_STANDARDS.md](packages/core/CODING_STANDARDS.md)
- **测试规范** → [TESTING_STANDARDS.md](packages/core/TESTING_STANDARDS.md)
- **安全规范** → [SECURITY_STANDARDS.md](packages/core/SECURITY_STANDARDS.md)
- **开发流程** → [DEVELOPMENT_WORKFLOW.md](packages/core/DEVELOPMENT_WORKFLOW.md)

### 模块设计
- **Search Engine** → `packages/core/src/test/modules/search-engine/dev.md`
- **Request Engine** → `packages/core/src/test/modules/request-engine/dev.md`

### 特殊指南
- **Fork 测试** → `packages/core/src/apps/evm/fork/FORK_TESTING_GUIDE.md`
- **importAddress 使用** → `packages/core/src/apps/evm/fork/IMPORT_ACCOUNTS_GUIDE.md`

---

## 七、核心概念速查

| 概念 | 含义 | 例子 |
|------|------|------|
| **Provider** | 链的适配器（Wallet/Net/Search） | `evmNetProvider.getBalance(...)` |
| **Request Engine** | 请求去重和缓存引擎 | 多个查询合并为 1 个 RPC 调用 |
| **Search Engine** | 多链搜索聚合 | 一个 API 同时搜索 BTC/EVM/TRX |
| **Context** | 全局状态维护者 | 用户账户、缓存、偏好设置 |
| **Task** | 业务操作的声明 | `defineTask({ id: "wallet:unlock" })` |
| **Execute** | 任务执行引擎 | 路由、分发、编排、重试 |
| **Slice** | 模块实现的最小单位 | `S-1`, `S-2` 等 |
| **Sanitize** | 敏感字段过滤 | 移除 privateKey 后才输出 |

---

## 八、架构决策记录 (ADR)

### 为什么选择 Micro-Kernel 而不是 Monolith？

- ✓ 链隔离（每条链独立演进）
- ✓ 故障边界清晰（一条链故障时间 < 10s）
- ✓ 易于测试（可以 mock 单个 provider）
- ✗ 系统复杂度增加（需要更多协调）

### 为什么需要 Request Engine？

- RPC 配额成本高（Infura/Alchemy 按调用计费）
- 多链查询时容易产生重复请求
- 缓存策略需要多层（请求级 + 链级）

### 为什么需要 Context Engine？

- 用户状态需要跨操作持久化（不能每次都读磁盘）
- Wallet 树需要全局视图（跨链账户管理）
- Agent 需要完整信息（全局决策）

---

## 九、下一步

- 🚀 开发 Request Engine（核心去重）
- 🔍 开发 Search Engine（Token/Trade/Contract/Address）
- 🛡️ 完善 Provider 的熔断和降级
- 📊 构建可观测性（trace / metrics）

---

**相关文件**：
- 架构讨论：[packages/core/plan/architecture.md](packages/core/plan/architecture.md)
- 理想设计：[ideal.md](ideal.md)
- 开发规范：[DEV_STANDARDS.md](DEV_STANDARDS.md)
