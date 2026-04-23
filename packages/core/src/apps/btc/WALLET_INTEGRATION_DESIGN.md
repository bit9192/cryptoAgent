# BTC Write API 与 Wallet 集成设计

## 📋 当前 Wallet 接口规范

### 已有模式（EVM / TRX）

```typescript
// walletContext 接口
interface WalletContext {
  deriveKeyMaterial(options: {
    operation: string      // "signMessage" | "signTransaction" | 自定义
    target?: {            // 可选目标信息
      address?: string
      amount?: string
    }
    ...derivePath        // 派生路径参数
  }): Promise<KeyMaterial>
  
  audit?(record: {       // 审计日志（可选）
    at: string
    keyId: string
    chain: string
    operation: string
    status: "ok" | "error"
    target?: object
  }): Promise<void>
}

interface KeyMaterial {
  privateKeyHex: string  // 16 进制私钥
  path?: string         // 派生路径（BIP44）
  items?: Array<{       // 批量派生时的项目列表
    path: string
    privateKeyHex: string
    address?: string
  }>
}
```

### 工作流程

```
应用层          Signer Provider        Wallet Context       Key Vault
  │                │                        │                  │
  ├─> sign()       │                        │                  │
  │   └─────────> createSigner             │                  │
  │               (walletContext, keyId)   │                  │
  │                                 │       │                  │
  │                                 ├─> deriveKeyMaterial()   │
  │                                 │       ├─> 验证操作     │
  │                                 │       ├─> 解密私钥     │
  │                                 │       │<─ {privateKeyHex}
  │                                 │<─ {privateKeyHex}      │
  │                   签名操作      │                        │
  │                   (bitcoinjs)   │                        │
  │               返回 txid          │                        │
  │<─────────────────────────────────                        │
  │
  │   审计记录（可选）
  ├─> audit()       │
  │   └─────────────> audit()       │
  │                       └───────────────────────────────>
```

## 🏗️ BTC Write API 需要的操作

### 三类签名操作

```
1. signMessage (现有) 
   ├─ 消息摘要
   └─ 返回 signature

2. signTransaction (新增) ⭐ 关键
   ├─ PSBT 对象
   ├─ 私钥签名
   ├─ 支持多签（多个输入）
   └─ 返回 signedTx（hex 格式）

3. buildTransaction (新增) ⭐ 关键
   ├─ 构建未签名 PSBT
   ├─ 需要多个输入私钥信息
   ├─ 返回 PSBT 对象
   └─ 不消耗私钥

4. Address 生成 (现有模式) ⭐ 已有
   ├─ 单地址获取
   ├─ 批量地址派生
   └─ 返回地址数组
```

## 🎯 BTC Provider 与 Wallet 集成方案

### 方案 A：单体 Provider（推荐）

```typescript
// packages/core/src/apps/btc/signer.mjs

export function createBtcSigner(input = {}) {
  const walletContext = input.wallet
  const keyId = String(input.keyId ?? "").trim()

  if (!walletContext?.deriveKeyMaterial) {
    throw new Error("wallet context 无效")
  }

  return {
    chain: "btc",
    keyId,
    capabilities: ["getAddress", "signMessage", "signTransaction", "buildTransaction"],
    
    // 1️⃣ 获取地址
    async getAddress(options = {}) {
      const material = await walletContext.deriveKeyMaterial({
        operation: "getAddress",
        ...options
      })
      
      // 使用 bitcoinjs-lib 从私钥推导地址
      const address = deriveAddressFromKey(material.privateKeyHex, options.addressType)
      
      await walletContext.audit?.({
        keyId, chain: "btc", operation: "getAddress", status: "ok"
      })
      
      return address
    },

    // 2️⃣ 签名消息
    async signMessage(message, options = {}) {
      const { privateKeyHex, material } = await getPrimaryKey("signMessage", options)
      
      // 使用 bitcoinjs-lib
      const signature = signMessageWithPrivateKey(privateKeyHex, message)
      
      await walletContext.audit?.({...})
      
      return { signature, path: material.path }
    },

    // 3️⃣ 签名交易 ⭐ 关键
    async signTransaction(psbt, options = {}) {
      // 需要获取 PSBT 中所有输入对应的私钥
      const inputAddresses = extractInputAddresses(psbt)
      
      // 逐个获取私钥（可能需要多次调用 deriveKeyMaterial）
      const keyMap = await Promise.all(
        inputAddresses.map(addr => 
          walletContext.deriveKeyMaterial({
            operation: "signTransaction",
            target: { address: addr },
            ...options
          })
        )
      )
      
      // 逐个签名输入
      const signedPsbt = signPsbtWithKeys(psbt, keyMap)
      
      await walletContext.audit?.({...multiInput flag...})
      
      return { signedTx: signedPsbt.extractTransaction(), path: "多输入" }
    },

    // 4️⃣ 构建交易（不需要私钥） 🔓
    async buildTransaction(options = {}) {
      // 这个不需要 wallet！
      // 只需要地址信息，通过 btcUtxoList、btcFeeEstimate 获取
      // 返回未签名的 PSBT 对象
      
      // 可选：如果需要自动填充测试签名用于费用计算
      return createUnsignedPsbt(options)
    }
  }
}
```

### 方案 B：分离 Provider（当前 EVM/TRX 模式）

目前 EVM/TRX 都是单个 provider，BTC 也应该保持一致。

## 📐 集成层级设计

### Level 1: 底层签名

**文件**：`packages/core/src/apps/btc/signer.mjs`

```javascript
export function createBtcSigner(input) { ... }  // 与 wallet 集成
export function createBtcKeyPairFromPrivateKey(hex) { ... }  // 本地工具
```

### Level 2: 核心 API

**文件**：`packages/core/src/apps/btc/write.mjs` (新建)

```javascript
// 交易构建（不需要 wallet）
export async function btcTxBuild(options, networkName) {
  // 使用 bitcoinjs-lib
  // 需要：utxos, outputs, changeAddress, feeRate
  // 返回：{ psbt, estimatedFee, ...}
}

// 交易签名（需要 wallet / signer）
export async function btcTxSign(options, signer) {
  // 使用 signer.signTransaction()
  // 需要：psbt, signer
  // 返回：{ signedTx, ...}
}

// 交易广播（不需要 wallet）
export async function btcTxBroadcast(signedTx, network) {
  // 调用 provider.adapter.sendTx()
  // 需要：signedTx hex string
  // 返回：{ txid, ...}
}
```

### Level 3: 高层业务逻辑

**文件**：`packages/core/src/apps/btc/index.mjs`

```javascript
// 完整发送流程（组合型）
export async function btcTxSendComplete(options, signer, network) {
  // 1️⃣ 选择 UTXO 和计算费用
  const utxos = await btcUtxoList({addresses: [...]}, network)
  const fee = await btcFeeEstimate({blocks: 6}, network)
  
  // 2️⃣️ 构建交易
  const { psbt } = await btcTxBuild({utxos, outputs, fee}, network)
  
  // 3️⃣ 签名
  const { signedTx } = await btcTxSign({psbt}, signer)
  
  // 4️⃣ 广播
  const { txid } = await btcTxBroadcast(signedTx, network)
  
  return { txid, psbt, signedTx }
}
```

## 🔄 对比 EVM 工作流

### EVM 当前模式

```
✓ Simple: 直接用 ethers.Wallet.signTransaction(tx)
✓ 一次签名，所有输入都签了
✓ 不需要 PSBT 这样的中间格式
```

### BTC 模式（PSBT 复杂性）

```
✓ Complex: PSBT 可能有多个输入
✓ 需要逐个签名或批量签名
✓ 签名前需要验证各输入是否可签
✓ 需要私钥恢复机制
```

## 📊 Wallet 改动建议

### 现有接口保持不变 ✅

walletContext.deriveKeyMaterial() 已经足够通用：

```javascript
// BTC multi-input 场景
await walletContext.deriveKeyMaterial({
  operation: "signTransaction",
  target: { 
    address: "bc1...", 
    amount: "0.5"  // UTXO 金额
  },
  path: "m/44'/0'/0'/1/5"  // 可选：指定派生路径
})
```

### 需要注意的点 ⚠️

1. **多输入问题**：
   - EVM tx 只有一个 from，BTC PSBT 可能有多个输入
   - 需要循环调用 deriveKeyMaterial() 逐个获取私钥

2. **审计记录**：
   - 单个 audit() 可能包含多个输入
   - 可以标记为 `type: "multi-input"`

3. **性能**：
   - 20 个输入 = 20 次调用 deriveKeyMaterial()
   - 这会调用 20 次 wallet 解密，可能较慢
   - 建议在 signer 层加缓存

## 🛠️ 实现步骤

### Step 1: 创建 BTC Signer Provider

**文件**：`packages/core/src/apps/btc/signer.mjs` (新建)

- [ ] 定义 createBtcSigner() 接口
- [ ] 实现 getAddress()
- [ ] 实现 signMessage()
- [ ] 实现 signTransaction() (多输入支持)

### Step 2: 创建 Write API Layer

**文件**：`packages/core/src/apps/btc/write.mjs` (新建)

- [ ] btcTxBuild() - PSBT 构造器
- [ ] btcTxSign() - PSBT 签名器
- [ ] btcTxBroadcast() - TX 广播器

### Step 3: 集成测试

**文件**：`packages/core/src/test/apps/btc/signer.test.mjs` (新建)

- [ ] 单输入交易签名
- [ ] 多输入交易签名  
- [ ] 地址派生
- [ ] 审计记录

### Step 4: 演示脚本

**文件**：`packages/core/src/run/btc-send.mjs` (新建)

- [ ] 完整发送演示
- [ ] 使用本地或模拟 wallet

## 📌 关键决策表

| 决策 | 选项 | 推荐 | 原因 |
|------|------|------|------|
| Signer 文件位置 | 单独文件 vs core 内混 | 单独 | 对比 EVM/TRX |
| PSBT 构建 | bitcoinjs-lib vs 自实现 | bitcoinjs-lib | 成熟、可靠 |
| 多输入私钥 | 批量获取 vs 逐个获取 | 逐个 | wallet 安全性 |
| 缓存机制 | 有 vs 无 | 有 | 性能考虑 |
| 审计粒度 | 单笔 tx vs 单个 input | 单笔 tx | 简洁性 |

## 🚀 下一步建议

1. **确认**：这个接口设计是否符合你的 wallet 架构?
2. **Review**：key-vault 模块是否有额外要求?
3. **开始**：从 btcTxBroadcast（最简）开始实现

**问题**：
- wallet 模块现在在哪里？可以给个传送门吗？
- deriveKeyMaterial 返回值是否需要扩展？
- 是否需要支持观察钱包模式（xpub）？
