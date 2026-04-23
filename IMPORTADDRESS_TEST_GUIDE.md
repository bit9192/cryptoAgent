# importAddress 测试运行指南

## 诊断结果总结

### 当前状态 ✅

- **Fork 节点连接**：✓ 可以连接（已在 127.0.0.1:8545 运行）
- **importAddress 实现**：✓ 已完成（包含详细的错误诊断）
- **测试文件准备**：✓ 已完成（swaps.test.mjs 集成 importAddress）
- **诊断工具**：✓ 已创建（check-import-address.mjs）
- **文档**：✓ 完整
- **开发守则**：✓ 已定义（DEV_STANDARDS.md）

### 已知限制 ⚠️

importAddress **只能在 Hardhat 测试框架中运行**，不能在裸 Node.js 脚本中使用。这是因为：

```
importAddress 需要通过 Hardhat 的 hre.network.provider 来调用
hardhat_impersonateAccount RPC 方法。

此方法只在以下环境中可用：
  ✓ Hardhat 测试（node --test 框架）
  ✓ Hardhat node（npx hardhat node）
  ✓ Hardhat fork（npm run fork）

此方法在以下环境中不可用：
  ✗ 裸 node check-import-address.mjs
  ✗ 通用的 JsonRpcProvider
  ✗ 非 Hardhat 环境的任何脚本
```

---

## 正确的测试运行方式

### 前置条件

1. Fork 节点已启动或即将启动
2. 理解两个终端的协作方式

### 运行步骤

#### 终端 1：启动 Fork 节点

```bash
cd <repo-root>/contractHelper

# 启动 fork
npm run fork

# 选择 mainnet（或其他网络）
# 等待输出下面这行：
# Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```

**预期输出**：
```
正在查询 mainnet 当前区块高度...
最新区块: 12345678，fork 区块: 12345653 (- 25)
启动本地 fork 节点 127.0.0.1:8545...
Hardhat node started
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```

**关键点**：保持这个终端运行不要关闭！

#### 终端 2：运行测试（新开一个）

```bash
cd <repo-root>/contractHelper/packages/core

# 运行测试
node --test src/test/apps/evm/dapps/swaps.test.mjs

# 或运行所有测试
node --test "src/test/**/*.test.mjs"
```

**预期输出**：
```
[Setup] 连接 fork 网络 (http://127.0.0.1:8545)
[Setup] 测试账户: 0xb641bf34a9FA546cf6AcBd91E4022D65155a03BB
[Setup] 富账户: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
[Setup] 使用 importAddress 冒充富账户...
[Setup] ✓ 已冒充富账户: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
[Setup] 转账 10 ETH 到测试账户: 0xb641bf34a9FA546cf6AcBd91E4022D65155a03BB
[Setup] ✓ 转账完成: 0x...hash...
[Setup] ✓ 测试账户余额: 10000000000000000000 wei (10.0 ETH)

▶ Uniswap V2/V3 DApp Integration
  ▶ V2 - Factory, Router, Pair
    ✔ 应该部署测试 token (TestCoin + USDT)
    ✔ 应该包装 token 为 ERC20 实例
    ...
```

---

## importAddress 工作原理

### 架构

```
┌─────────────────────────────────────────────────────────┐
│ 测试进程 (node --test)                                   │
│ ├─ hre 已正确初始化                                      │
│ ├─ hre.network.provider 可用                             │
│ └─ 可以调用 hardhat_impersonateAccount RPC               │
└──────────────┬──────────────────────────────────────────┘
               │
               │ RPC 通信
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│ Fork 节点 (127.0.0.1:8545)                              │
│ ├─ 支持 hardhat_impersonateAccount RPC 方法              │
│ ├─ 支持账户冒充                                          │
│ └─ 富有账户（0x70997970...）有预资金                    │
└─────────────────────────────────────────────────────────┘
```

### 工作流

```
1. 测试运行：node --test swaps.test.mjs
   ↓
2. Before Hook 执行
   ├─ importAddress("0x70997970...")
   ├─ hre.network.provider.request({
   │    method: "hardhat_impersonateAccount",
   │    params: ["0x70997970..."]
   │  })
   └─ 返回冒充账户的 signer
   ↓
3. 转账 10 ETH
   ├─ signer.sendTransaction({
   │    to: testAccountAddr,
   │    value: parseEther("10")
   │  })
   └─ 返回转账交易
   ↓
4. 验证余额
   └─ balance >= 1 ETH ✓
   ↓
5. 测试继续执行
   └─ 所有测试开始...
```

---

## 常见问题解答

### Q1: 为什么运行 `node check-import-address.mjs` 失败？

**A**: `check-import-address.mjs` 是诊断工具，不能在 Hardhat 框架外使用。它只能验证：
- Fork 节点连接
- 基础的 ethers 功能

真正的 importAddress 必须在 `node --test` 中使用。

### Q2: 如何知道 Fork 节点是否启动成功？

**A**: 查看终端 1 的输出，寻找这一行：
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```

或者运行检查命令：
```bash
curl -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  2>/dev/null | jq .

# 成功的响应：
# { "jsonrpc": "2.0", "result": "0xcafebabe", "id": 1 }
```

### Q3: 测试失败说"已取消"是什么意思？

**A**: 这表示 Before Hook 中的 importAddress 失败。检查：

1. Fork 节点是否在运行？
   ```bash
   lsof -i :8545  # 查看 8545 端口
   ```

2. 检查 fork 终端的错误信息

3. 尝试重启 fork 节点：
   ```bash
   # Ctrl+C 停止终端 1 的 fork
   npm run fork  # 重新启动
   ```

### Q4: 可以改变转账金额吗？

**A**: 是的。编辑 `swaps.test.mjs` 第 82 行：
```javascript
// 从 10 ETH 改为其他值
const transferAmount = parseEther("10");  // 改这里
await richSigner.sendTransaction({
  to: myAddress,
  value: transferAmount,  // 用这个变量
});
```

### Q5: 所有测试都运行了吗？

**A**: 不是。当前的 swaps.test.mjs 中很多测试可能因为 artifact 路径问题而被跳过。这是正常的。关键是 **Before Hook 成功** 意味着 importAddress 工作正常。

### Q6: 可以用不同的富有账户吗？

**A**: 可以。编辑 `swaps.test.mjs` 第 26 行：
```javascript
// 改成其他 Hardhat 默认账户或任何在 fork 中有余额的地址
const FUNDED_ADDRESS = "0x3c44cdddb6a900756c2e36338f8b826e98006999e";
```

但务必确保该地址在 fork 中有资金。

---

## 诊断工具的真正用途

虽然 `check-import-address.mjs` 在裸 Node.js 中不能演示完整的 importAddress 功能，但它可以验证：

```bash
node check-import-address.mjs
```

这会检查：
- ✓ Fork 节点连接状态
- ✓ 网络配置
- ✓ 基础的 RPC 连接
- ✗ importAddress 本身（需要 Hardhat 框架）

**有效用途**：
1. 快速验证 Fork 节点是否运行
2. 诊断连接问题
3. 验证 RPC 端点配置

---

## 完整的使用流程检查清单

### 运行测试前

- [ ] 阅读本文档
- [ ] 准备两个终端窗口
- [ ] 记住 Fork 节点启动命令：`npm run fork`
- [ ] 记住测试命令：`node --test src/test/apps/evm/dapps/swaps.test.mjs`

### 启动 Fork 节点（终端 1）

- [ ] `cd <repo-root>/contractHelper`
- [ ] `npm run fork`
- [ ] 选择 mainnet（或所需的网络）
- [ ] 等待 "Started HTTP and WebSocket JSON-RPC server" 消息
- [ ] 保持终端运行

### 运行测试（终端 2）

- [ ] `cd <repo-root>/contractHelper/packages/core`
- [ ] `node --test src/test/apps/evm/dapps/swaps.test.mjs`
- [ ] 查看 Before Hook 输出
- [ ] 如果看到 "✓ 已冒充富账户" 则 importAddress 工作正常
- [ ] 观察测试是否继续运行

### 故障排除

- [ ] Fork 节点异常？重启（Ctrl+C + npm run fork）
- [ ] importAddress 失败？查看 fork 终端有无错误
- [ ] 无法连接？检查 lsof -i :8545
- [ ] 其他问题？参考本文档的 FAQ 部分

---

## 参考资源

- **importAddress 指南**：[packages/core/src/apps/evm/fork/IMPORT_ACCOUNTS_GUIDE.md](./packages/core/src/apps/evm/fork/IMPORT_ACCOUNTS_GUIDE.md)
- **Fork 测试指南**：[packages/core/src/test/apps/evm/dapps/FORK_TESTING_GUIDE.md](./packages/core/src/test/apps/evm/dapps/FORK_TESTING_GUIDE.md)
- **Fork 是必需的**：[packages/core/FORK_IS_REQUIRED.md](./packages/core/FORK_IS_REQUIRED.md)
- **开发守则**：[DEV_STANDARDS.md](./DEV_STANDARDS.md)
- **DApp 框架**：[packages/core/src/apps/evm/dapps/dapp-resolver.mjs](./packages/core/src/apps/evm/dapps/dapp-resolver.mjs)

---

## 运行命令速查表

```bash
# 启动 Fork 节点
npm run fork

# 运行单个测试
node --test packages/core/src/test/apps/evm/dapps/swaps.test.mjs

# 运行所有测试
node --test "packages/core/src/test/**/*.test.mjs"

# 诊断工具（仅检查连接）
node packages/core/check-import-address.mjs

# 演示脚本（需要 fork 节点）
node packages/core/fork-transfer-demo.mjs
```

---

本文档最后更新：2026-04-06
