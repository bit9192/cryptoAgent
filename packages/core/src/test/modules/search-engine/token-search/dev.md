# modules/search-engine/token-search 开发计划

目标：实现 token 搜索最小闭环，支持跨链候选汇总（如 ordi -> btc + evm）。

## 1. 需求范围

1. symbol/name/address 查询候选
2. 候选标准化输出
3. 跨链去重与基础排序

## 2. 当前切片计划

### Slice TS-1：token-search 最小闭环

本次只做：

1. 定义 token-search 输入输出协议
2. 接入 btc + evm 两条 provider 结果聚合
3. 输出 candidates + sourceStats

本次不做：

1. trade/contract/address 融合搜索
2. 权重配置化
3. 历史趋势与图谱

验收标准：

1. 查询 ordi 时可返回跨链候选
2. 候选包含 chain/network/source/confidence
3. 旧资产查询能力不回归

## 3. 当前进度 / 下一步

当前进度：

1. 已完成 TS-1：token-search 最小闭环实现
2. 已补充 token-search 四类测试样本
3. 已新增并通过 TS-1 单测（聚合/去重/limit/安全）

下一步：

1. TS-2：接入 request-engine 做 queryShared 去重缓存
2. TS-3：扩展到 trx provider 并补多链排序策略
