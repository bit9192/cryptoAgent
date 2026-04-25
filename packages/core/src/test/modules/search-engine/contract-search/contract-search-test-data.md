# contract-search TS-5 测试样本清单

目标：覆盖 contract-search 协议接入（mock provider）的 happy / edge / invalid / security 四类样本。

## 1. happy-path

1. 合约地址查询命中
- 输入：domain=contract, query=0x...
- 期望：返回 item，包含 title/name/address 与 extra.riskLevel

2. 标签信息透传
- 输入：provider 返回 tags
- 期望：输出 tags 数组

## 2. edge-case

1. 多链候选排序
- 输入：evm 与 trx 候选同名
- 期望：按链优先策略排序

2. limit 生效
- 输入：limit=1
- 期望：仅返回 1 条

## 3. invalid-case

1. query 为空
- 输入：query="   "
- 期望：抛 TypeError

2. 不匹配 provider
- 输入：network 不匹配
- 期望：items 为空

## 4. security-case

1. provider 故障降级
- 输入：provider 抛错
- 期望：failed 计数增加，search 正常返回

2. stats 不泄露候选原文
- 输入：正常候选
- 期望：sourceStats 仅统计字段
