# 如何设计一个新模块

**最后更新**: 2026-04-25

本文档提供了设计新模块时的检查清单和思考框架。

---

## 快速开始

### 你想设计什么？

#### A. 新的 Chain Provider（如 Solana）
→ [跳到 A 部分](#a-chain-provider)

#### B. 新的 Search 子模块（如 Liquidity Search）
→ [跳到 B 部分](#b-search-subsystem)

#### C. 新的 Utility 模块（如 Notification Engine）
→ [跳到 C 部分](#c-utility-module)

#### D. 新的 Task（如 Bridge Transfer）
→ [跳到 D 部分](#d-task)

---

## A. Chain Provider

### 场景：添加对 Solana 链的支持

### A.1 前置理解

- Solana 的账户模型
- Solana 的 RPC 接口
- 与 EVM / BTC / TRX 的差异

### A.2 设计检查清单

```
基本问题：
  □ Solana 是否有 Wallet Provider 的需要？
    └─ 是：管理私钥、派生地址
  □ Solana 是否有 Net Provider 的需要？
    └─ 是：查询余额、交易历史
  □ Solana 是否有 Search Provider 的需要？
    └─ 是：搜索 token、DEX 流动性

架构决策：
  □ 公钥格式（BS58 vs Hex）
  □ 地址派生路径（BIP44 vs Solana standard）
  □ 签名方式（EdDSA vs ECDSA）
  □ 缓存策略（会不会与 EVM 冲突？）

依赖分析：
  □ 需要哪些第三方库？
  □ 与 Request Engine 的集成？
  □ 与 Context Engine 的集成？

测试策略：
  □ 能用 testnet 测试吗？
  □ 需要 devnet mint 账户吗？
```

### A.3 实现结构

```
src/apps/solana/
  ├── index.mjs                    ← 导出
  ├── config/
  │   ├── networks.mjs             ← Solana 网络配置
  │   └── constants.mjs
  ├── wallet-provider.mjs          ← Wallet Provider 实现
  ├── net-provider.mjs             ← Net Provider 实现
  ├── search-provider.mjs          ← Search Provider 实现
  ├── utils/
  │   ├── address-format.mjs       ← 地址格式化
  │   └── signature.mjs            ← 签名工具
  └── test/
      ├── test-data.md
      ├── solana.test.mjs
      └── dev.md

src/test/apps/solana/
  ├── dev.md                       ← 开发计划
  ├── test-data.md                 ← 测试样本
  └── solana.test.mjs              ← 测试代码
```

### A.4 第一步：dev.md 规划

```markdown
# Solana Provider 开发计划

## 需求理解

### Wallet Provider
- 输入：派生路径 "m/44'/501'/0'/0'"
- 输出：{ address, publicKey, signer }

### Net Provider
- getBalance(address): Promise<{balance, decimals}>
- getTokenBalance(address, mint): Promise<{balance}>

### Search Provider
- findToken(symbol): Promise<Token[]>

## 设计决策

### 地址格式
- 使用 BS58（Solana 标准）
- 内部转换为 Uint8Array 操作

### Provider 模式
- 每个 provider 独立文件（wallet-provider.mjs 等）
- 统一通过 index.mjs 导出

## 切片计划

### S-1: Wallet Provider - 地址派生
### S-2: Wallet Provider - 签名
### S-3: Net Provider - 余额查询
### S-4: Search Provider - Token 搜索
```

---

## B. Search 子系统

### 场景：添加 Liquidity Search

### B.1 前置理解

- 流动性信息的数据源
- 多个 DEX 的 API 差异
- 缓存和更新频率

### B.2 设计检查清单

```
功能定义：
  □ 搜索什么？流动性对、交易对、流动性深度
  □ 搜索范围？单链还是跨链？
  □ 返回数据结构是什么？

多链支持：
  □ 是否每条链都需要实现？
  □ 是否需要聚合和排序？
  □ 如何处理链间差异？

缓存策略：
  □ 流动性变化多快？
  □ 缓存时长多少？
  □ 是否需要 Request Engine 去重？

数据源：
  □ 链上 RPC 查询
  □ 还是第三方 API（CoinGecko、1inch）？
  □ 是否需要多源备份？
```

### B.3 实现结构

```
src/modules/search-engine/liquidity-search/
  ├── index.mjs                    ← 导出
  ├── core.mjs                     ← 核心聚合逻辑
  ├── aggregator.mjs               ← 多链聚合
  └── test/
      ├── test-data.md
      ├── liquidity-search.test.mjs
      └── dev.md

src/apps/{chain}/liquidity-search-provider.mjs
  ├── BTC 实现
  ├── EVM 实现
  ├── TRX 实现
```

### B.4 第一步：dev.md 规划

```markdown
# Liquidity Search 开发计划

## 需求理解

### 输入
- token0: "USDC"
- token1: "USDT"
- chain: "evm" | "btc" | "trx"

### 输出
[
  {
    pair: "USDC/USDT",
    reserve0: "1000000",
    reserve1: "1000000",
    dex: "uniswap-v2",
    chain: "evm",
    fee: "0.3%"
  }
]

## 设计决策

### 多链支持
- 每条链独立 provider
- Search Engine 聚合

### 缓存
- 1 分钟更新一次
- Request Engine 去重

## 切片计划

### S-1: 单链查询（EVM）
### S-2: 多链聚合
### S-3: 排序和去重
```

---

## C. Utility 模块

### 场景：添加 Notification Engine

### C.1 前置理解

- 通知触发的条件
- 通知的传输方式（Email、Webhook、Push）
- 与 Context Engine 的关系

### C.2 设计检查清单

```
功能范围：
  □ 通知什么类型的事件？
  □ 通知的接收人（用户、管理员）？
  □ 是否需要持久化存储？

集成点：
  □ 与 Task 的集成
  □ 与 Context Engine 的集成
  □ 是否是 Provider 模式？

依赖关系：
  □ 是否依赖其他模块？
  □ 是否被其他模块依赖？
  □ 是否需要访问敏感数据？

错误处理：
  □ 通知失败如何重试？
  □ 是否需要队列机制？
  □ 超时处理？
```

### C.3 实现结构

```
src/modules/notification/
  ├── index.mjs                    ← 导出
  ├── engine.mjs                   ← 核心引擎
  ├── channels/
  │   ├── email.mjs
  │   ├── webhook.mjs
  │   └── push.mjs
  ├── queue.mjs                    ← 通知队列
  └── test/
      ├── test-data.md
      ├── notification.test.mjs
      └── dev.md
```

### C.4 第一步：dev.md 规划

```markdown
# Notification Engine 开发计划

## 需求理解

### 触发事件
- wallet.unlocked
- transaction.confirmed
- price.alert

### 通知渠道
- Email
- Webhook
- Browser Push（可选）

## 设计决策

### 队列机制
- 使用内存队列
- 支持失败重试

### 关键问题
- 是否需要 Notification Task？
- 还是仅作为库被其他 Task 调用？

## 切片计划

### S-1: 通知引擎核心
### S-2: Email 渠道
### S-3: Webhook 渠道
```

---

## D. Task

### 场景：添加 Bridge Transfer Task

### D.1 前置理解

- 跨链桥接的工作流程
- 目标链和源链的交互
- 错误处理和回滚

### D.2 设计检查清单

```
任务定义：
  □ Task ID：bridge:transfer
  □ 支持的操作：estimate、preview、execute、confirm
  □ 输入参数：sourceChain、destChain、token、amount
  □ 输出参数：txHash、status

多链调度：
  □ 是否涉及多个 Provider？
  □ 如何协调源链和目标链的操作？
  □ 失败后的回滚策略？

权限检查：
  □ 是否需要用户确认？
  □ 是否涉及私钥？
  □ 是否需要 Scope 隔离？

状态管理：
  □ 使用 Context Engine 存储状态？
  □ 还是 Storage 层？
  □ 断点恢复策略？
```

### D.3 实现结构

```
src/tasks/bridge/
  └── index.mjs                    ← Task 定义

src/test/tasks/bridge/
  ├── dev.md                       ← 开发计划
  ├── test-data.md                 ← 测试样本
  └── bridge.test.mjs              ← 测试代码

src/execute/handlers/
  ├── bridge-estimate.mjs          ← Action 处理
  ├── bridge-execute.mjs
  └── bridge-confirm.mjs
```

### D.4 第一步：dev.md 规划

```markdown
# Bridge Transfer Task 开发计划

## 需求理解

### 输入
{
  sourceChain: "evm",
  destChain: "solana",
  token: "USDC",
  amount: "1000",
  userAddress: "0x123..."
}

### 输出
{
  txHash: "0xabc...",
  status: "pending",
  estimatedTime: 300
}

## 设计决策

### 多链协调
- 使用 Execute 层的 orchestrate
- 支持失败重试

### 状态追踪
- 存储在 Context Engine
- 支持断点恢复

## 切片计划

### S-1: 价格估算
### S-2: 执行转账
### S-3: 状态确认
```

---

## 通用检查清单

### 需求理解阶段

```
输入/输出：
  □ 输入数据类型是什么？
  □ 输出数据类型是什么？
  □ 是否有默认值？
  □ 约束条件是什么？

边界情况：
  □ 空值处理
  □ 超大值处理
  □ 网络错误处理
  □ 超时处理
  □ 权限错误处理

失败路径：
  □ 主要失败原因有哪些？
  □ 错误消息如何设计？
  □ 是否需要重试？
  □ 是否需要回滚？
```

### 架构决策阶段

```
模式选择：
  □ 是否需要 Provider 模式？
  □ 是否需要 Request Engine？
  □ 是否需要 Context Engine？
  □ 是否需要 Task 包装？

依赖关系：
  □ 依赖哪些模块？
  □ 被哪些模块依赖？
  □ 是否会产生循环依赖？
  □ 分层是否清晰？

敏感数据：
  □ 是否涉及私钥？
  □ 是否涉及密码？
  □ 字段隔离等级？
  □ 输出过滤规则？
```

### 实现计划阶段

```
文件结构：
  □ 目录是否符合规范？
  □ 文件命名是否清晰？
  □ 导出是否明确？

测试计划：
  □ 样本是否覆盖 4 种类型？
  □ 测试代码是否完整？
  □ 是否有集成测试？

文档计划：
  □ dev.md 是否完整？
  □ 是否有 API 文档？
  □ 是否有使用示例？
```

---

## 常见陷阱

| 陷阱 | 症状 | 解决 |
|------|------|------|
| 需求不清 | 开发中频繁改动 | 花更多时间在 dev.md |
| 测试不足 | 发现 BUG 太晚 | 先写测试再写代码 |
| 职责混乱 | 模块互相穿透 | 严格遵循分层规则 |
| 敏感数据泄露 | 生产 Bug | 提前做安全检查 |
| 一次做太多 | 无法定位问题 | 一次只做一个切片 |

---

## 相关文档

- [ARCHITECTURE_OVERVIEW.md](../../ARCHITECTURE_OVERVIEW.md) - 整体架构
- [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) - 开发流程
- [TESTING_STANDARDS.md](TESTING_STANDARDS.md) - 测试规范
- [SECURITY_STANDARDS.md](SECURITY_STANDARDS.md) - 安全规范
- [CODING_STANDARDS.md](../../../DEV_STANDARDS.md) - 代码规范
