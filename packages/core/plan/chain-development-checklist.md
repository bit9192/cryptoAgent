# 新链开发 Checklist

本文档用于未来新增任意链时快速梳理开发点、实现顺序、测试范围和交付标准。

适用范围：
- 新接入一条主链或侧链
- 将 legacy 链能力迁移到 core
- 补齐某条链的基础能力缺口

---

## 1. 立项前确认

- 明确链类型：账户模型 / UTXO 模型 / 资源模型 / 合约模型
- 明确网络集合：mainnet / testnet / local / fork
- 明确底层接入方式：JSON-RPC / REST / 特定网关 / 自定义节点
- 明确 wallet 是否支持：私钥、助记词、派生路径、地址编码
- 明确该链最小可交付目标：`查询 + 发送` 还是 `查询 + 发送 + 合约`

---

## 2. 必备文件清单

新增 `src/apps/<chain>/` 时，优先补齐：

- `config/networks.js`
- `netprovider.mjs`
- `provider.mjs`
- `index.mjs`

按需要继续补：

- `accounts.mjs`
- `balances.mjs`
- `send.mjs`
- `contracts/` 或链特化模块
- `address-codec.mjs`（如链地址格式非标准）

---

## 3. networks.js Checklist

- 定义默认网络名
- 定义 `normalizeXxxNetworkName()`
- 定义 `getXxxNetworkConfig()`
- 提供 mainnet/testnet/local/fork 的最小元数据：
  - `networkName`
  - `chainId` 或等价链标识
  - `rpcUrl`
  - `explorerUrl`
  - `isLocal`
  - `isMainnet`
  - `isPublicTestnet`
  - `providerType`

验收：
- 可通过测试读取默认网络配置
- normalize 结果稳定

---

## 4. netprovider.mjs Checklist

必须实现：

- `createXxxNetProvider(input = {})`
- `defaultXxxNetProvider()`
- `resolveXxxNetProvider(networkNameOrProvider, fallbackOptions = {})`

必须具备：

- 统一元数据
  - `chain`
  - `networkName`
  - `providerType`
  - `rpcUrl` 或底层 endpoint
- 底层 provider / adapter
- `healthcheck()`

resolve 规则必须统一：

- 传字符串：按 networkName 创建
- 传已包装 provider：直接返回
- 传裸 provider：包装成标准 netprovider
- 传空值：返回 default provider

验收：
- create 可用
- resolve 可透传
- 裸 provider 可包装
- healthcheck 可跑或安全失败

---

## 5. provider.mjs Checklist

必须实现 `createXxxProvider()`，并支持 wallet 注入。

createSigner 必须支持：

- `getAddress()`
- `signMessage()`
- `signTransaction()`
- `sendTransaction()`

必须遵守：

- signer 来源只能是 `wallet.getSigner()` 链路
- 不向业务层暴露私钥
- 必须兼容 wallet audit / scope / capability 检查
- `sendTransaction()` 必须支持底层 rpc / netprovider 注入

验收：
- wallet + provider 可以创建 signer
- signer 能独立执行四个基础能力

---

## 6. 基础业务能力 Checklist

最小完成集：

- `xxxAccounts`
- `xxxBalanceGet`
- `xxxSend` 或等价发送入口

如链需要，再继续：

- `xxxBalanceBatch`
- `xxxTxBuild`
- `xxxTxBroadcast`
- `xxxContractRead/Write`

原则：
- 查询能力先完成
- 发送能力必须落地
- 特化能力后补

---

## 7. 测试 Checklist

至少补三类：

### A. provider test

- getAddress
- signMessage
- signTransaction
- scope 校验
- 特殊密钥格式兼容（如 WIF）

### B. netprovider test

- create
- resolve string
- resolve wrapped provider
- resolve raw provider

### C. flow test（env-gated）

固定流程：

1. `createWallet`
2. `loadKeyFile`
3. `unlock`
4. `registerProvider`
5. `wallet.getSigner`
6. 地址/余额确认
7. 真实发送或本地链发送

要求：
- 默认 skip，不误发真网
- 本地节点不可用时 skip，不直接 fail
- 至少保留 1 条可复跑发送用例

---

## 8. 导出 Checklist

必须更新：

- `src/apps/<chain>/index.mjs`
- `src/apps/index.js`
- `src/index.mjs`

如作为默认链支持，再更新：

- `src/apps/default-wallet.mjs`

验收：
- 顶层 import 可用
- default wallet 可注册该链

---

## 9. 链特化能力 Checklist

在完成基础能力后，再按链模型补：

- EVM
  - contract facade
  - typed data
  - gas strategy
  - fork / simulation
- BTC
  - UTXO list
  - fee estimate
  - tx build/sign/broadcast
  - multisig / PSBT
- TRX
  - wallet / walletsolidity 区分
  - resource model
  - TRC20 封装

规则：
- 特化能力只放 `apps/<chain>`
- 不反向污染 wallet core
- 不让 execute 感知链内部细节

---

## 10. 推荐开发顺序

每次新增一条链，固定按此顺序：

1. `config/networks.js`
2. `netprovider.mjs`
3. `provider.mjs`
4. `index.mjs`
5. `balances/send` 最小能力
6. provider + netprovider 测试
7. flow 测试
8. 导出层接入
9. 默认 wallet 注册
10. 特化能力补充

---

## 11. DoD

只有以下全部满足，才可标记链接入完成：

- 网络配置完成
- netprovider 完成
- provider 完成
- wallet signer 可用
- 地址 / 签名 / 发送完成
- 至少一个余额查询完成
- provider 测试通过
- netprovider 测试通过
- flow 测试通过或安全 skip
- 导出层完成
- default wallet 接入完成（如适用）
