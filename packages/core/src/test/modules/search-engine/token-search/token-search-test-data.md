# token-search TS-1 测试样本清单

目标：覆盖 token-search 最小闭环的 happy / edge / invalid / security 四类样本。

## 1. happy-path

1. 跨链候选聚合
- 输入：`query=ordi`，btc 与 evm provider 都返回候选
- 期望：返回两个候选，包含 `chain/network/source/confidence`

2. sourceStats 汇总
- 输入：两个 provider 都成功
- 期望：`total=2, success=2, failed=0`

## 2. edge-case

1. 重复候选去重
- 输入：同链同地址由两个 provider 重复返回
- 期望：只保留 1 条候选

2. limit 限制
- 输入：3 条候选，`limit=1`
- 期望：仅返回 1 条

## 3. invalid-case

1. query 为空
- 输入：`query="   "`
- 期望：抛 `TypeError`

2. provider 非法
- 输入：`providers=[{ id: "x" }]`
- 期望：抛 `TypeError`

## 4. security-case

1. provider 抛敏感错误不透出
- 输入：provider 抛错 `PRIVATE_KEY_PLACEHOLDER`
- 期望：结果只体现失败计数，不包含原始错误文本

2. sourceStats 不泄露候选原文
- 输入：正常候选
- 期望：`sourceStats` 仅包含统计字段
