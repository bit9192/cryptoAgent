# 2.0 架构规划

## 背景

1.0 存在的核心问题：
- 各链配置分散，扩展一条新链要改多处地方
- key 加密和地址派生没有统一路径
- 基础接口边界不清，模块互相穿透
- op 模式无法跨文件复用上下文
- 编译/构建与业务运行耦合在一起

---

## 分层规则（单向依赖，不可反向）

```
interface  →  modules  →  apps  →  execute  →  task  →  cli / server
```

- 任何下层不能 import 上层
- modules 不能依赖 apps
- apps 不能依赖 execute / task
- execute 只编排，不实现业务逻辑

---

## 目录结构

```
src/
  interface/          # 类型定义、错误码、协议契约（最底层，无任何业务依赖）
  modules/            # 可复用基础能力
    key/              # 私钥加密、派生、地址格式化（与链无关部分）
    storage/          # 统一存储接口（read/write/lock/snapshot/restore）
    config/           # 链参数配置、网络映射
    logger/           # 统一日志
    runtime/          # 进程环境、环境变量读取
  apps/               # 各链适配层（对外只暴露统一接口）
    evm/              # EVM 链实现
      configs/        # 网络配置（networks.ts 等）
      accounts/       # 账户/地址管理
      balances/       # 余额查询
      contracts/      # 合约调用（读写已部署合约，不负责编译）
      fork/           # fork 节点交互（hardhat fork 独立在此）
      risk/           # 风控检查（goplus、fork 探针等）
      price/          # 价格聚合
    btc/              # BTC 链实现
    trx/              # TRX 链实现
    offchain/         # 链外数据（API 聚合、价格信息等）
    wallet/           # 跨链钱包：加载、解锁、维护密钥树
  execute/            # 执行引擎（状态机、校验、重试、checkpoint、审计）
    context.mjs       # 执行上下文
    engine.mjs        # 主引擎
    resume.mjs        # 断点恢复
  tasks/              # 业务任务定义（声明式，描述意图和参数）
    key/
    transfer/
    risk/
  adapters/           # 旧系统兼容层（用于平滑过渡）
    legacy/           # 转调 @ch/legacy，稳定后逐步下线
  scripts/
    runtime/          # CLI 运行脚本
  cli/                # CLI 交互入口
  server/             # HTTP/WS 服务接口
  test/               # 测试（按层镜像：test/modules/, test/apps/ 等）

contracts/            # Solidity 合约工程（独立构建域，不混入运行时代码）
  src/                # .sol 合约源码
  scripts/            # hardhat deploy/verify 脚本
  manifest/           # 编译产物索引（合约名、abi路径、部署地址、版本）

storage/              # 运行时数据存储（key、backup、export 等）
  key/
  backup/
  export/
  apps/
    evm/
      deployment/     # 部署记录（chainId.json）
      abi/            # 导出的 ABI
    btc/
      txhash/
```

---

## contracts 层职责

- 只放：Solidity 源码、hardhat 配置、编译脚本、产物 manifest
- 不放：运行时业务逻辑
- 编译模式：
  - `never`：不自动编译（生产/CI 默认）
  - `auto`：部署动作触发时才按需编译（开发默认）
  - `prebuilt`：构建流水线先编译，运行时只消费产物
- 触发编译的操作：Deploy、DeployProxy、UpProxy
- 不触发编译的操作：GetContract、Call、Send、balance、risk、price

---

## storage 层职责

- 统一存储接口，底层可替换（本地文件 / sqlite / 远程）
- 对外接口：read / write / lock / snapshot / restore
- 不直接暴露文件路径给上层

---

## modules/key 职责

- 加解密、助记词、派生路径（与链无关的部分）
- 各链的地址格式化放到 apps/evm、apps/btc 各自处理
- wallet 层：负责加载/解锁/维护密钥树（跨链统一入口）

---

## execute 与 task 边界

| | task | execute |
|---|---|---|
| 职责 | 描述业务意图和参数模型 | 运行时引擎：校验、重试、恢复、日志 |
| 内容 | 声明式配置 | 命令式流程控制 |
| 依赖 | 不依赖 execute | 不包含具体业务逻辑 |

---

## 扩展一条新链的成本

2.0 目标：添加新链只需：
1. 在 `modules/config` 增加链参数
2. 在 `apps/<newchain>` 实现 accounts / balances / send 接口
3. 在 `storage/apps/<newchain>` 增加数据目录
4. 无需修改 execute / task / cli / server

---

## 新链开发基线（必须具备）

后续新增任意一条链时，先实现“统一基线”，再做链特化能力。原则是：
- 先保证多链公共接口一致。
- 再补链特有能力，不让特化逻辑污染统一入口。
- 新链默认可接入 wallet、测试、execute，避免只完成半套 API。

### 必备基础模块

新增 `apps/<newchain>` 时，至少应具备以下文件或等价能力：

- `provider.mjs`
  - 实现 wallet signer provider。
  - 必须支持：`getAddress`、`signMessage`、`signTransaction`、`sendTransaction`。
- `netprovider.mjs`
  - 实现 `createXxxNetProvider`、`defaultXxxNetProvider`、`resolveXxxNetProvider`。
  - 统一承载网络元数据、底层 RPC/provider、健康检查。
- `index.mjs`
  - 只暴露公开 API，不暴露内部实现细节。
- `config/networks.js`
  - 维护链网络配置、默认网络、network normalize 规则。

### 必备基础能力

每条新链至少要先完成以下能力，才算达到“可接入”状态：

1. 网络配置
  - 默认网络名
  - networkName normalize
  - chainId / rpc / explorer 等元数据
2. NetProvider
  - 创建 provider
  - resolve provider
  - healthcheck
3. Wallet Signer Provider
  - 通过 `wallet.getSigner({ chain, keyId, ... })` 获取 signer
  - 不允许业务层直接接触私钥
4. 地址能力
  - `getAddress()`
  - 多路径/批量地址能力（若链需要）
5. 签名能力
  - `signMessage()`
  - `signTransaction()`
6. 发送能力
  - `sendTransaction()`
  - 返回统一结果结构（至少包含 `ok`、`operation`、`result`）
7. 查询能力
  - 最少完成 `balance` 查询
  - 若链模型需要，再补账户信息、nonce、资源、UTXO 等

### 统一接口约束

新增一条链时，公共接口命名遵循以下约定：

- NetProvider：
  - `createXxxNetProvider`
  - `defaultXxxNetProvider`
  - `resolveXxxNetProvider`
- Wallet Provider：
  - `createXxxProvider`
- 高层链能力：
  - `xxxAccounts`
  - `xxxBalanceGet`
  - `xxxBalanceBatch`（如适用）
  - `xxxSend` / `xxxTxBuild` / `xxxTxBroadcast`（按链特性拆分）

统一要求：
- `resolveXxxNetProvider` 必须接受字符串、provider 对象、空值三类输入。
- `createXxxProvider` 必须兼容 wallet context。
- `sendTransaction` 必须走 wallet signer，不允许外部直接注入明文私钥。

### 测试基线（必须补齐）

每条新链至少应有三层测试：

1. provider 测试
  - signer 创建
  - 地址派生
  - signMessage
  - signTransaction
2. netprovider 测试
  - create
  - resolve
  - 已包装 provider 透传
3. flow 测试（env-gated）
  - wallet.loadKeyFile
  - wallet.unlock
  - wallet.getSigner
  - 查询余额
  - 真实发送或本地链发送

要求：
- 默认不误发真网，真实发送必须 env-gated。
- 本地节点场景必须支持 skip，而不是硬失败。
- 至少保留一条可复跑的 end-to-end 用例。

### 导出层约束

新增链后，必须同步以下导出层：

- `apps/<chain>/index.mjs`
- `src/apps/index.js`
- `src/index.mjs`
- `default-wallet.mjs`（如需默认注册）

目标是保证：
- 单链可独立 import
- 顶层可统一 import
- 默认 wallet 可直接注册/启用该链

### 开发顺序模板

新增一条链时，推荐固定按以下顺序开发：

1. `config/networks.js`
2. `netprovider.mjs`
3. `provider.mjs`
4. `index.mjs`
5. 最小查询能力（balance）
6. 最小发送能力（sendTransaction 或等价）
7. provider/netprovider 单测
8. flow 集成测试
9. 链特化能力（合约、UTXO、资源、typed data、多签等）

这样做的原因是：
- 先建立统一接入面
- 再建立可验证闭环
- 最后再做复杂特化，避免反复返工

### 特化能力放置原则

链特有能力不放到 wallet core，也不强行塞进统一接口。

示例：
- EVM：contract facade、typed data、gas strategy、fork tools
- BTC：PSBT、UTXO 选择、多签、手续费估算
- TRX：resource model、TRC20 trigger 调用、wallet/walletsolidity 区分

原则：
- 公共能力统一
- 特化能力下沉到 `apps/<chain>`
- execute/task 只消费公开接口，不了解链内部实现细节

### 完成定义（Definition of Done）

一条新链只有在以下条件都满足时，才算“完成接入”：

- 网络配置完成
- netprovider 完成
- wallet provider 完成
- 地址/签名/发送完成
- 至少一个余额查询 API 完成
- 单测通过
- flow 测试通过或在不可用环境下安全 skip
- 顶层导出完成
- default wallet 可选注册完成

详细开发 checklist 见：`plan/chain-development-checklist.md`

---

## 迁移节奏

- Phase 1：interface + adapters/legacy + execute 基础框架
- Phase 2：apps/evm（优先 risk，当前最成熟）
- Phase 3：modules/key + wallet
- Phase 4：apps/btc、apps/trx
- Phase 5：contracts 独立包 @ch/contracts
- Phase 6：storage 接口层
- Phase 7：cli / server

每个 Phase 结束后，legacy 对应的 adapter 下线。

---

## 命名规范

| 方面 | 规范 |
|---|---|
| 目录名 | 小写连字符，例如 `key-vault` |
| 文件扩展 | `.mjs`（纯 ESM），`.ts`（类型定义） |
| 导出 | 每个模块有唯一 `index.mjs` 做公开接口 |
| 测试文件 | `*.test.mjs`，镜像被测目录 |

---

## Wallet Signer 注入规范（多链统一）

为保证多链一致性与密钥安全边界，`btc`、`evm`、`trx` 及后续新链统一采用以下规则。

### 统一入口规则

- 所有链的签名与发交易能力，统一通过 `wallet.getSigner({ chain, keyId, ... })` 获取 signer。
- 业务层不得直接持有或传递私钥、助记词、密码；仅允许持有 signer。
- 新链接入流程固定为：实现 chain provider → 注入 wallet → 通过 signer 对外提供能力。

### 职责边界

- `apps/wallet`：负责 key 管理、session、能力校验、审计、provider registry。
- `apps/<chain>`：负责链协议细节与特化能力实现。
- wallet core 不实现链协议细节（如 ABI 编码、PSBT 组装、链特定签名算法选择）。

### 通用能力与链特化能力

- 通用能力（建议统一命名）：`getAddress`、`signMessage`、`signTransaction`、`sendTransaction`。
- 链特化能力保留在各链模块内：
  - EVM：`contract read/write/simulate`、`typed data`、gas 策略。
  - BTC：`PSBT`、多输入/多签、手续费与 UTXO 选择。
  - TRX：链特有 transaction 结构与资源模型。
- 特化能力调用时仍需传入 wallet 导出的 signer，保持同一安全边界。

### 推荐调用链

1. 业务层调用 `wallet.getSigner(...)` 获取 signer。
2. 将 signer 传入对应链能力（例如 EVM 合约 facade、BTC tx builder/signer）。
3. 链模块执行协议逻辑并在签名阶段回调 wallet 上下文能力（校验/审计）。
4. 返回标准化结果（`txHash`/`receipt`/`rawTx` 等）。

### 安全强约束

- 禁止新增任何可直接导出 secret 的公共接口（如 `exportPrivateKey`、`getSecret`）。
- signer 不得长期缓存可用于签名的敏感材料。
- 错误与日志中禁止出现 `privateKey`、`mnemonic`、`password`、`secret` 明文。

### 兼容性约束（EVM 合约调用）

- 对外应兼容原生调用习惯（如 `usdt.approve(...)`、`usdt.connect(signer).approve(...)`）。
- 允许提供统一入口（如 `write(method, args)`）作为跨链一致调用方式。
- 原生风格为优先体验，统一入口为可维护性兜底。
