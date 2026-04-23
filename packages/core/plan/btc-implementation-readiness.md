# BTC Implementation Readiness (Core)

## 目标

从当前 BTC Read 能力进入 BTC Write 能力实现阶段，统一遵循 core 架构中的 Wallet signer 注入规范。

## 当前状态（已完成）

- Provider 层：`bitcoind` / `mempool` / `blockbook` 三模式已落地。
- Read APIs：`btcProviderSummary`、`btcNodeHealth`、`btcTxGet`、`btcUtxoList`、`btcBalanceGet`、`btcFeeEstimate` 已落地。
- Wallet 规范：已在 core 架构文档声明统一 signer 注入与安全边界。
- BTC Wallet 设计稿：已有 `WALLET_INTEGRATION_DESIGN.md`。

## 开工前必须确认（P0）

1. Wallet 集成策略拍板
- 当前建议：先按 A 方案落地（provider 使用 `deriveKeyMaterial`），保留后续迁移 B 方案能力。
- 若直接上 B 方案：需要先在 wallet 增加批量签名入口（例如 `signBatch`），再开写 BTC signer。

2. BTC 地址类型范围
- 首版是否只支持 `p2wpkh` 与 `p2tr`。
- `p2sh-p2wpkh`、`p2pkh` 是否首版纳入。

3. 网络策略
- 首版 write 仅允许 `testnet/signet/regtest`，默认禁止 `mainnet` 广播。
- mainnet 需要显式开关（如 `allowMainnetBroadcast`）。

4. 多输入签名策略
- path 去重后批量派生（降低重复解密开销）。
- 同一输入签名失败应返回可定位的 input index 与错误码。

5. 错误码规范
- 至少统一：`BTC_TX_BUILD_FAILED`、`BTC_TX_SIGN_FAILED`、`BTC_TX_BROADCAST_FAILED`、`BTC_UNSUPPORTED_CAPABILITY`、`BTC_SCOPE_REJECTED`。

## 依赖与实现准备（P1）

1. 依赖库
- 已有：`bitcoinjs-lib`。
- 待确认：`coinselect`（或等价 UTXO 选择器）是否已安装并锁定版本。
- 若启用 Taproot Schnorr：确认 `tiny-secp256k1` 与 `bitcoinjs-lib` 配置匹配。

2. 目录与文件规划
- `src/apps/btc/signer.mjs`（新建）：`createBtcSigner`、`getAddress`、`signMessage`、`signTransaction`。
- `src/apps/btc/write.mjs`（新建）：`btcTxBuild`、`btcTxSign`、`btcTxBroadcast`。
- `src/apps/btc/index.mjs`：补充 write API 导出。

3. 接口统一
- signer 通用能力名遵循：`getAddress`、`signMessage`、`signTransaction`、`sendTransaction`。
- BTC 特化能力可增加：`signPsbt`（可选），但不破坏通用能力集合。

## 测试准备（P1）

1. 单测
- UTXO 选择、fee 计算、找零输出、dust 处理。
- address type 与签名类型匹配（ECDSA/Schnorr）。

2. 集成
- testnet/signet：`build -> sign -> broadcast` 完整流程。
- provider 差异：bitcoind 与 REST 模式分别验证。

3. 安全与审计
- 错误与日志不输出私钥/助记词/密码。
- session 过期、scope 不匹配、capability 不支持必须显式失败。

## 文档补齐状态（Core）

已在 core：
- `plan/architecture.md`（含 Wallet signer 注入规范）
- `src/apps/btc/WALLET_INTEGRATION_DESIGN.md`
- `plan/btc-implementation-readiness.md`（本文档）

仍建议迁移到 core（当前在 test 路径，建议后续下线或重定向）：
- `src/test/apps/btc/development-plan.md`
- `src/test/apps/btc/QUERY_EXAMPLE.md`

## 建议执行顺序

1. 先完成 `btcTxBroadcast`（最小闭环）。
2. 再实现 `btcTxBuild`（coin selection + fee）。
3. 然后实现 `btcTxSign`（单输入 -> 多输入）。
4. 最后打通 `build -> sign -> broadcast` 示例与测试。
