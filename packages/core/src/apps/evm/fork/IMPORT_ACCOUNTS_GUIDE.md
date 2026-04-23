# importAddress 使用指南

## 概述

`importAddress` 是一个在 Hardhat fork 环境中冒充特定地址的工具。它通过 `hardhat_impersonateAccount` RPC 方法实现账户冒充，支持缓存机制以提高性能。

## 功能

### 核心 API

#### `importAddress(address)` 
在 fork 网络上冒充指定地址，返回一个可以用于签署交易的 signer 对象。

```javascript
import { importAddress } from "@ch/core";

// 冒充一个特定地址
const signer = await importAddress("0x1234567890123456789012345678901234567890");

// 使用 signer 发送交易
const tx = await signer.sendTransaction({
  to: "0x...",
  value: ethers.parseEther("1.0")
});
```

#### `removeImportedSigner(address)`
从缓存中移除指定地址的 signer。

```javascript
import { removeImportedSigner } from "@ch/core";

removeImportedSigner("0x1234567890123456789012345678901234567890");
```

#### `clearImportedSignerCache()`
清空所有导入的 signer 缓存。

```javascript
import { clearImportedSignerCache } from "@ch/core";

clearImportedSignerCache();
```

#### `getCachedImportedSignerAddresses()`
获取所有已缓存的导入 signer 地址列表。

```javascript
import { getCachedImportedSignerAddresses } from "@ch/core";

const addresses = getCachedImportedSignerAddresses();
console.log("Cached signers:", addresses);
```

#### `decorateEvmSigner(signer, meta)`
为 signer 对象添加元数据和增强功能。

```javascript
import { decorateEvmSigner } from "@ch/core";

const decorated = decorateEvmSigner(signer, {
  remark: "主要部署者",
  seedType: "privateKey",
  source: "imported"
});
```

## 使用场景

### 场景 1：在 Fork 网络上测试多个账户的交互

```javascript
import { importAddress, clearImportedSignerCache } from "@ch/core";
import { ethers } from "ethers";

async function testMultiAccountInteraction() {
  // 清理之前的缓存
  clearImportedSignerCache();

  // 冒充富有的地址（如多签或协议金库）
  const richSigner = await importAddress("0xrichAddressHere");
  
  // 冒充受益人账户
  const beneficiary = await importAddress("0xbeneficiaryAddressHere");
  
  // 模拟从 richSigner 转账给 beneficiary
  const tx = await richSigner.sendTransaction({
    to: await beneficiary.getAddress(),
    value: ethers.parseEther("100")
  });
  
  await tx.wait();
  console.log("Transfer completed");
}
```

### 场景 2：测试合约权限管理

```javascript
import { importAddress } from "@ch/core";
import { getContract } from "@ch/core";

async function testPermissions() {
  // 冒充合约所有者
  const ownerSigner = await importAddress("0xcontractOwner");
  
  // 获取合约实例并绑定 owner signer
  const contract = await getContract("MyToken", deploymentAddress, ownerSigner);
  
  // 以所有者身份调用受限函数
  const tx = await contract.mint("0xrecipient", ethers.parseUnits("1000"));
  await tx.wait();
}
```

### 场景 3：模拟 DeFi 操作

```javascript
import { importAddress } from "@ch/core";
import { deploySwapV2, routerV2 } from "@ch/core";

async function simulateLiquidity() {
  // 冒充 Uniswap V2 路由合约地址进行转账验证
  const router = await routerV2("0xUniswapRouterAddress");
  
  // 冒充流动性提供者
  const lpSigner = await importAddress("0xLiquidityProviderAddress");
  
  // 执行流动性相关操作
  // ...
}
```

## 注意事项

1. **Hardhat 环境要求**：`importAddress` 只能在 Hardhat 环境中运行（dev/fork 模式）
2. **缓存机制**：相同地址的多次调用会返回缓存的 signer，提高性能
3. **地址归一化**：输入地址会通过 `ethers.getAddress()` 进行归一化（checksum）
4. **RPC 支援**：需要 `hardhat_impersonateAccount` RPC 方法的支持

## 错误处理

```javascript
import { importAddress } from "@ch/core";

async function safeImport() {
  try {
    const signer = await importAddress("0xaddress");
    return signer;
  } catch (error) {
    if (error.message.includes("dev/fork 模式")) {
      console.error("需要在 Hardhat fork 环境中运行");
    } else if (error.message.includes("hardhat_impersonateAccount")) {
      console.error("RPC 不支持 account impersonation");
    }
    throw error;
  }
}
```

## 与 DApp 框架集成

`importAddress` 与 DApp 迁移框架完美配合：

```javascript
import { importAddress, deploySwapV2 } from "@ch/core";

async function deployWithImpersonation() {
  // 冒充部署者账户
  const deployerSigner = await importAddress("0xdeployer");
  
  // 使用冒充的 signer 部署 SwapV2
  const result = await deploySwapV2(
    "0xfeeTo",
    { signer: deployerSigner }
  );
  
  return result;
}
```

## 参考

- [Fork 网络工具](./node.mjs) - Fork 状态管理
- [DApp 框架](../dapps/dapp-resolver.mjs) - 通用 DApp 接口
