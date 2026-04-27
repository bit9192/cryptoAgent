# 检索阶段测试样本 (retrieveWalletCandidates)

## 检索数据集

```
钱包状态：
├─ k1 (keyName: "alpha", chain: evm)
│  ├─ 0x1111...1111 (name: "main")
│  └─ 0x2222...2222 (name: "alt")
├─ k2 (keyName: "beta", chain: trx)
│  └─ TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf (name: "trx-main")
└─ k3 (keyName: "dev-hd", chain: evm, HD: m/44'/60'/0')
   ├─ 0x3333...3333 (name: "dev-m0", path: "m/44'/60'/0'/0/0")
   └─ 0x4444...4444 (name: "dev-m1", path: "m/44'/60'/0'/0/1")
```

## Happy Cases - 检索

### H1：精确名称搜寻单结果
- 输入：`retrieveWalletCandidates({ nameExact: true, name: "main" })`
- 期望：`[{ keyId: "k1", name: "main", address: "0x1111...1111" }]`

### H2：模糊名称搜寻多结果
- 输入：`retrieveWalletCandidates({ nameExact: false, name: "dev" })`
- 期望：包含 `dev-hd` 的所有候选（模糊匹配）

### H3：按 keyId 精确匹配
- 输入：`retrieveWalletCandidates({ keyId: "k3" })`
- 期望：返回 k3 的全部地址（包含 dev-m0, dev-m1）

### H4：获取全部候选
- 输入：`retrieveWalletCandidates({ mode: "all" })`
- 期望：返回全部 5 个地址（k1 的 2 个 + k2 的 1 个 + k3 的 2 个）

### H5：获取 HD 子钱包
- 输入：`retrieveWalletCandidates({ keyId: "k3", hdSubkeys: true })`
- 期望：返回 k3 的 HD 子钱包列表（dev-m0, dev-m1，按 path 字典序）

## Edge Cases - 检索

### E1：模糊名称无结果
- 输入：`retrieveWalletCandidates({ nameExact: false, name: "nonexistent" })`
- 期望：返回空数组 `[]`（不报错）

### E2：keyId 不存在
- 输入：`retrieveWalletCandidates({ keyId: "k-not-exist" })`
- 期望：返回空数组 `[]`

### E3：精确名称无结果
- 输入：`retrieveWalletCandidates({ nameExact: true, name: "dev" })`
- 期望：返回空数组（"dev" 作为精确值不匹配 "dev-m0"）

### E4：多过滤条件组合
- 输入：`retrieveWalletCandidates({ keyId: "k1", chain: "evm", name: "main" })`
- 期望：返回精确单条 `main`

### E5：HD 非 HD key
- 输入：`retrieveWalletCandidates({ keyId: "k2", hdSubkeys: true })`
- 期望：返回空数组或标记该 key 非 HD（根据实现）

## Invalid Cases - 检索

### I1：无效的 mode
- 输入：`retrieveWalletCandidates({ mode: "invalid" })`
- 期望：报错或忽略（待定）

### I2：nameExact 与 keyId 冲突
- 输入：`retrieveWalletCandidates({ nameExact: true, name: "main", keyId: "k2" })`
- 期望：多条件约束，返回交集（空或过滤后结果）

---

# 生成阶段测试样本 (generateAddressFromCandidates)

## Happy Cases - 生成

### H6：单数模式，单候选
- 输入候选：`[{ keyId: "k1", address: "0x1111..." }]`
- requirement：`{ cardinality: "single" }`
- 期望：`{ ok: true, addresses: [...], query: "0x1111..." }`

### H7：复数模式，多候选
- 输入候选：`[{ keyId: "k1", address: "0x1111..." }, { keyId: "k1", address: "0x2222..." }]`
- requirement：`{ cardinality: "multi" }`
- 期望：`{ ok: true, addresses: [两个地址] }`

### H8：Key-only 候选反查
- 输入候选：`[{ keyId: "k1", keyName: "alpha", address: null }]`（从检索阶段来的无地址候选）
- 通过 walletStatus 反查地址
- 期望：`{ ok: true, addresses: [...real address...] }`

## Invalid Cases - 生成

### I3：单数模式多候选
- 输入候选：`[addr1, addr2]`
- requirement：`{ cardinality: "single" }`
- 期望：报错 `MULTIPLE_MATCH`，meta 包含 `count: 2`

### I4：无候选
- 输入候选：`[]`
- 期望：报错 `NO_MATCH`

---

# Signer 生成阶段测试样本 (resolveSignerRefs)

## Signer 候选数据集

```
钱包树中的 signer 候选：
├─ k1:evm (keyName: "alpha", chain: evm)
│  ├─ signer.ref="evm:k1:0x1111" (address: "0x1111...1111", name: "main", signerType: "ethers-signer")
│  └─ signer.ref="evm:k1:0x2222" (address: "0x2222...2222", name: "alt", signerType: "ethers-signer")
├─ k2:trx (keyName: "beta", chain: trx)
│  └─ signer.ref="trx:k2:main" (address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", name: "trx-main", signerType: "trx-signer")
└─ k3:evm:HD (keyName: "dev-hd", chain: evm)
   ├─ signer.ref="evm:k3:m0" (address: "0x3333...3333", name: "dev-m0", path: "m/44'/60'/0'/0/0", signerType: "hd-signer")
   └─ signer.ref="evm:k3:m1" (address: "0x4444...4444", name: "dev-m1", path: "m/44'/60'/0'/0/1", signerType: "hd-signer")
```

## Happy Cases - Signer

### S1：单候选 signer 输出
- 输入候选：`[{ keyId: "k1", address: "0x1111...", signerRef: "evm:k1:0x1111", signerType: "ethers-signer" }]`
- requirement：`{ kind: "signer", cardinality: "single" }`
- 期望：`{ ok: true, signerRefs: ["evm:k1:0x1111"], resolutionMeta: { signerType: "ethers-signer", ... } }`
- **检查**：输出中没有 privateKey、mnemonic、password

### S2：多候选 signer 列表
- 输入候选：k1 的 2 个 signer
- requirement：`{ kind: "signer", cardinality: "multi" }`
- 期望：`{ ok: true, signerRefs: ["evm:k1:0x1111", "evm:k1:0x2222"], ... }`
- **检查**：输出中没有敏感字段

### S3：跨链 signer 单选
- 输入候选：来自 k2:trx 的 signer
- requirement：`{ kind: "signer", cardinality: "single" }`
- 期望：`{ ok: true, signerRefs: ["trx:k2:main"], chain: "trx", ... }`
- **检查**：正确标记 chain

### S4：HD signer 派生
- 输入候选：来自 k3 的 HD signer（含 path）
- requirement：`{ kind: "signer", cardinality: "multi" }`
- 期望：`{ ok: true, signerRefs: ["evm:k3:m0", "evm:k3:m1"], paths: ["m/44'/60'/0'/0/0", "m/44'/60'/0'/0/1"], ... }`
- **检查**：路径信息正确保留

## Invalid Cases - Signer

### I5：单数模式多 signer
- 输入候选：k1 的 2 个 signer
- requirement：`{ kind: "signer", cardinality: "single" }`
- 期望：报错 `MULTIPLE_MATCH`
- **检查**：错误消息中没有 signer 明文

### I6：无候选 signer
- 输入候选：`[]`
- 期望：报错 `NO_MATCH`

---

# Security Cases

## 安全检查清单

1. **Address 输出无敏感字段**：输出中不得包含 `privateKey` / `mnemonic` / `password` / `secretKey` / `seed`
2. **Signer 输出无敏感字段**：signer 仅允许输出 `signerRef` 与元信息，禁止返回明文密钥
3. **错误消息脱敏**：错误信息不得包含敏感字段原文、密钥片段、助记词片段
4. **审计追踪**：输出包含 `resolutionMeta` 记录源、类型、约束条件

## 安全样本

### SEC-1：Address 输出不含私钥
- 候选中有 `{ privateKey: "0x123abc...", address: "0x1111..." }`
- 要求 kind="address"
- 输出：`{ ok: true, addresses: [{ address: "0x1111...", name: "..." }] }`
- **检查**：privateKey 字段必须被过滤掉

### SEC-2：Signer 输出只有 signerRef
- 候选中有 `{ signerRef: "ref", mnemonic: "word1 word2..." }`
- 要求 kind="signer"
- 输出：`{ ok: true, signerRefs: ["ref"], ... }`
- **检查**：mnemonic 字段必须被过滤掉

### SEC-3：错误消息脱敏
- 候选包含 keyId="priv_key_abc123def456"
- 无匹配时报错
- 错误消息：`{ code: "NO_MATCH", message: "未匹配到可用...", meta: { keyId: null } }`
- **检查**：keyId 在 meta 中返回 null 或脱敏值

