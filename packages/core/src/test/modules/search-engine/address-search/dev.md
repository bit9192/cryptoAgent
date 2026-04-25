# modules/search-engine/address-search 开发计划

目标：实现地址搜索能力，聚合地址资产、交互概览与跨链摘要。

## 1. 需求范围

1. 地址归属链识别
2. 地址资产快照聚合
3. 地址行为摘要输出

## 2. 当前切片计划

### Slice AS-1：address-search 最小闭环

本次只做：

1. 定义 address-search 输入输出协议
2. 复用已有资产查询输出构建摘要
3. 提供基础 sourceStats

本次不做：

1. 地址关系图谱
2. 实时监控
3. 高级行为评分

验收标准：

1. 输入地址可返回统一摘要对象
2. 输出字段符合安全分层要求

## 3. 当前进度 / 下一步

当前进度：

1. 已完成 AS-1：address-search 协议样本
2. 已完成 TS-5：address domain mock provider 协议回归测试

下一步：

1. AS-2：接入首个真实链 provider（evm/trx）
2. AS-3：地址摘要字段与安全过滤联调
