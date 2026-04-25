# modules/search-engine/trade-search 开发计划

目标：建立交易搜索能力，支持按 tx hash、交易对、路由信息检索。

## 1. 需求范围

1. 单链交易检索
2. 交易元信息标准化
3. 跨链结果并行聚合（后续）

## 2. 当前切片计划

### Slice TRS-1：trade-search 协议与样本

本次只做：

1. 定义 trade-search 输入输出协议
2. 定义交易类型字段与最小状态集
3. 准备四类测试样本

本次不做：

1. 多链并行实现
2. 交易追踪图谱
3. 路由模拟

验收标准：

1. 协议可用于后续 provider 对接
2. 样本覆盖 happy/edge/invalid/security

## 3. 当前进度 / 下一步

当前进度：

1. 已完成 TRS-1：trade-search 协议样本
2. 已完成 TS-5：trade domain mock provider 协议回归测试

下一步：

1. TRS-2：接入首个真实链 provider（evm）
2. TRS-3：任务层接入与命令验证
