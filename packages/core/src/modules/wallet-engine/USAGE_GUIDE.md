# Wallet-Engine 使用指南

## 概览

Wallet-Engine 是一个统一的钱包地址和签名者解析引擎，支持：
- **两步分离**：检索（retrieve）+ 生成（generate）
- **灵活检索**：按名称精确/模糊、keyId、chain、模式等
- **双模式输出**：address（地址）和 signer（签名者引用）
- **安全保护**：自动过滤敏感字段（私钥、助记词等）

---

## 核心 API

### 1. 检索阶段：`retrieveWalletCandidates(filters, walletStatus)`

从钱包状态中检索候选地址。

```javascript
import { retrieveWalletCandidates } from "../modules/wallet-engine/index.mjs";

const walletStatus = {
  addresses: [
    { keyId: "k1", keyName: "alpha", chain: "evm", address: "0x1111...", name: "main" },
    { keyId: "k1", keyName: "alpha", chain: "evm", address: "0x2222...", name: "alt" },
    { keyId: "k2", keyName: "beta", chain: "trx", address: "TXYZopY...", name: "trx-main" },
  ],
};

// 按名称精确搜寻
const exact = retrieveWalletCandidates({ nameExact: true, name: "main" }, walletStatus);
// 结果: [{ keyId: "k1", address: "0x1111...", name: "main", ... }]

// 按名称模糊搜寻
const fuzzy = retrieveWalletCandidates({ nameExact: false, name: "alt" }, walletStatus);
// 结果: [{ keyId: "k1", address: "0x2222...", name: "alt", ... }]

// 按 keyId
const byKeyId = retrieveWalletCandidates({ keyId: "k2" }, walletStatus);
// 结果: [{ keyId: "k2", address: "TXYZopY...", chain: "trx", ... }]

// 获取全部
const all = retrieveWalletCandidates({ mode: "all" }, walletStatus);
// 结果: [所有3个地址]
```

**检索参数**：
- `nameExact`: boolean - 名称是否精确匹配（默认 false 模糊）
- `name`: string - 按名称过滤
- `keyId`: string - 按 keyId 精确匹配
- `chain`: string - 按 chain 过滤
- `mode`: string - 'all'（全部）或默认按过滤条件
- `hdSubkeys`: boolean - 仅返回 HD 子钱包

---

### 2. 生成地址：`generateAddressFromCandidates(candidates, requirement)`

从候选列表生成最终地址输出。

```javascript
import { generateAddressFromCandidates } from "../modules/wallet-engine/index.mjs";

const candidates = [
  { keyId: "k1", address: "0x1111...", chain: "evm" },
];

// 单数模式：返回单个地址
const single = generateAddressFromCandidates(candidates, { cardinality: "single" });
// 结果: { ok: true, addresses: [...], query: "0x1111...", chain: "evm", ... }

// 复数模式：返回全部候选
const candidates2 = [
  { keyId: "k1", address: "0x1111...", chain: "evm" },
  { keyId: "k1", address: "0x2222...", chain: "evm" },
];
const multi = generateAddressFromCandidates(candidates2, { cardinality: "multi" });
// 结果: { ok: true, addresses: [2个地址], cardinality: "multi", ... }

// 错误处理
try {
  generateAddressFromCandidates(candidates2, { cardinality: "single" });
} catch (err) {
  console.log(err.code); // "MULTIPLE_MATCH"，候选数过多
}
```

**输出格式**：
```javascript
{
  ok: true,
  kind: "address",
  cardinality: "single" | "multi",
  query: "0x1111...",           // 首选地址（single 模式用于搜索）
  chain: "evm",
  addresses: [...],              // 所有选中地址
  resolutionMeta: {
    candidateCount: 2,           // 总候选数
    selectedCount: 1,            // 选中数
    source: "wallet-engine",
  },
}
```

---

### 3. 生成 Signer：`generateSignerFromCandidates(candidates, requirement)`

从候选列表生成 signer 引用（不含私钥）。

```javascript
import { generateSignerFromCandidates } from "../modules/wallet-engine/index.mjs";

const candidates = [
  {
    keyId: "k1",
    address: "0x1111...",
    chain: "evm",
    signerRef: "evm:k1:0x1111",
    signerType: "ethers-signer",
  },
];

const result = generateSignerFromCandidates(candidates, { cardinality: "single" });
// 结果: {
//   ok: true,
//   kind: "signer",
//   signerRefs: ["evm:k1:0x1111"],
//   signerTypes: ["ethers-signer"],
//   addresses: ["0x1111..."],
//   chain: "evm",
//   ... 
// }
```

**安全特性**：
- 输出仅包含 `signerRef`（引用），不含私钥
- 自动过滤敏感字段（mnemonic, password 等）
- 支持多种 signer 类型记录

---

### 4. 地址解析接口：`resolveSearchAddressRequest(input)`

高级接口，结合检索+生成，用于 search 任务。

```javascript
import { resolveSearchAddressRequest } from "../modules/wallet-engine/index.mjs";

const result = resolveSearchAddressRequest({
  // 输入层级（优先级从低到高）
  defaults: { network: "mainnet" },
  inputs: { keyId: "k1", chain: "evm" },
  args: { /* 命令行参数 */ },

  // 钱包状态（候选池）
  walletStatus: {
    addresses: [
      { keyId: "k1", chain: "evm", address: "0x1111...", name: "main" },
      { keyId: "k1", chain: "evm", address: "0x2222...", name: "alt" },
    ],
  },

  // 输出要求
  requirement: { kind: "address", cardinality: "single" },
});

// 结果: 从 k1 + evm 的候选中选出第一个地址
// { ok: true, query: "0x1111...", chain: "evm", network: "mainnet", ... }
```

---

### 5. Signer 解析接口：`resolveSignerRefs(input)`

针对 signer 场景的解析接口。

```javascript
import { resolveSignerRefs } from "../modules/wallet-engine/index.mjs";

const result = resolveSignerRefs({
  inputs: { keyId: "k1", chain: "evm" },
  walletStatus: {
    addresses: [
      { keyId: "k1", chain: "evm", address: "0x1111...", signerRef: "evm:k1:main", ... },
    ],
  },
  requirement: { kind: "signer", cardinality: "single" },
});

// 结果: { ok: true, signerRefs: ["evm:k1:main"], chain: "evm", ... }
```

---

## CLI 集成使用

### 场景：查询 wallet inputs 的代币资产

#### 第一步：设置 inputs

```bash
lon[dev]> wallet inputs.set wallet --data '{"address":"0x1111...","chain":"evm"}'
```

输出：
```json
{
  "ok": true,
  "action": "wallet.inputs.set",
  "item": {
    "scope": "wallet",
    "data": {
      "address": "0x1111...",
      "chain": "evm"
    }
  }
}
```

#### 第二步：查看已设置的 inputs

```bash
lon[dev]> wallet inputs.show
```

输出：
```json
{
  "ok": true,
  "items": [
    {
      "scope": "wallet",
      "data": {
        "address": "0x1111...",
        "chain": "evm"
      }
    }
  ]
}
```

#### 第三步：使用 `si token` 命令搜索资产

```bash
lon[dev]> si token --network eth
```

**CLI 内部流程**（wallet-engine 集成）：
1. 从 inputs 读取地址 `0x1111...`
2. 通过 wallet-engine 的三级解析：
   - 第一级：直接提取 `inputs.address`
   - 第二级：wallet-engine 反查（如果只有 keyId）
   - 第三级：wallet.status 反查（备用）
3. 得到最终地址 `0x1111...`
4. 调用 `search` 任务查询该地址的代币

输出：
```
[search-inputs] 查询地址: 0x1111111111111111111111111111111111111111
[search-inputs] domain: token, network: eth
```

---

## 错误处理

### 错误码

| 错误码 | 含义 | 处理方式 |
|--------|------|---------|
| `NO_MATCH` | 无候选匹配 | 检查 inputs 或约束条件 |
| `MULTIPLE_MATCH` | 多候选匹配（single 模式） | 增加约束条件（chain、name 等） |
| `INVALID_REQUIREMENT_KIND` | kind 非法 | kind 只能是 'address' 或 'signer' |
| `SECURITY_VIOLATION` | 输出含敏感字段 | 内部错误，请报告 |

### 示例

```javascript
try {
  const result = resolveSearchAddressRequest({
    inputs: { keyId: "k1" }, // 多个地址
    requirement: { kind: "address", cardinality: "single" },
    walletStatus: { ... },
  });
} catch (err) {
  if (err.code === "MULTIPLE_MATCH") {
    console.log(`找到 ${err.meta.count} 个地址，需要补充约束（chain、name 等）`);
    // 重试：添加 chain 或 name 参数
  } else if (err.code === "NO_MATCH") {
    console.log("未找到匹配的地址");
  }
}
```

---

## 最佳实践

### 1. 优先级清晰

```javascript
// ✅ 好：明确的优先级
const result = resolveSearchAddressRequest({
  defaults: { network: "mainnet", chain: "evm" },  // 默认值
  inputs: { keyId: "k1" },                          // 用户设置
  args: { address: "0x..." },                       // 命令行覆盖（最高优先级）
  walletStatus,
  requirement: { kind: "address", cardinality: "single" },
});
```

### 2. 约束足够

```javascript
// ✅ 好：约束清晰
resolveSearchAddressRequest({
  inputs: { keyId: "k1", chain: "evm", name: "main" },
  // ...
});

// ❌ 不好：约束不足
resolveSearchAddressRequest({
  inputs: { keyId: "k1" }, // k1 可能有多个地址
  // ...
});
```

### 3. 错误处理

```javascript
// ✅ 好：捕获并处理
try {
  const result = resolveSearchAddressRequest({ ... });
  if (!result.ok) throw new Error("解析失败");
} catch (err) {
  if (err.code === "MULTIPLE_MATCH") {
    // 引导用户增加约束
  }
}

// ❌ 不好：忽略错误
const result = resolveSearchAddressRequest({ ... });
// 如果是多候选，会抛异常但未捕获
```

---

## 集成到新场景

### 步骤 1：导入

```javascript
import { resolveSearchAddressRequest, resolveSignerRefs } from "../modules/wallet-engine/index.mjs";
```

### 步骤 2：获取钱包状态

```javascript
const walletStatus = await getWalletStatusFromSession(sessionId);
// 返回: { addresses: [{keyId, address, chain, signerRef, ...}, ...] }
```

### 步骤 3：调用解析

```javascript
const addressResult = resolveSearchAddressRequest({
  inputs,
  walletStatus,
  requirement: { kind: "address", cardinality: "single" },
});

// 或用于 signer 场景
const signerResult = resolveSignerRefs({
  inputs,
  walletStatus,
  requirement: { kind: "signer", cardinality: "multi" },
});
```

### 步骤 4：使用结果

```javascript
if (addressResult.ok) {
  // 用于 search/query
  await searchTask({ query: addressResult.query, network: addressResult.network });
} else {
  console.error(addressResult.error);
}
```

---

## 测试验证

所有功能都通过测试验证（56/56 tests pass）：

```bash
# 运行 wallet-engine 测试
node --test src/test/modules/wallet-engine/wallet-engine.test.mjs

# 运行 CLI 集成测试
node --test src/test/tasks/wallet.session.task.test.mjs
node --test src/test/tasks/search/search.test.mjs
```

---

## 常见问题

**Q: wallet-engine 和 wallet.status 的区别？**
- `wallet.status`：查看当前已解锁的地址列表
- `wallet-engine`：按条件灵活检索和生成地址/signer

**Q: 什么时候用 single，什么时候用 multi？**
- `single`：需要唯一地址（默认，用于查询）
- `multi`：需要多个地址（批量操作）

**Q: 如何处理 HD 钱包的多路径派生？**
- 检索时使用 `hdSubkeys: true`
- 生成结果中包含 `paths` 字段
- 后续可按路径选择特定派生地址

**Q: 输出中为什么没有私钥？**
- 安全设计！wallet-engine 仅输出 `signerRef`（引用）
- 实际签名由 signer 模块处理

---

## 更新历史

- **WE-2（2026-04-27）**：检索+生成分离、向后兼容
- **WE-3（2026-04-27）**：Signer 支持、安全检验
- **WE-4（2026-04-27）**：CLI 集成、三级解析
