# Wallet Dev Keys 使用指南

## 概述

Wallet 现在支持 **Dev Keys** —— 预定义的开发/测试用密钥，**无需密码即可使用**。

## 快速开始

### 1. 加载所有 Dev Keys

```javascript
const wallet = createWallet();

// 加载所有预定义的 dev keys
const result = await wallet.loadDevKeys();
console.log(`已加载 ${result.loaded} 个 dev keys`);
```

### 2. 选择性加载特定 Dev Keys

```javascript
// 只加载 hardhat-default 和 hardhat-account-0
await wallet.loadDevKeys({
  names: ['hardhat-default', 'hardhat-account-0'],
  tags: ['selected']
});
```

### 3. 无密码解锁 Dev Key

```javascript
// Dev keys 不需要密码！
const unlockResult = await wallet.unlock({
  keyId: 'xxx',  // dev key 的 ID
  ttlMs: 30 * 60 * 1000,  // 30 分钟过期
});

console.log('已解锁:', unlockResult.unlockedAt);
```

## 预定义的 Dev Keys

| 名称 | 类型 | 用途 | 标签 |
|------|------|------|------|
| `hardhat-default` | mnemonic | Hardhat 默认助记词 | hardhat, test |
| `hardhat-account-0` | privateKey | Hardhat 账户 0 的私钥 | hardhat, test, account-0 |
| `hardhat-account-1` | privateKey | Hardhat 账户 1 的私钥 | hardhat, test, account-1 |

## API 参考

### loadDevKeys(options?)

加载预定义的开发用密钥。

**参数：**
```javascript
{
  names?: string | string[],    // 指定要加载的 key 名称（可选）
  tags?: string | string[],     // 附加标签到所有加载的 keys
  reload?: boolean              // 是否重新加载已存在的 keys（默认 false）
}
```

**返回：**
```javascript
{
  ok: true,
  loaded: 3,                           // 加载的个数
  addedKeyIds: ['xxx', 'yyy'],         // 新增的 key IDs
  skippedKeyIds: ['zzz'],              // 跳过的 key IDs（已存在）
  source: 'dev'
}
```

### unlock(input)

解锁密钥（dev keys 无需密码）。

**重要：dev keys 与 file keys 的区别**

```javascript
// ❌ File keys 需要密码
await wallet.unlock({
  keyId: 'encrypted-key-id',
  password: 'wallet-pass-123'  // 必需！
});

// ✅ Dev keys 无需密码
await wallet.unlock({
  keyId: 'dev-key-id',
  // 不需要 password 参数
  ttlMs: 30 * 60 * 1000
});
```

## 隔离机制

Dev keys 通过 `source` 字段标识，方便过滤：

```javascript
// 获取所有 dev keys
const devKeys = await wallet.listKeys();
const devOnly = devKeys.items.filter(item => item.source === 'dev');

// 获取所有 file keys（加密）
const fileOnly = devKeys.items.filter(item => item.source !== 'dev');
```

## 最佳实践

### ✅ 推荐用途
- 本地开发环境
- 单元测试、集成测试
- 演示和原型开发
- Hardhat/Truffle 等本地框架

### ❌ 禁止用于
- ~~生产环境~~
- ~~真实资金操作~~
- ~~主网交易~~

### 安全建议

1. **隔离环境** - 确保 dev key 仅在开发环境加载
2. **明确标记** - 通过 tags 区分 dev/prod keys
3. **过期时间** - 使用 `ttlMs` 设置合理的过期时间
4. **审计日志** - 记录所有 unlock 操作（特别是 reason）

```javascript
await wallet.unlock({
  keyId: devKeyId,
  reason: 'Unit test: transfer_001',  // 记录意图
  ttlMs: 5 * 60 * 1000  // 5 分钟自动过期
});
```

## 扩展 Dev Keys

需要添加更多开发用密钥？编辑 [wallet/index.mjs](../index.mjs) 中的 `DEV_KEYS` 数组：

```javascript
const DEV_KEYS = [
  // 现有的 3 个 keys...
  
  // 添加新的 dev key
  {
    name: 'my-dev-key',
    secret: '0x...',  // 或助记词
    type: 'privateKey',  // 或 'mnemonic'
    tags: ['custom', 'test'],
  },
];
```

## 对比 Legacy

| 功能 | Legacy | New Wallet |
|------|--------|-----------|
| Dev key 支持 | ❌ 不支持 | ✅ 原生支持 |
| 无密码解锁 | ❌ 需要密码 | ✅ Dev keys 无需 |
| 来源标记 | ❌ 无区分 | ✅ source 字段 |
| 选择性加载 | ❌ 全部加载 | ✅ 按名称加载 |
| Tag 管理 | ❌ 无 | ✅ 灵活 tagging |

## 测试

运行 dev keys 功能测试：

```bash
cd packages/core
node --test src/test/wallet/core.test.mjs
```

查看演示示例：

```bash
node src/test/wallet/dev-keys-example.js
```
