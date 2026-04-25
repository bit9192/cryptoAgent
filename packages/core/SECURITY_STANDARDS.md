# 安全和字段隔离规范

**最后更新**: 2026-04-25

本文档定义了如何在 contractHelper 中安全处理敏感数据。

---

## 一、字段分层体系

所有对象都必须按照以下等级来标注字段：

| 等级 | 含义 | 访问范围 | CLI 可见 | 日志可见 | AI 可见 |
|------|------|---------|---------|---------|--------|
| **public** | 公开信息 | 无限制 | ✅ | ✅ | ✅ |
| **internal** | 系统内部 | 仅系统内 | ❌ | ✅ | ❌ |
| **private** | 链路内 | 执行链路 | ❌ | ❌ | ❌ |
| **secret** | 最小化范围 | 仅必要位置 | ❌ | ❌ | ❌ |

### 1.1 四个等级的定义

#### PUBLIC（公开字段）
```javascript
{
  // 可以安全暴露给任何人，包括 CLI、日志、AI
  address: "0x1234567890abcdef",
  balance: "1000000000000000000",
  tokenName: "USDC",
  chainId: 1,
  decimals: 6
}
```

**允许**：
- ✅ CLI 显示
- ✅ 日志记录
- ✅ AI 处理
- ✅ 数据库存储

---

#### INTERNAL（系统内部字段）
```javascript
{
  // 系统内部使用，但不对外暴露
  _cacheKey: "btc:token:usdc:1h",
  _updateTime: 1682467200000,
  _provider: "coingecko",
  _requestId: "uuid-12345"
}
```

**允许**：
- ✅ 内部模块间传递
- ✅ 日志摘要（重要的内部状态）
- ✅ 性能监控
- ❌ CLI 显示
- ❌ AI 访问

**示例**：
```javascript
// 日志中可以记录内部字段用于调试
console.log("Cache hit:", {
  _cacheKey: data._cacheKey,
  age: Date.now() - data._updateTime
});

// 但输出给用户时必须过滤
const safeData = sanitizeForPanel(data); // _cacheKey 不会出现
```

---

#### PRIVATE（链路内部字段）
```javascript
{
  // 仅在执行链路内部可见，不可记录到一般日志
  _contractBytecode: "0x60806040...",
  _derivationPath: "m/44'/60'/0'/0",
  _nonceValue: 42,
  _gasEstimate: 21000
}
```

**允许**：
- ✅ 执行链路内传递
- ✅ 结构化日志（带标记的内部日志，不是应用日志）
- ❌ 标准日志
- ❌ CLI 显示
- ❌ AI 访问
- ❌ 错误消息

**示例**：
```javascript
// ❌ 错误：私有字段不应出现在错误信息中
throw new Error(`Invalid bytecode: ${txData._contractBytecode}`);

// ✅ 正确：只显示字段存在，不显示值
throw new Error("Invalid contract bytecode provided");

// ✅ 正确：内部结构化日志可以记录
logger.debug("Transaction preparation", {
  hasContractBytecode: !!txData._contractBytecode,
  gasCost: txData._gasEstimate
});
```

---

#### SECRET（极度敏感字段）
```javascript
{
  // 最小化访问范围，绝不可记录、绝不可传递
  privateKey: "0xabc123def456ghi789...",
  mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  password: "user-password-hash",
  apiKey: "sk-......"
}
```

**允许**：
- ✅ 内存中进行加密操作
- ✅ 流程最后销毁
- ❌ 任何形式的日志
- ❌ 任何形式的传递（除非加密）
- ❌ CLI 显示
- ❌ 错误消息
- ❌ 持久化存储（除非加密）

**示例**：
```javascript
// ❌ 错误：不要将 secret 保存到变量并传递
const wallet = {
  address: "0x123...",
  privateKey: privKey  // 不要这样做
};

// ✅ 正确：立即使用，不保留
async function signTransaction(privKey, txData) {
  try {
    const signature = await ethers.Wallet
      .fromPrivateKey(privKey)
      .signTransaction(txData);
    return signature;
    // privKey 在函数返回时自动被 GC 释放
  } finally {
    // 明确清理（如果需要）
    privKey = null;
  }
}

// ❌ 错误：不要在错误消息中包含 secret
catch (err) {
  throw new Error(`Failed to sign: ${privKey} not valid`);
}

// ✅ 正确：只说失败，不说原因
catch (err) {
  throw new Error("Failed to sign transaction");
}
```

---

### 1.2 字段标注示例

```javascript
// 完整的标注示例
const wallet = {
  // PUBLIC
  address: "0x1234567890abcdef",
  chainId: 1,
  balance: "1000000000000000000",
  
  // INTERNAL
  _lastSync: 1682467200000,
  _syncProvider: "infura",
  
  // PRIVATE
  _derivationPath: "m/44'/60'/0'/0",
  
  // SECRET（不应该包含在此对象中！）
  // privateKey 应该单独存储和处理
};

// 返回对象类型定义
/** 
 * @typedef {object} WalletData
 * @property {string} address - PUBLIC: 钱包地址
 * @property {number} chainId - PUBLIC: 链 ID
 * @property {string} balance - PUBLIC: 余额
 * @property {number} _lastSync - INTERNAL: 上次同步时间
 * @property {string} _syncProvider - INTERNAL: 数据源
 * @property {string} _derivationPath - PRIVATE: 派生路径
 */
```

---

## 二、输出过滤规则

任何对外输出（CLI、UI、API、日志）都必须经过过滤，移除敏感字段。

### 2.1 Sanitization 函数

```javascript
/**
 * 为 CLI 面板过滤数据
 * 移除 internal, private, secret 字段
 */
export function sanitizeForPanel(data) {
  if (!data || typeof data !== "object") {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeForPanel);
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    // 跳过内部字段
    if (key.startsWith("_")) continue;
    
    // 跳过已知敏感字段
    if (["privateKey", "mnemonic", "password", "secret"].includes(key)) continue;
    
    // 递归处理嵌套对象
    if (value && typeof value === "object") {
      sanitized[key] = sanitizeForPanel(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * 为结构化日志过滤数据
 * 允许 internal 字段，移除 private, secret
 */
export function sanitizeForLog(data) {
  // 类似 sanitizeForPanel，但允许 _ 开头的字段
  // ... 实现
}

/**
 * 为 AI 处理过滤数据
 * 移除所有 internal, private, secret 字段
 */
export function sanitizeForAI(data) {
  // 与 sanitizeForPanel 相同
  return sanitizeForPanel(data);
}
```

### 2.2 使用示例

```javascript
// 从 API 返回数据
async function getUserAssets(userId) {
  const assets = await queryDatabase(userId);
  
  // ❌ 错误：直接返回可能包含敏感字段
  // return assets;
  
  // ✅ 正确：过滤后返回
  return sanitizeForPanel(assets);
}

// CLI 显示
function displayBalance(balance) {
  const safe = sanitizeForPanel(balance);
  console.log(safe);
}

// 日志记录
function logTransaction(tx) {
  // ❌ 不要这样记录
  // logger.info("Transaction", tx);
  
  // ✅ 正确方式
  logger.info("Transaction", {
    txHash: tx.txHash,
    from: tx.from,
    to: tx.to,
    value: tx.value
    // 私有字段完全不出现
  });
}
```

---

## 三、字段隔离的测试

所有安全测试必须验证敏感字段不被泄露。

### 3.1 测试代码示例

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeForPanel, getWallet } from "./wallet.mjs";

describe("Security: Field Isolation", () => {
  describe("Sanitization", () => {
    it("should not include privateKey in panel output", async () => {
      const wallet = await getWallet(userId);
      const safe = sanitizeForPanel(wallet);
      
      // 检查序列化后的字符串中不包含敏感信息
      const jsonStr = JSON.stringify(safe);
      assert(!jsonStr.includes(wallet.privateKey));
      
      // 检查不存在 _derivationPath
      assert(!safe._derivationPath);
    });
    
    it("should not include secret fields in any output", async () => {
      const data = {
        address: "0x123...",
        privateKey: "0xsecret...",
        mnemonic: "word word...",
      };
      
      const safe = sanitizeForPanel(data);
      
      assert(!("privateKey" in safe));
      assert(!("mnemonic" in safe));
      assert(safe.address); // public 字段保留
    });
    
    it("should handle nested objects", async () => {
      const data = {
        user: {
          name: "Alice",
          wallet: {
            address: "0x123...",
            privateKey: "0xsecret..."
          }
        }
      };
      
      const safe = sanitizeForPanel(data);
      
      assert(safe.user.name); // 公开字段保留
      assert(safe.user.wallet.address); // 公开字段保留
      assert(!("privateKey" in safe.user.wallet)); // 敏感字段移除
    });
  });
  
  describe("Error Messages", () => {
    it("should not leak privateKey in error messages", async () => {
      try {
        await signWithPrivateKey("0xsecret...");
      } catch (err) {
        assert(!err.message.includes("0xsecret"));
      }
    });
  });
  
  describe("Logging", () => {
    it("should not log sensitive fields", async () => {
      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => logs.push(args);
      
      try {
        const tx = { txHash: "0xabc", privateKey: "0xsecret" };
        logTransaction(tx);
        
        const logContent = JSON.stringify(logs);
        assert(!logContent.includes("0xsecret"));
      } finally {
        console.log = originalLog;
      }
    });
  });
});
```

### 3.2 测试检查清单

- [ ] privateKey 不出现在任何输出
- [ ] mnemonic 不出现在任何输出
- [ ] password 不出现在错误消息
- [ ] secret 字段完全不暴露
- [ ] API 返回值经过了过滤
- [ ] 错误消息不包含敏感信息

---

## 四、处理敏感数据的最佳实践

### 4.1 私钥管理

```javascript
// ❌ 错误做法
const privateKey = "0xabc...";
const wallet = {
  address: "0x123...",
  privateKey: privateKey  // 保存在对象中，容易泄露
};

// ✅ 正确做法
class WalletManager {
  #privateKey; // 私有字段，使用 WeakMap 也可以
  
  constructor(privateKey) {
    this.#privateKey = privateKey;
    this.address = ethers.Wallet.fromPrivateKey(privateKey).address;
  }
  
  async sign(message) {
    return ethers.Wallet
      .fromPrivateKey(this.#privateKey)
      .signMessage(message);
    // this.#privateKey 不会被序列化或访问
  }
  
  // 明确销毁
  destroy() {
    this.#privateKey = null;
  }
}
```

### 4.2 密码处理

```javascript
// ❌ 错误
const user = {
  name: "Alice",
  password: "plaintext-password"  // 明文存储
};

// ✅ 正确
import bcrypt from "bcrypt";

const hashedPassword = await bcrypt.hash(password, 10);
const user = {
  name: "Alice",
  passwordHash: hashedPassword  // 仅存储哈希值
};

// 验证时
const match = await bcrypt.compare(inputPassword, user.passwordHash);
```

### 4.3 API 密钥管理

```javascript
// ❌ 错误
const config = {
  apiKey: "sk-12345...",  // 硬编码
  apiUrl: "https://..."
};

// ✅ 正确
import dotenv from "dotenv";

dotenv.config();
const apiKey = process.env.API_KEY; // 从环境变量读取
const config = {
  apiUrl: "https://..."
  // apiKey 不应该在代码中
};
```

### 4.4 内存清理

```javascript
// 对于特别敏感的数据，手动清理
async function processSensitiveData(secret) {
  try {
    const result = await crypto.subtle.sign("HMAC", secret, data);
    return result;
  } finally {
    // 明确清理
    if (typeof secret.set === "function") {
      // 如果是 Uint8Array
      secret.set(new Uint8Array(secret.length));
    } else if (typeof secret === "string") {
      // JavaScript 字符串无法真正清理，但可以置空
      secret = null;
    }
  }
}
```

---

## 五、审计和检查

### 5.1 代码审查清单

开发完成后，审查人员需要检查：

```
□ 所有输出是否都经过 sanitize?
□ 是否有 privateKey 出现在对象属性中?
□ 是否有 mnemonic 出现在日志中?
□ 错误消息是否包含敏感信息?
□ API 返回值是否过滤了敏感字段?
□ 是否有 console.log 直接输出用户数据?
□ 字段等级标注是否清晰?
□ 是否有安全测试覆盖?
```

### 5.2 自动化检查

```javascript
// src/security-checks.mjs
export function checkForSecretLeaks(obj, secretPatterns) {
  const json = JSON.stringify(obj);
  
  for (const pattern of secretPatterns) {
    if (pattern.test(json)) {
      throw new Error(`Potential secret leak detected: ${pattern}`);
    }
  }
}

// 在测试中使用
it("should not leak secrets", () => {
  const patterns = [
    /0x[a-f0-9]{64}/,  // 私钥模式
    /^[a-z\s]{12,24}$/, // 助记词模式
  ];
  
  const result = getWalletInfo();
  checkForSecretLeaks(result, patterns);
});
```

---

## 六、常见陷阱和解决方案

| 陷阱 | 原因 | 解决 |
|------|------|------|
| privateKey 在 JSON 中 | 直接序列化对象 | 使用 sanitize 函数 |
| 敏感信息在错误消息中 | 错误处理不当 | 不要在 message 中包含敏感数据 |
| 日志泄露 | 记录整个对象 | 只记录必要的公开字段 |
| 环境变量泄露 | 打印配置对象 | 不要序列化包含 secret 的配置 |
| CLI 显示敏感数据 | 忘记过滤 | 所有 CLI 输出都过 sanitize |

---

## 七、相关文档

- [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) - 开发流程
- [TESTING_STANDARDS.md](TESTING_STANDARDS.md) - 测试规范（包括安全测试）
- [CODING_STANDARDS.md](../DEV_STANDARDS.md) - 代码规范
