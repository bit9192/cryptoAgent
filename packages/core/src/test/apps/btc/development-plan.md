# BTC Core Development Plan

## Goal

在 core 内独立实现 BTC 的链访问与交易能力，不再依赖 legacy runtime。现阶段已经有 networks 配置和 signer provider，下一步需要补齐 BTC netProvider、adapter、只读查询能力、交易构建与广播能力，并确保 bitcoind、mempool、blockbook 三种 provider 模式可以在统一接口下工作。

## Current Status

- 已有 BTC networks 配置。
- 已有 BTC signer provider，覆盖地址派生和消息签名。
- 尚未形成面向链访问的 BTC netProvider 抽象。
- 尚未在 core 内落地 BTC core API，例如 balance、utxo、tx、fee、broadcast、build、sign。
- BTC provider 三模式的能力边界还没有在 core 内固化。

## Design Principles

- 业务层不直接判断 providerType，由 resolver 和 adapter 负责分发。
- 统一对外 API，按 capability 做能力协商，而不是到处写条件分支。
- 钱包相关能力与链数据能力分层，避免 REST provider 被伪装成完整 bitcoind。
- 先做只读能力，再做写入和签名，最后做 wallet 管理。
- 保持和现有 apps 配置体系一致，继续由 apps/btc/config 管理网络和 provider 配置。

## Required Preparation

### 1. Extend BTC Network Config

补齐 core BTC network config，使其可以直接驱动 provider resolver。建议补充以下字段：

- providerType
- restUrl
- apiKey
- addressFormat
- isPublicTestnet
- walletName
- explorerUrl
- isLocal

要求：

- bitcoind 使用 rpcUrl、rpcUsername、rpcPassword、walletName。
- mempool 和 blockbook 使用 restUrl，必要时支持 apiKey。
- 所有网络配置都可以被标准化为一个统一 provider config 对象。

### 2. Define Core BTC Provider Contract

需要先定义 core 内部统一 provider 结构，建议至少包含：

- networkName
- providerType
- walletName
- rpcUrl
- restUrl
- explorerUrl
- isLocal
- adapter
- supports(capability)
- healthcheck()

bitcoind 专属扩展：

- rpcCall(method, params)
- walletRpcCall(method, params)

REST provider 不强行实现通用 rpcCall，只暴露语义化方法。

### 3. Define Adapter Capability Matrix

先明确三种 provider 的能力边界：

- bitcoind: getBlock, getTx, getUtxos, estimateFee, sendTx, wallet ops, PSBT related ops
- mempool: getBlock, getTx, getUtxos, estimateFee, sendTx
- blockbook: getBlock, getTx, getUtxos, estimateFee, sendTx

默认规则：

- 签名能力不放在 REST provider 上。
- 钱包管理能力只属于 bitcoind。
- 交易构建在 REST 模式下走本地 PSBT 流程。

## Implementation Phases

### Phase 1. Provider Layer

目标：先把 BTC netProvider 做出来，作为全部 BTC core API 的共同入口。

模块建议：

- apps/btc/netprovider.mjs
- apps/btc/providers/adapter.mjs
- apps/btc/providers/core.mjs
- apps/btc/providers/mempool.mjs
- apps/btc/providers/blockbook.mjs
- apps/btc/providers/defaults.mjs

本阶段要完成：

- 根据 network config 解析 providerType。
- 根据 providerType 创建 adapter。
- 输出统一 provider 对象。
- 提供 default provider 和 resolve provider 能力。
- 保证不同模式下错误信息可区分。

验收标准：

- 能按 networkName 正确解析到 provider。
- supports(capability) 返回稳定结果。
- healthcheck 能反映 provider 是否可连通。

### Phase 2. Read APIs

目标：先落地跨三模式都需要的只读能力。

建议优先实现：

- btcProviderSummary
- btcNodeHealth
- btcFeeEstimate
- btcTxGet
- btcUtxoList
- btcBalanceGet

实现要求：

- 统一返回字段，不让上层感知不同 provider 的原始响应格式。
- 内部明确 sats 和 BTC 的换算策略，避免接口结果混乱。
- 对单地址查询场景保留地址回填逻辑，避免 descriptor 不可解析时丢失 address。

验收标准：

- bitcoind、mempool、blockbook 都能完成至少一组只读测试。
- 本地节点不可用或远程 provider 未配置时，测试应 skip，而不是误判失败。

### Phase 3. Write APIs

目标：实现广播、交易构建、签名三类能力，并明确 bitcoind 模式和 REST 模式的分工。

建议顺序：

- btcTxBroadcast
- btcTxBuild
- btcTxSign

处理策略：

- bitcoind 模式优先调用 wallet RPC。
- REST 模式下，构建与签名走本地 signer 和本地 PSBT 逻辑。
- 对不支持的能力返回明确错误码，不做隐式降级。

验收标准：

- bitcoind 模式可完成 build -> sign -> broadcast。
- REST 模式可完成 local build -> local sign -> remote broadcast。

### Phase 4. Wallet-Only APIs

目标：把只属于 bitcoind 的 wallet 生命周期能力单独收口，不混入通用 provider 接口。

可后置实现：

- loadwallet
- createwallet
- getnewaddress
- listunspent
- lockunspent

要求：

- 这些 API 明确标记为 bitcoind only。
- 调用时必须经 walletRpcCall 走 wallet scoped URL。

## Three-Provider Strategy

### bitcoind

定位：完整功能 provider。

特点：

- 支持 JSON-RPC。
- 支持 wallet RPC。
- 支持交易构建和签名。
- 适合本地开发、回归测试、完整流程验证。

### mempool

定位：轻量 REST provider。

特点：

- 适合区块、交易、地址、UTXO、费率查询。
- 可支持广播，但不负责签名。
- 适合作为公开网络的轻量查询入口。

### blockbook

定位：另一类 REST provider。

特点：

- 与 mempool 类似，偏查询与广播。
- 不承担 wallet 和签名职责。
- 重点是统一返回格式和能力矩阵，而不是完全统一底层协议。

## Testing Plan

### Config Tests

验证网络配置和 provider 解析是否正确：

- networkName 归一化
- providerType 归一化
- rpcUrl 和 restUrl 构造
- default network 选择

### Connectivity Tests

验证三种模式的连通性：

- bitcoind: getblockchaininfo
- mempool: block tip 或 address/tx 查询
- blockbook: status 或 tx 查询

### Capability Tests

验证 supports(capability) 与实际行为一致：

- 不支持的能力必须明确报错
- 支持的能力必须返回统一结构

### Read Flow Tests

优先覆盖：

- btcBalanceGet
- btcUtxoList
- btcTxGet
- btcFeeEstimate

### Write Flow Tests

区分两类：

- bitcoind integration tests
- REST plus local signer integration tests

## Risks And Notes

- 不同 provider 的数值单位和字段命名不一致，必须在 adapter 层归一化。
- wallet RPC 必须走 /wallet/<walletName>，否则多钱包模式下会失败。
- descriptor 解析不能假设只会返回 addr(...)，taproot 场景要保留兜底归属逻辑。
- bitcoind mainnet 不应附带 mainnet flag，只有 regtest 和 testnet 需要网络开关。
- REST provider 不是 bitcoind 的简化版，不要强行对齐所有 RPC 语义。

## Recommended Next Step

先做 Phase 1：补齐 BTC network config 和 netProvider resolver，再开始写 Read APIs。这个顺序可以最早暴露三模式兼容问题，也能避免后续 API 反复返工。