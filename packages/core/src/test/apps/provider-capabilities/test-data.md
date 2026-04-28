# provider-capabilities 测试样本

## S-PC-1: provider addressTypes 能力声明

### Happy Path

- H1: BTC provider 返回 4 种地址类型
- H2: TRX provider 返回默认类型 `default`
- H3: EVM provider 返回默认类型 `default`

### Edge Cases

- E1: 返回值为数组且元素唯一
- E2: 多次调用返回稳定一致

### Invalid Cases

- I1: 未定义 getAddressTypes 时应测试失败
- I2: 返回非数组时应测试失败
