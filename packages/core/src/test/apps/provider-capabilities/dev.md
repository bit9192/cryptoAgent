# provider-capabilities 模块开发计划

## 新增切片：S-PC-1 provider addressTypes 能力声明

### 背景

pickWallet 需要按链知道可用 addressTypes。应由各链 provider 自身声明能力，而不是调用方硬编码。

### 本次目标（只做一个切片）

1. BTC provider 增加 `getAddressTypes()`
2. TRX provider 增加 `getAddressTypes()`
3. EVM provider 增加 `getAddressTypes()`
4. 新增测试验证三个 provider 返回值稳定

### 验收标准

1. 三个 provider 实例都存在 `getAddressTypes` 方法
2. BTC 返回包含 `p2pkh/p2sh-p2wpkh/p2wpkh/p2tr`
3. TRX/EVM 返回默认类型列表（`default`）
4. 不影响现有 getAddress/sign* 能力与测试
