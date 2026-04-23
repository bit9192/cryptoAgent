# SwapV2/V3 测试 - importAddress 集成

## 概述

已将 `importAddress` 集成到 `swaps.test.mjs`，使用 fork 中的富有账户 (`0x70997970c51812dc3a010c7d01b50e0d17dc79c8`) 来冒充和转账 ETH 到测试账户。

## 必要步骤

### 1️⃣ 启动 Fork 网络

```bash
npm run fork
```

这会启动 Hardhat fork 网络，监听在 `http://127.0.0.1:8545`

### 2️⃣ 运行测试（在另一个终端）

```bash
cd packages/core
node --test src/test/apps/evm/dapps/swaps.test.mjs
```

## 测试流程

### Before Hook - 账户初始化

```javascript
[Setup] 连接 fork 网络 (http://127.0.0.1:8545)
[Setup] 测试账户: 0xb641bf34a9FA546cf6AcBd91E4022D65155a03BB
[Setup] 富账户: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
[Setup] 使用 importAddress 冒充富账户...
[Setup] ✓ 已冒充富账户: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
[Setup] 转账 10 ETH 到测试账户: 0xb641bf34a9FA546cf6AcBd91E4022D65155a03BB
[Setup] ✓ 转账完成: 0x...hash...
[Setup] ✓ 测试账户余额: ...wei (10.0 ETH)
```

## 关键改动

### 导入添加
```javascript
import { importAddress } from "@ch/core";
```

### 富有账户定义
```javascript
const FUNDED_ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
```

### Before Hook 逻辑
```javascript
before(async () => {
  // 冒充富有的账户
  richSigner = await importAddress(FUNDED_ADDRESS);
  
  // 转账 10 ETH 给测试账户
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

## 优势

✅ **无需手动转账** - 自动通过 importAddress 转账  
✅ **可靠的资金来源** - 使用 fork 中的预资金账户  
✅ **缓存机制** - importAddress 缓存富有账户，减少 RPC 调用  
✅ **地址归一化** - 自动处理 checksum 地址  
✅ **错误处理** - 清晰的错误消息指示环境要求  

## 常见问题

### Q: 如何在没有 fork 的情况下运行？
**A:** 需要启动 fork 网络。运行 `npm run fork` 后再执行测试。

### Q: 如何使用不同的富有账户？
**A:** 修改 `swaps.test.mjs` 中的 `FUNDED_ADDRESS` 常量为其他在 fork 中有余额的地址。

### Q: importAddress 需要多少时间？
**A:** 首次调用会发起 RPC 请求，后续调用使用缓存，非常快速。

### Q: 能否转账更多 ETH？
**A:** 是的。修改 `parseEther("10")` 为所需数量：
```javascript
await richSigner.sendTransaction({
  to: myAddress,
  value: parseEther("100"),  // 转账 100 ETH
});
```

## 与 DApp 框架的协作

测试与 DApp 迁移框架完美配合：

```javascript
// 使用有资金的 signer 部署 V2
const v2Result = await deploySwapV2(myAddress, {
  rpcUrl: FORK_RPC,
  signer,  // 已通过转账获得 ETH 的 signer
});

// 使用有资金的 signer 部署 V3
const v3Result = await deploySwapV3({
  rpcUrl: FORK_RPC,
  signer,  // 已通过转账获得 ETH 的 signer
});
```

## 完整运行示例

```bash
# 终端 1：启动 fork
npm run fork

# 终端 2：运行测试
cd packages/core
node --test src/test/apps/evm/dapps/swaps.test.mjs

# 预期输出示例
[Setup] 转账完成: 0x123abc...
[Setup] ✓ 测试账户余额: 10000000000000000000 wei (10.0 ETH)
▶ Uniswap V2/V3 DApp Integration
  ▶ V2 - Factory, Router, Pair
    ✔ 应该部署测试 token (TestCoin + USDT)
    ✔ 应该包装 token 为 ERC20 实例
    ...
```

## 参考资源

- [importAddress 指南](./IMPORT_ACCOUNTS_GUIDE.md)
- [DApp 框架](../dapps/dapp-resolver.mjs)
- [Hardhat Documentation](https://hardhat.org/docs)
