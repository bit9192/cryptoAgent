# deploy.mjs 恢复设计说明

目标：恢复 `packages/core/src/apps/evm/contracts/deploy.mjs`，优先兼容现有测试与历史调用方式；实现顺序遵循“微步开发与可审阅规则”，先恢复最小能力，再逐步补全部署与代理能力。

## 一、确认过的实现约束

### 1. EvmContract 继续基于 ethers Contract 增强

1. `EvmContract` 继承 ethers 的 `Contract`，不自造一套合约调用系统。
2. 对外的合约调用方式保持 ethers 习惯：`contract.name()`、`contract.mint()`、`contract.connect(...)`。
3. 只增强兼容层与辅助接口，不改变原生方法语义。

### 2. connect 需要同时兼容原生 signer 和 wallet.signer

1. `connect(signer)` 接受 ethers 原生 signer/provider。
2. `connect(walletSigner)` 接受系统 wallet 返回的 signer。
3. wallet signer 可能返回 `{ ok, result }` 风格，需要先统一解包再适配为 ethers runner。
4. wallet signer 的 provider 也是统一格式，接入时需要一并转为 ethers 可识别对象。

### 3. 只保留 calls 接口

1. `EvmContract` 仅提供 `contract.calls.method(...args)` 用于 multicall request 构造。
2. 不保留 `contract.call.method(...args)` 这套别名。
3. `calls` 返回值需兼容现有 `multicall.mjs` 的 request 结构与 decode 流程。

### 4. getContract / deploy 需要自动编译兜底

1. 当 artifact 或 manifest 缺失时，不要求用户先手动编译。
2. `getContract()` 与 `deploy()` 可触发自动编译。
3. 自动编译成功后继续执行当前逻辑。
4. 编译依赖 `packages/core/contracts/compile.mjs`。
5. artifact 加载依赖 `packages/core/contracts/load.mjs`，且要支持 manifest 中的相对 `artifactPath`。

### 5. 重复部署需要保留历史语义

1. `deploy()` 后合约信息写入 deployment registry。
2. 重复部署同名合约时，不能丢失历史定位能力。
3. 未指定 `deploymentKey` 时，`getContract()` 默认解析到同名记录中 `updatedAt` 最新的一条。
4. 代理升级历史需体现在 proxies registry 的 `history` 中。

### 6. 所有能力建立在 ethers 和相邻模块之上

1. 运行时合约行为以 ethers Contract 为底座。
2. signer/provider 兼容建立在 ethers runner 模型之上。
3. 部署记录通过 deployment-registry 维护。
4. artifact/manifest 通过 compile/load 模块维护。

## 二、从测试可确认的公开导出

`deploy.mjs` 至少导出：

1. `EvmContract`
2. `deploy`
3. `getContract`
4. `deployProxy`
5. `upProxy`

## 三、分阶段恢复顺序

### Phase 1：EvmContract 最小恢复

目标：先通过 `evm-contract.test.mjs` 与 `multicall.test.mjs` 中对 `EvmContract` 的基础要求。

范围：

1. `class EvmContract extends Contract`
2. `address` 别名
3. `connect(rawSigner)` 自动兼容 wallet signer
4. `calls.method(...args)` request builder

本阶段不做：

1. deploy
2. getContract 地址解析
3. proxy 部署/升级

### Phase 2：getContract 恢复

目标：先打通读取路径。

范围：

1. 从 address 直接构造 `EvmContract`
2. 从 manifest/artifact 加载 abi
3. 从 deployment registry 自动解析最新地址
4. 缺产物时自动编译

本阶段不做：

1. deploy 写 registry
2. proxy 生命周期

### Phase 3：deploy 恢复

目标：完成普通合约部署并写 registry。

范围：

1. 从 artifact 获取 bytecode + abi
2. 使用 ethers signer 部署
3. 写入 `contracts` registry
4. 处理重复部署的 deploymentKey/历史管理策略

### Phase 4：deployProxy / upProxy 恢复

目标：恢复透明代理部署和升级能力。

范围：

1. `deployProxy()`
2. `upProxy()`
3. proxies registry 当前实现与 history 维护
4. 升级后 `getContract()` 正确返回新 ABI 的代理实例

## 四、第一阶段验收标准

在进入 getContract 前，至少满足：

1. `EvmContract: 提供 address 别名`
2. `EvmContract.connect: 自动适配 wallet 风格 signer`
3. `multicall: supports EvmContract call requests directly`

## 五、当前不在本轮恢复范围内的内容

1. 新的 DSL 或额外 helper API
2. 自定义 RPC/ABI 框架
3. 非 ethers 的独立合约调用实现
4. 超出当前测试覆盖的扩展部署策略