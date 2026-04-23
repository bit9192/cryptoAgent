# BIP-39 Passphrase 支持 - 工作流说明

## 问题反馈回复

### 1. ✅ 名称格式兼容性
**状态：正常**

名称可以使用任何格式，包括：
- `t43-ooo` - 数字+连字符+字母 ✓
- `ik-ppp` - 字母+连字符+字母 ✓
- `wallet-main1` - 英文+连字符+数字 ✓
- 任何自定义格式都支持

### 2. ✅ Passphrase 导入和存储
**状态：正常工作**

Passphrase 的生命周期：

```
导入流程：
密钥文件 (.md)
  ↓
解析 (parse.mjs) - 从密钥下一行提取 passphrase
  ↓
keyCatalog 中存储 - passphrase 保存在内存中
  ↓
解锁 / 派生 - 读取 keyCatalog 中的 passphrase
  ↓
用 HDNodeWallet.fromPhrase(mnemonic, passphrase) 派生正确的账户
```

**重要**：
- Passphrase 保存在内存 (keyCatalog) 中
- 不会持久化到磁盘（除非手动再次导出）
- 每次重启应用后需要重新导入

### 3. ✅ 解密失败排查
**状态：正常的错误提示**

错误信息 `解密失败：密码错误或密文损坏` 出现原因：
- 使用了**错误的文件密码**（不是 passphrase）
- 或文件本身被损坏

**注意区分**：
- **文件密码** - 加密 .enc.json 文件的密码（在导入时输入）
- **Passphrase** - 在 .md 文件中配置，在密钥下方一行

**例子**：
```markdown
# 密钥名称
my-wallet
abandon abandon abandon... (12-24个BIP39单词)
my-secret-password123

# ↑ "my-secret-password123" 是 BIP-39 Passphrase
# 加密文件时需要另外的密码，例如 "file-password-456"
```

## testdata.md 中的数据验证

已验证：
```
场景1: t43-ooo (带连字符名称) + jjs1234555 (passphrase) → ✓
场景2: ik-ppp (带连字符名称) + aa1234561234 (数字passphrase) → ✓
场景3-6: 各种格式 → ✓
```

所有测试通过，导入、解锁、派生都正常工作。

## 完整工作流

```bash
# 1. 准备密钥文件 (storage/key/mykeys.md)
wallet-with-pass
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
secret123

wallet-no-pass
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
(空行或下一个密钥)

# 2. 加密文件
encryptPathToFile({
  inputPath: 'storage/key/mykeys.md',
  password: 'file-encryption-password',  // 加文件的password
  outputFile: 'storage/key/mykeys.enc.json'
})

# 3. 导入到钱包
wallet.loadKeyFile({
  password: 'file-encryption-password'   // 用相同password解密文件
})

# 4. 解锁密钥
wallet.unlock({
  keyId: '...',
  password: 'file-encryption-password'
})

# 5. 派生账户（passphrase 自动使用）
wallet.getSigner({
  keyId: '...',
  chain: 'evm'
})

# 结果：
# - wallet-with-pass 使用 secret123 作为 passphrase → 地址A
# - wallet-no-pass 不使用 passphrase → 地址B（不同！）
```

## 总结

| 问题 | 状态 | 说明 |
|------|------|------|
| 名称格式兼容 | ✅ | 支持任何格式，包括连字符 |
| Passphrase 导入 | ✅ | 正确提取和使用，产生不同的账户地址 |
| 加密文件密码错误 | ✅ 正常 | 这是预期的错误提示 |
