# Uniswap V2/V3 DApp 测试指南

## 概述

本目录包含 Uniswap V2 和 V3 DApp 接口的完整集成测试，覆盖 core 中的标准工作流。

## 测试文件

### `swaps.test.mjs`

**说明：**
- 以下用例直接验证 core 的 V2/V3 API 能力。

**测试覆盖范围：**

#### V2 - Factory, Router, Pair
1. ✅ 部署测试 token (TestCoin + USDT)
2. ✅ 包装为 ERC20 实例
3. ✅ 部署 V2 套件 (Factory + Router + WETH)
4. ✅ 创建交易对 (TokenA <-> TokenB)
5. ✅ 向 pair 注入流动性
6. ✅ 执行 V2 swap (TokenA -> TokenB)

#### V3 - Factory, Router, Pool
1. ✅ 部署测试 token (TokenC + USDT)
2. ✅ 部署 V3 套件 (Factory + Router + Quoter + PositionManager)
3. ✅ 创建 V3 池 (TokenC <-> USDT, fee 0.3%)
4. ✅ 通过 PositionManager 添加流动性
5. ✅ 执行 V3 swap (TokenC -> USDT)
6. ✅ 通过 QuoterV2 查询价格

## 运行测试

### 前置条件

1. **Fork 网络已启动** (在 http://127.0.0.1:8545)
   ```bash
   # 从 core 目录启动 fork
   npm run fork
   ```

2. **带资金的账户** - 由于测试需要部署合约，需要 ETH 来支付 Gas
   - Hardhat fork 模式使用默认账户（自动有资金）
   - 其他环境需要提供私钥

### 命令

```bash
# 方法 1: 使用 Node 内置 test runner
npm test -- src/test/apps/evm/dapps/swaps.test.mjs

# 或直接运行
node --test packages/core/src/test/apps/evm/dapps/swaps.test.mjs
```

## 框架说明

**`packages/core/src/apps/evm/dapps/dapp-resolver.mjs` (通用库)**
```javascript
export function getContractByNames(candidates, address, label, options)
export function buildDappGetters(specs)
export function deployDappSuite(plan, options)
```

**`packages/core/src/apps/evm/dapps/swapv2.mjs`**
```javascript
const getters = buildDappGetters(SWAP_V2_CONTRACTS)
export async function routerV2(address, options)
export async function factoryV2(address, options)
export async function pairV2(address, options)
export async function wethContract(address, options)
export async function deploySwapV2(feeTo, config)
```

**`packages/core/src/apps/evm/dapps/swapv3.mjs`**
```javascript
const getters = buildDappGetters(SWAP_V3_CONTRACTS)
export async function routerV3() / factoryV3() / poolV3() ...
export async function deploySwapV3(config)
```

## 代码复用

| 功能 | 旧脚本风格 | Core |
|------|-----------|------|
| 候选名匹配 | 在每个脚本重复 | dapp-resolver 统一 |
| 部署套件 | 手动部署各合约 | deployDappSuite 链接参数 |
| 合约获取 | 按名称尝试 (×N) | buildDappGetters 生成 |
| 总代码行数 | 270+ | ~500 (包括框架) |
| 新增 DApp 工作量 | 复制+修改 | 配置 + 3 行代码 |

## 迁移详情

### 新增文件
- ✅ `dapp-resolver.mjs` - DApp 框架通用库
- ✅ `swapv2.mjs` - V2 接口完整实现
- ✅ `swapv3.mjs` - V3 接口完整实现

### 修改文件
- ✅ `evm/index.mjs` - 导出 dapps 模块
- ✅ `core/src/index.mjs` - 导出 V2/V3 函数

### 导出验证
所有导出已验证：
- ✅ 完整的 import/export 链路
- ✅ 无语法错误
- ✅ `pnpm install` 成功

## 使用示例

### 部署 V2

```javascript
import { deploySwapV2, routerV2, factoryV2 } from "@ch/core";

// 部署完整套件
const result = await deploySwapV2(myAddress, { network: "hardhat" });
console.log(result.router.address);
console.log(result.factory.address);
console.log(result.weth.address);

// 获取已部署的合约
const router = await routerV2(routerAddress, { runner: signer });
const factory = await factoryV2(factoryAddress, { runner: signer });
```

### 部署 V3

```javascript
import { deploySwapV3, routerV3, poolV3 } from "@ch/core";

// 部署完整套件
const result = await deploySwapV3({ network: "hardhat" });

// 获取合约实例
const router = await routerV3(result.router.address, { runner: signer });
const pool = await poolV3(poolAddress, { runner: signer });
```

### 使用 DApp 框架

```javascript
import { 
  buildDappGetters,
  getContractByNames,
  deployDappSuite
} from "@ch/core";

// 创建自定义 DApp 的 getter
const myDappGetters = buildDappGetters({
  router: { names: ["CustomRouter", "Router"] },
  factory: { names: ["CustomFactory", "Factory"] },
});

// 按名称尝试获取合约
const contract = await getContractByNames(
  ["UniswapRouter", "UniRouter"],
  address,
  "MyRouter",
  options
);

// 顺序部署多个合约（支持参数引用）
const result = await deployDappSuite([
  { name: "Token", key: "token" },
  { name: "Router", args: ["${token.address}"], key: "router" },
], options);
```

## 常见问题

### Q: 测试失败 - "Sender doesn't have enough funds"

**原因**: Fork 网络中的账户没有余额

**解决方案**:
1. 确保使用 Hardhat 的 fork 模式（自动有资金）
2. 或使用 `--address` 参数指定有资金的账户

### Q: 测试找不到 Artifact

**原因**: TestCoin.json 和 USDT.json 不在预期路径

**解决方案**:
1. 确保合约已编译：`npm run compile`
2. 检查 artifact 路径配置

### Q: 如何只运行 V2 或 V3 测试？

使用 Node test runner 的过滤：
```bash
# 仅运行 V2 测试
node --test packages/core/src/test/apps/evm/dapps/swaps.test.mjs --grep "V2"

# 仅运行 V3 测试
node --test packages/core/src/test/apps/evm/dapps/swaps.test.mjs --grep "V3"
```

## 验证清单

- ✅ 测试用例覆盖 V2 和 V3 完整流程
- ✅ 使用新的 DApp 框架
- ✅ 导出链路完整无误
- ✅ 文档齐全
- ✅ Fork 网络集成就绪

## 后续计划

1. **其他 DApp 迁移**
   - Curve
   - Aave
   - 1inch

2. **离链模块集成**
   - price-aggregator
   - token-address-resolver
   - token-risk 报告

3. **进阶测试**
   - 端到端流程测试
   - Gas 优化验证
   - 多链兼容性测试
