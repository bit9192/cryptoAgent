# importAddress Fork 网络集成完成

## 📋 概述

已成功将 `importAddress` 集成到 `swaps.test.mjs`，使用 fork 中的预资金账户 `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` 来冒充和转账 ETH。

## ✅ 已完成的工作

### 1. 测试文件更新

**文件**: `/packages/core/src/test/apps/evm/dapps/swaps.test.mjs`

**主要改动**:
```javascript
// 导入 importAddress
import { importAddress } from "@ch/core";

// 定义富有账户
const FUNDED_ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

// Before hook 中的冒充和转账
before(async () => {
  // 冒充富有账户
  richSigner = await importAddress(FUNDED_ADDRESS);
  
  // 转账 10 ETH 到测试账户
  let tx = await richSigner.sendTransaction({
    to: myAddress,
    value: parseEther("10"),
  });
  await tx.wait();
  
  // 验证余额
  const balance = await provider.getBalance(myAddress);
  assert(balance >= parseEther("1"), "应至少有 1 ETH");
});
```

### 2. 文档创建

- **FORK_TESTING_GUIDE.md** - Fork 测试完整指南
- **fork-transfer-demo.mjs** - ETH 转账演示脚本

## 🚀 使用步骤

### 第一步：启动 Fork 网络

```bash
npm run fork
```

输出应显示：
```
Starting Hardhat node...
Forking mainnet...
Listening on 127.0.0.1:8545
```

### 第二步：运行测试

在另一个终端：

```bash
cd packages/core
node --test src/test/apps/evm/dapps/swaps.test.mjs
```

### 第三步：查看结果

#### 启动输出（Before Hook）:
```
[Setup] 连接 fork 网络 (http://127.0.0.1:8545)
[Setup] 测试账户: 0xb641bf34a9FA546cf6AcBd91E4022D65155a03BB
[Setup] 富账户: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
[Setup] 使用 importAddress 冒充富账户...
[Setup] ✓ 已冒充富账户: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
[Setup] 转账 10 ETH 到测试账户: 0xb641bf34a9FA546cf6AcBd91E4022D65155a03BB
[Setup] ✓ 转账完成: 0x123abc...
[Setup] ✓ 测试账户余额: 10000000000000000000 wei (10.0 ETH)
```

## 🎯 核心概念

### importAddress 工作流程

```
┌─────────────────────────────────────────────────────────┐
│ 1. 连接 Fork 网络 Provider                               │
│    provider = new JsonRpcProvider(FORK_RPC)              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. 冒充富有账户                                           │
│    signer = await importAddress(FUNDED_ADDRESS)          │
│    • 调用 hardhat_impersonateAccount RPC                 │
│    • 获取该账户的 JsonRpcSigner                          │
│    • 缓存以备后续使用                                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. 使用冒充的 Signer 发送交易                             │
│    tx = await signer.sendTransaction({ ... })            │
│    • 该账户的 gas 余额用于支付手续费小事                 │
│    • 可以转账 ETH 给其他地址                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. 测试账户接收 ETH                                      │
│    • 现在有充足的 gas 余额进行后续操作                   │
│    • 可以部署合约、执行 swap 等                          │
└─────────────────────────────────────────────────────────┘
```

### 缓存机制

```javascript
// 首次调用 - 发起 RPC 请求
const signer1 = await importAddress("0x7099...");

// 第二次调用 - 返回缓存
const signer2 = await importAddress("0x7099...");

// signer1 === signer2（来自缓存）
```

## 📊 对比：以前 vs 现在

### 以前（手动转账失败）
```
❌ 账户初始余额：0 ETH
❌ 尝试 eth_sendTransaction 失败
❌ 部署合约时资金不足错误
❌ 测试因此被跳过
```

### 现在（importAddress 自动转账）
```
✅ 冒充富有账户：0x70997970c51812dc3a010c7d01b50e0d17dc79c8
✅ 自动转账 10 ETH
✅ 验证接收余额：10.0 ETH
✅ 所有测试继续进行
✅ 完整的 V2/V3 部署流程测试
```

## 🔧 可选配置

### 修改转账金额

```javascript
// 从 6 ETH 改为 50 ETH
await richSigner.sendTransaction({
  to: myAddress,
  value: parseEther("50"),  // 改这里
});
```

### 使用不同的富有账户

```javascript
// 修改常量
const FUNDED_ADDRESS = "0xYourOtherAddressWithGas";
```

### 转账给多个地址

```javascript
const addresses = ["0xaddr1", "0xaddr2", "0xaddr3"];
for (const addr of addresses) {
  await richSigner.sendTransaction({
    to: addr,
    value: parseEther("5"),
  });
}
```

## 📚 演示脚本

使用 `fork-transfer-demo.mjs` 来演示 importAddress 的转账功能：

```bash
# 1. 启动 fork
npm run fork

# 2. 在另一个终端运行演示
node packages/core/fork-transfer-demo.mjs
```

输出示例：
```
╔════════════════════════════════════════════════════════════╗
║   Fork 网络中使用 importAddress 转账 ETH 演示             ║
╚════════════════════════════════════════════════════════════╝

📍 准备数据：
  Fork RPC: http://127.0.0.1:8545
  富有账户: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
  接收地址: 3 个

🔐 冒充富有账户...
  ✓ 已冒充: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8

💰 检查富有账户余额...
  余额: ...wei
  余额: ...ETH

📤 开始转账 ETH...

  [1/3] 转账到: 0xb641bf34a9FA546cf6AcBd91E4022D65155a03BB
  金额: 5 ETH
  tx hash: 0x...
  ✓ 确认 (gas used: 21000)
  ...
```

## ⚠️ 常见问题

### 问：测试运行时出现错误："ImportAddress 需要在支持 impersonate 的 Hardhat 环境中运行"

**答**：确保 Hardhat fork 已启动。运行 `npm run fork` 后再执行测试。

### 问：能否在生产网络上使用 importAddress？

**答**：不能。`importAddress` 只在 Hardhat 开发/fork 环境中有效。生产网络不支持 `hardhat_impersonateAccount` RPC 方法。

### 问：fork 地址 `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` 是什么？

**答**：这是 Hardhat 默认的预资金账户之一（派生自 Hardhat 助记词）。在 fork 时保持其结余以便用于测试。

### 问：转账失败怎么办？

**答**：检查：
1. Fork 网络是否运行中
2. RPC 地址是否正确
3. importAddress 是否成功冒充了账户
4. 富有账户是否真的有 ETH

## 📖 完整文档

- [importAddress 使用指南](./packages/core/src/apps/evm/fork/IMPORT_ACCOUNTS_GUIDE.md)
- [Fork 测试指南](./packages/core/src/test/apps/evm/dapps/FORK_TESTING_GUIDE.md)
- [DApp 框架文档](./packages/core/src/apps/evm/dapps/dapp-resolver.mjs)

## 🎉 总结

✅ **importAddress 已集成到测试中**  
✅ **自动转账 gas 给测试账户**  
✅ **完整的 V2/V3 测试流程支持**  
✅ **可扩展的 fork 测试基础设施**  
✅ **缓存机制提高性能**  

现在可以在 fork 环境中进行完整的 DeFi 协议测试！🚀
