# offchain/token-price 模块开发计划

目标：围绕 token 基础信息、风险、价格三类能力，按“先需求与样本、再计划、再实现、再验证”的流程完成开发；整个流程必须与 [packages/core/plan/development-workflow-rules.md](packages/core/plan/development-workflow-rules.md) 保持一致。

## 1. 需求范围

本模块当前需求：

1. token meta
- 根据 name/symbol 查 address
- 根据 address 查 name / symbol / decimals

2. token risk
- 根据 address 查询 token 风险

3. token price
- 支持批量查询价格
- 优先使用可批量请求的交易所或聚合接口
- 若是链上资产，优先走合并请求，减少接口调用次数

4. token config
- 维护本地默认 token 配置
- 后续支持“按地址查询本地配置 token 余额”的扩展能力

测试数据来源：

- 使用 [packages/core/src/test/apps/offchain/token-price/price-test-data.md](packages/core/src/test/apps/offchain/token-price/price-test-data.md) 中的 token 样本

## 2. 分层落位

严格按以下分层开发：

1. apps/offchain/sources
- 放置 token price provider / token risk provider 适配器
- 每个 provider 只做单源访问和标准化输出

2. modules/assets-engine 或 modules/token-engine（若后续拆分）
- 负责配置优先、缓存命中、批量去重、fallback、结果合并
- 不做 CLI 与 task 参数解析

3. tasks
- 只做输入校验、action 分发、调用 engine
- 不直接访问第三方 provider

4. cli
- 只做命令暴露和帮助信息

## 3. 统一开发流程

每次新增或修改本模块能力，必须按以下顺序执行：

1. 先补充或更新需求说明
- 明确本次只解决什么
- 明确本次不解决什么
- 明确输入、输出、边界、失败路径、缓存策略

2. 先准备测试数据
- 在本目录或相邻 testdata 文件中补 happy / invalid / edge / security 样本
- 未准备样本前，不进入实现阶段

3. 先写开发计划
- 把本次切片写入本文件“当前切片计划”
- 明确函数落点、测试文件、验收条件

4. 再开发实现
- 严禁边写边扩需求
- 严禁把核心逻辑散落到 task 与 cli

5. 最后测试验证
- 先跑本切片测试
- 再跑受影响模块测试
- 测试通过后再提交

6. 未满足门禁不得进入实现
- 若本文件未写明“本次只做 / 不做 / 样本文件 / 验收标准”，停止实现
- 若测试数据文件未补对应样本，停止实现
- 若用户尚未确认当前切片范围，停止扩大实现范围

## 4. 当前模块设计原则

1. 配置优先
- 默认 token 信息优先从各链配置读取

2. 本地缓存第二
- 配置未命中时，优先读本地历史缓存

3. 远端查询兜底
- 本地仍无结果时，才访问 RPC 或第三方 API

4. 查询后必须回填缓存
- 新获取的 metadata / price / risk 需带来源与时间戳回写

5. 批量优先
- 多 token 输入先去重，再批量请求
- 禁止逐条串行调用可批量接口

6. 输出统一
- 无论来源是配置、缓存、RPC、第三方 API，输出字段必须标准化

## 5. 当前切片计划

### Slice A：token meta 查询能力

目标：先完成 token metadata 的统一查询入口。

本次做：

1. address -> name/symbol/decimals
2. symbol/name/key -> address
3. 配置 -> 本地缓存 -> RPC 的三级查询策略
4. 批量输入去重与合并

本次不做：

1. 价格查询
2. 风险查询
3. 复杂模糊搜索排序

测试要求：

1. happy-path：配置命中
2. happy-path：缓存命中
3. happy-path：RPC 命中并回写缓存
4. invalid-path：非法地址 / 空 key
5. edge-case：混合多链 token 输入

### Slice B：token price 查询能力

目标：统一价格查询入口，并优先利用批量接口。

本次做：

1. 单 token / 多 token 价格查询
2. provider 标准化输出
3. 批量接口优先、单条接口兜底
4. 本地缓存与 TTL

本次不做：

1. 多交易所价格加权
2. 高级报价路由策略

测试要求：

1. happy-path：批量接口正常返回
2. fallback-path：主源失败后次源成功
3. edge-case：部分 token 无价格
4. invalid-path：非法 token 输入

### Slice C：token risk 查询能力

目标：统一 token 风险查询与风险等级映射。

本次做：

1. address -> risk 查询
2. provider 风险字段标准化
3. riskLevel / riskScore 统一输出
4. 本地缓存与 TTL

本次不做：

1. 风险来源加权融合
2. 风险告警订阅

测试要求：

1. happy-path：正常返回 low/medium/high
2. fallback-path：主源失败次源成功
3. edge-case：来源缺字段时降级为 unknown
4. security-case：错误与日志不泄露敏感 token 配置

## 6. 提交前检查

1. 本次切片已写入本文件
2. 本次测试数据已准备
3. 本次只解决项 / 不解决项已明确
4. 对应测试文件已新增或更新
5. 已执行切片测试与受影响测试
6. review 回复中必须包含：
- 本次变更函数列表
- 对应测试列表
- 未完成项与风险点

## 7. Slice A 接口草案

目标：先只落地 token meta 最小闭环，不混入价格与风险。

建议最小接口：

1. apps/offchain/token-price/index.mjs
- `queryTokenMeta(input, options?)`
- `queryTokenMetaBatch(items, options?)`

输入草案：

```js
{
	query: "usdt" | "0x..." | "TR..." | "bc1..." ,
	network: "eth" | "bsc" | "mainnet" | "nile" | ...,
	kind: "auto" | "address" | "symbol" | "name"
}
```

输出草案：

```js
{
	ok: true,
	item: {
		chain: "evm" | "btc" | "trx" | null,
		network: "bsc" | "eth" | "mainnet" | "nile" | null,
		query: "原始输入",
		queryKind: "address" | "symbol" | "name",
		tokenAddress: "0x..." | "TR..." | "ordi" | null,
		symbol: "USDT" | null,
		name: "Tether USD" | null,
		decimals: 18 | 6 | null,
		source: "config" | "cache" | "remote" | "unresolved",
	}
}
```

查询顺序：

1. 配置优先
2. 本地缓存第二
3. 远端查询兜底
4. 远端成功后回写缓存

本阶段只要求：

1. address -> meta
2. key/symbol -> address + meta
3. batch 去重
4. mixed chain 输入可返回标准化结果

本阶段不要求：

1. 名称模糊匹配排序
2. 多远端源加权
3. task / cli 暴露

## 8. Slice A 测试文件草案

建议测试文件：

- `packages/core/src/test/apps/offchain/token-price/token-meta.test.mjs`

最小测试集合：

1. 配置命中 address -> meta
2. 配置命中 symbol -> address
3. 缓存命中 address -> meta
4. 远端命中并回写缓存
5. mixed chain batch 查询
6. 非法 query / 空 query

## 9. 当前进度 / 下一步

当前进度：

1. assets.query 侧已具备 token metadata 配置优先 + 本地缓存策略
2. Slice A 测试样本已结构化到 price-test-data.md
3. Slice A 接口草案与测试草案已写入本文件
4. 已实现最小 `queryTokenMeta/queryTokenMetaBatch` 闭环，覆盖配置命中、缓存命中、远端回写缓存、mixed chain batch
5. 默认远端兜底已接入 DexScreener source，不再依赖外部临时注入 remoteResolver
6. invalid-path 已补：空 query、非法地址样式输入
7. Slice A 已补缓存 TTL 行为：过期缓存跳过，重新走远端并回填
8. security-case 已补：远端异常不冒泡敏感内容，统一降级 unresolved

下一步：

1. 讨论是否需要将 token meta 暴露到 task 层
2. 若继续 Slice A，可补批量输入去重与性能回归测试
3. Slice A 稳定后，再进入 Slice B：token price 查询能力