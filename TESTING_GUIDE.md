# Wallet-Engine 测试工具指南

## 概览

一个完整的 `run test` 测试工具，让你在 Lon REPL 中快速验证和调试 wallet-engine 的各个功能。

## 快速开始

### 启动 REPL
```bash
cd /Users/zhangyi/Desktop/moneyOS/contractHelper-new
node packages/core/src/cli/lon.mjs --mode dev --autoConfirm true
```

### 运行测试
```bash
lon[dev]> run test
```

## 测试结构

测试工具分为 **3 大部分**：

### 部分 1️⃣ : 核心 API（低级接口）

直接调用 wallet-engine 的基础函数，验证检索和生成逻辑。

**测试内容：**
- **检索候选**：按名称精确/模糊匹配、按 keyId、按 chain 等
- **生成单个地址**：从候选列表生成单个地址（single 模式）
- **生成单个 Signer**：从候选列表生成 signer 引用

**使用场景：**
- 验证基础检索逻辑是否正确
- 调试过滤条件的组合效果

---

### 部分 2️⃣ : 下游接口测试（高级）

测试 wallet-engine 的高级 API，模拟实际下游任务的调用方式。

#### 测试 1: Search（查询资产）
```javascript
场景：用户运行 si token --network eth，需要解析地址
输入：keyId="k1", chain="evm"
输出：single 地址用于查询
```

#### 测试 2: Send（发送交易）
```javascript
场景：用户要发送交易，需要特定 chain 的 signer
输入：keyId="k1", chain="evm"
输出：single signer 引用
```

#### 测试 3: MultiAddress（批量查询）
```javascript
场景：查询同一个 keyId 下的所有地址
输入：keyId="k1"
输出：multi 模式返回多个地址
```

#### 测试 4: CrossChain（跨链操作）
```javascript
场景：用户要在 TRX 链上操作，需要 k2 的 signer
输入：keyId="k2", chain="trx"
输出：TRX chain 的 signer
```

#### 测试 5: NamedWallet（按名称查询）
```javascript
场景：用户只知道钱包名称 'alt'，不知道 keyId
输入：name="alt", nameExact=false（模糊匹配）
输出：matching 地址
```

---

### 部分 3️⃣ : 错误处理

验证 wallet-engine 的错误检测和报告机制。

#### 错误场景 1: 多候选冲突
```javascript
条件：只指定 keyId，但 k1 有 2 个 EVM 地址
预期：报 MULTIPLE_MATCH 错误，需要增加 chain/name 过滤
```

#### 错误场景 2: 无匹配结果
```javascript
条件：查询不存在的名称
预期：报 NO_MATCH 错误
```

---

## 使用示例

### 示例 1: 快速验证检索逻辑

在测试运行时，观察"测试 1: 检索候选地址"的输出：

```json
✅ 找到 1 个候选
[
  {
    "keyId": "k1",
    "keyName": "alpha",
    "chain": "evm",
    "address": "0x1111...",
    "name": "main"
  }
]
```

### 示例 2: 验证 Search 下游场景

观察"下游接口 1: Search"的输出：

```json
✅ 地址解析成功
📍 查询地址: 0x1111...
🔗 链网络: evm
```

### 示例 3: 验证错误处理

观察"错误处理：多候选冲突"：

```
❌ 预期的错误: MULTIPLE_MATCH
ℹ️  错误信息: 命中多个 signer，请补充约束
```

---

## 与 Session Inputs 集成

测试工具会自动从 session 中读取 inputs：

### 步骤 1: 设置 Inputs
```bash
lon[dev]> wallet inputs.set wallet --data '{"address":"0x...","chain":"evm"}'
```

### 步骤 2: 运行测试
```bash
lon[dev]> run test
```

### 步骤 3: 查看结果
```
📍 当前 Inputs
{
  "address": "0x...",
  "chain": "evm"
}

✅ 从 run() 上下文中找到 inputs
```

---

## 修改测试代码

所有测试函数都很简洁，易于修改：

### 添加新的下游接口测试

在 `src/run/test.mjs` 中添加新函数：

```javascript
async function testDownstreamSwap(walletStatus) {
  divider("下游接口 N: Swap（交换代币）");
  
  info("场景：用户要交换代币，需要 signer");
  
  try {
    const result = resolveSignerRefs({
      inputs: {
        keyId: "k1",
        chain: "evm",
      },
      walletStatus,
      requirement: {
        kind: "signer",
        cardinality: "single",
      },
    });
    
    if (result.ok) {
      success("Signer 解析成功");
      // ... 处理结果
    }
  } catch (err) {
    error(`${err.message}`);
  }
}
```

然后在 `run()` 函数中调用：

```javascript
export async function run(options = {}) {
  // ... 前面的代码 ...
  
  // 在下游接口测试部分添加：
  await testDownstreamSwap(walletStatus);
}
```

### 修改 Mock 钱包数据

编辑 `createMockWalletStatus()` 函数来添加更多地址：

```javascript
function createMockWalletStatus() {
  return {
    sessionId: "default",
    addresses: [
      // 添加你的测试地址
      {
        keyId: "k3",
        keyName: "gamma",
        chain: "btc",
        address: "1A1z7agoat...",
        name: "btc-main",
        // ...
      },
    ],
  };
}
```

---

## 测试输出说明

### 成功标记
- ✅ 操作成功
- ℹ️  信息提示
- 📌 分类标题

### 失败标记
- ❌ 操作失败
- 🔗 链网络相关
- ✍️  签名相关

### 常见输出

```
────────────────────────────────────────────────────────────
📌 下游接口 1: Search（查询资产）
────────────────────────────────────────────────────────────

ℹ️  场景：用户运行 si token --network eth，输入中包含 keyId="k1", chain="evm"
✅ 地址解析成功
📍 查询地址: 0x1111...
🔗 链网络: evm
{
  "ok": true,
  "kind": "address",
  "query": "0x1111..."
  // ... 完整输出
}
```

---

## 故障排查

### 问题 1: 测试显示"当前没有设置 inputs"

**原因**：Session 中没有 inputs 数据

**解决**：
```bash
lon[dev]> wallet inputs.set wallet --data '{"address":"0x...","chain":"evm"}'
lon[dev]> run test
```

### 问题 2: 某个下游接口测试失败

**原因**：Mock 钱包状态中缺少需要的地址/signer

**解决**：修改 `createMockWalletStatus()` 添加相应地址

### 问题 3: 模块导入错误

**原因**：相对路径不正确

**解决**：确保 `src/run/test.mjs` 中的导入路径正确：
```javascript
import { ... } from "../../packages/core/src/modules/wallet-engine/index.mjs";
```

---

## 完整工作流

### 典型工作流程

1. **启动 REPL**
   ```bash
   node packages/core/src/cli/lon.mjs --mode dev --autoConfirm true
   ```

2. **设置 inputs**（可选）
   ```bash
   wallet inputs.set wallet --data '{...}'
   ```

3. **运行测试**
   ```bash
   run test
   ```

4. **查看输出**
   - 观察各部分是否通过
   - 查看错误信息
   - 验证数据结构

5. **修改和迭代**
   - 编辑 `src/run/test.mjs`
   - 重新运行 `run test`
   - 快速验证改动效果

---

## 相关文档

- [wallet-engine API 文档](packages/core/src/modules/wallet-engine/USAGE_GUIDE.md)
- [wallet-engine 测试用例](packages/core/src/test/modules/wallet-engine/wallet-engine.test.mjs)
- [wallet-engine 开发计划](packages/core/src/test/modules/wallet-engine/dev.md)

---

## 快速命令参考

| 命令 | 功能 |
|------|------|
| `run test` | 运行完整测试套件 |
| `wallet inputs.set wallet --data '{...}'` | 设置 inputs |
| `wallet inputs.show` | 查看当前 inputs |
| `wallet inputs.clear` | 清空 inputs |
| `help` | 显示所有命令 |
| `exit` | 退出 REPL |

---

## 更新历史

- **2026-04-27**：创建完整测试工具，包含 3 大部分、5 个下游接口场景和错误处理
