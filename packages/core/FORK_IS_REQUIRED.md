# importAddress + Fork 网络测试 - 完整运行指南

## ⚠️ 核心问题诊断

### 错误信息
```
Error: ImportAddress：Network provider 不支持 JSON-RPC
当前 provider 类型：undefined
```

### 根本原因
- ❌ 测试直接运行，没有连接到 fork 节点
- ❌ `hre.network.provider` 未初始化
- ❌ 无法执行 `hardhat_impersonateAccount` RPC 方法

### 解决方案概述
```
需要两个终端：
  终端 1：启动 fork 节点
  终端 2：运行测试
```

---

## 🚀 正确的运行步骤

### 步骤 1：启动 Fork 节点（终端 1）

```bash
cd /Users/zhangyi/Desktop/contractHelper
npm run fork
```

**预期输出**：
```
正在查询 mainnet 当前区块高度...
最新区块: 12345678，fork 区块: 12345653 (- 25)
启动本地 fork 节点 127.0.0.1:8545...
Hardhat nodes started
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```

**关键点**：
- ✓ fork 节点运行在 `127.0.0.1:8545`
- ✓ 保持这个终端运行不关闭
- ✓ Hardhat 节点已初始化并准备好接收 RPC 请求

### 步骤 2：运行测试（终端 2，新开一个）

```bash
cd /Users/zhangyi/Desktop/contractHelper/packages/core
node --test src/test/apps/evm/dapps/swaps.test.mjs
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
```

---

## 🔍 常见错误及解决方案

### 错误 1：Network provider 不支持 JSON-RPC

```
Error: ImportAddress：Network provider 不支持 JSON-RPC
当前 provider 类型：undefined
```

**原因**：fork 节点未运行

**解决方案**：
```bash
# 终端 1 - 启动 fork
npm run fork

# 等待输出 "Started HTTP and WebSocket JSON-RPC server"

# 然后在终端 2 运行测试
node --test src/test/apps/evm/dapps/swaps.test.mjs
```

### 错误 2：ECONNREFUSED

```
Error: ImportAddress：无法连接到 fork 节点
尝试连接：http://127.0.0.1:8545
```

**原因**：fork 节点没有在指定端口启动

**解决方案**：
```bash
# 检查是否有进程在 8545 端口
lsof -i :8545

# 如果有旧的进程，杀死它
kill -9 <PID>

# 重新启动 fork
npm run fork
```

### 错误 3：method not found

```
Error: ImportAddress：RPC 不支持 hardhat_impersonateAccount 方法
当前连接：http://127.0.0.1:8545
```

**原因**：连接的是普通 Hardhat 节点，不是 fork 节点

**解决方案**：
```bash
# 确保启动的是 fork（不是 node）
npm run fork  # ✓ 正确 - fork 模式支持 impersonate

# 而不是
npm run node  # ✗ 错误 - 普通节点不支持
```

### 错误 4：Test did not finish before its parent and was cancelled

```
test at src/test/apps/evm/dapps/swaps.test.mjs:103:2
✖ V2 - Factory, Router, Pair
  'test did not finish before its parent and was cancelled'
```

**原因**：Before hook 中的 importAddress 超时或失败

**解决方案**：
1. 检查 fork 节点是否正在运行
2. 查看 fork 终端的输出是否有错误
3. 确保网络连接正常

---

## 📊 架构图

### 正确配置

```
┌─────────────────────────────────────────────┐
│ 终端 1：Hardhat Fork 节点                     │
│ npm run fork                                 │
│ 监听：127.0.0.1:8545                         │
│ 支持：hardhat_impersonateAccount RPC        │
└──────────────┬──────────────────────────────┘
               │ 网络通信
               │ JSON-RPC
               ▼
┌─────────────────────────────────────────────┐
│ 终端 2：测试进程                              │
│ node --test swaps.test.mjs                  │
│ importAddress 使用 hardhat_impersonate      │
│ 冒充 0x70997970... 账户                     │
│ 转账 ETH 到测试账户                          │
└─────────────────────────────────────────────┘
```

### 错误配置

```
✗ 测试直接运行（没有 fork 节点）
  ↓
  hre.network.provider = undefined
  ↓
  无法发送 hardhat_impersonateAccount RPC
  ↓
  importAddress 失败

✓ 必须先启动 fork 节点
```

---

## 🎯 关键账户说明

### 使用的账户

**富有账户**（Fork 中的预资金账户）:
```
地址：0x70997970c51812dc3a010c7d01b50e0d17dc79c8
来源：Hardhat 默认账户之一
余额：~10,000 ETH（Fork 中）
用途：冒充此账户，转账 ETH 给测试账户
```

**测试账户**（接收 ETH 的账户）:
```
地址：0xb641bf34a9FA546cf6AcBd91E4022D65155a03BB
来源：测试脚本生成
初始余额：0 ETH
最终余额：10 ETH（从富有账户转账）
用途：执行部署和交易操作
```

### 账户一致性注意事项

当启动 fork 节点时：
```javascript
// fork 中的 Hardhat default accounts 包括：
[
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02d45d5c9a8bfd7",  // index 0
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",  // index 1 ← 富有账户
  "0x3c44cdddb6a900756c2e36338f8b826e98006999e",  // index 2
  // ...
]

// 这些账户在 fork 中自动拥有 ETH 余额
// 可以直接使用 importAddress 冒充这些账户
```

---

## ✅ 完整检查清单

运行测试前，检查以下项目：

- [ ] 1. Fork 节点已启动（终端 1 运行 `npm run fork`）
- [ ] 2. Fork 节点运行在 `127.0.0.1:8545`
- [ ] 3. Fork 终端显示 "Started HTTP and WebSocket JSON-RPC server"
- [ ] 4. 没有其他进程在使用 8545 端口
- [ ] 5. 文件路径正确：`packages/core/src/test/apps/evm/dapps/swaps.test.mjs`
- [ ] 6. 使用正确命令：`node --test swaps.test.mjs`（不是 `npx hardhat test`）

---

## 🔧 故障排除工具

### 检查 fork 节点是否运行

```bash
# 方式 1：检查端口
lsof -i :8545

# 方式 2：尝试 RPC 连接
curl -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# 预期响应：{"jsonrpc":"2.0","result":"0xcafebabe","id":1}
```

### 测试 importAddress

```javascript
// 创建 test-import.mjs
import { importAddress } from "@ch/core";

try {
  const signer = await importAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
  console.log("✓ importAddress 工作正常");
  console.log("Signer 地址:", signer.address);
} catch (error) {
  console.error("✗ 错误:", error.message);
}
```

```bash
# 运行测试
node test-import.mjs
```

---

## 📚 参考链接

- [Hardhat Fork 文档](https://hardhat.org/docs/hardhat-network/guides/forking-other-networks)
- [hardhat_impersonateAccount RPC](https://hardhat.org/docs/reference/hardhat-network-helpers#hardhat-impersonate-account)
- [importAddress 指南](./packages/core/src/apps/evm/fork/IMPORT_ACCOUNTS_GUIDE.md)
- [DApp 框架文档](./packages/core/src/apps/evm/dapps/dapp-resolver.mjs)

---

## 🎓 快速上手

如果你是第一次运行，按照以下步骤：

```bash
# 1. 打开两个终端窗口

# ===== 终端 1 =====
cd /Users/zhangyi/Desktop/contractHelper
npm run fork
# 等待输出 "Started HTTP and WebSocket JSON-RPC server"

# ===== 终端 2 =====
cd /Users/zhangyi/Desktop/contractHelper/packages/core
node --test src/test/apps/evm/dapps/swaps.test.mjs

# 观察输出
# ✓ [Setup] ✓ 已冒充富账户
# ✓ [Setup] ✓ 转账完成
# ✓ [Setup] ✓ 测试账户余额
```

就这么简单！🚀
