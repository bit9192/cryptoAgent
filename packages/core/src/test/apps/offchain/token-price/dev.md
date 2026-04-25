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
3. cli 暴露

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
9. Slice A 已补 batch 去重：同批次重复 query+network 复用结果，避免重复远端调用
10. Slice A 已补 debug 统计：可选返回 config/cache/remote/unresolved 命中计数
11. 已通过 assets.token-meta 暴露 token meta 到 task 层（含可选 debugStats）

下一步：

1. 若继续 Slice A，可补更细粒度性能基线（按 network 分组统计、缓存命中率）
2. 评估是否在 assets.query 中复用 token-meta stats 作为诊断输出
3. Slice A 稳定后，再进入 Slice B：token price 查询能力

## 10. 当前切片计划（进行中）

### Slice B-1：token price 最小闭环

本次只做：

1. 新增 `queryTokenPrice` / `queryTokenPriceBatch` 接口
2. 输入支持 `query/network/kind`（复用 token-meta 的 query 形态）
3. 查询链路：meta 解析 -> 价格缓存 -> 远端批量查询 -> 回写缓存
4. task 暴露 `assets.token-price`
5. 可选参数：`cacheMaxAgeMs`、`forceRemote`、`debugStats`

本次不做：

1. 多价格源权重融合
2. 复杂价格路由策略
3. 历史 K 线与波动率

验收标准：

1. happy-path：symbol/address 可返回 `priceUsd`
2. cache-path：缓存可命中；`forceRemote=true` 可跳过缓存
3. invalid-path：空 query 与未解析 token 降级 `unresolved`
4. task-path：`assets.token-price` 可从 action 调用并返回标准化输出

## 11. 当前切片计划（进行中）

### Slice B-2：token price 多源 fallback

本次只做：

1. 价格查询支持主源失败时自动切换次源
2. 次源仅补齐主源未返回的 token，避免重复覆盖
3. 维持现有输出结构（`ok/source/priceUsd`）不破坏 task 兼容性
4. 补 fallback-path 测试（主源失败、次源成功）

本次不做：

1. 多源加权平均
2. 历史 K 线与波动率
3. 风险联动评分

验收标准：

1. 单 token：主源异常时，次源可成功返回价格
2. batch：主源返回部分 token 时，次源仅补缺失 token
3. 旧测试不回归，新增 fallback 测试通过

## 12. 当前切片计划（进行中）

### Slice B-3：token price source 诊断统计

本次只做：

1. 在 `debugStats` 中输出价格源命中/失败统计
2. 支持多源场景下逐源统计（attempt/hit/error）
3. 不改变 `items` 主体结构，保持 task 兼容

本次不做：

1. 历史 K 线与波动率
2. 多源加权聚合
3. source 动态健康探针

验收标准：

1. 主源失败次源命中时，stats 中能看到 source 级错误与命中
2. 主源部分命中时，stats 中能看到次源补齐命中
3. 旧测试不回归

## 13. 当前切片计划（进行中）

### Slice B-4：Binance 批量报价优先

本次只做：

1. 新增 Binance 价格源适配器（支持一次性拉全量 ticker price）
2. 默认价格源顺序调整为 Binance -> CoinGecko -> DexScreener
3. 与现有 fallback/diagnostics 兼容，不改 task 输入

本次不做：

1. 历史 K 线与波动率
2. 多源加权融合
3. CEX 深度与成交量加权

验收标准：

1. BTC/ETH/BNB 等主流币可优先命中 Binance 价格
2. Binance 未命中或失败时可自动回退到次源
3. 旧测试不回归

## 14. 当前切片计划（进行中）

### Slice B-5：swap reserves 兜底

本次只做：

1. 复用现有 `swapV2` 合约 getter 和 pair reserves 计算逻辑
2. 为 BSC / EVM 地址型 token 增加链上流动性兜底
3. 保持价格源分层，不把 swap 计算散到 task / cli

本次不做：

1. 新协议报价逻辑
2. 多池加权与路径搜索
3. 1inch / 其他第三方 swap API 接入

验收标准：

1. Pancake / Uniswap V2 类型 pair 可按 reserves 计算出价格
2. 当 DexScreener 无 pair 时，swap reserve 兜底可补齐价格
3. 旧测试不回归

## 15. 当前切片计划（进行中）

### Slice M-1：token-meta 远端网络优先匹配

本次只做：

1. 修复 `forceRemote=true` 下 symbol 查询的跨网误匹配
2. DexScreener 远端候选按 `network` 优先筛选后再选最佳 pair
3. 保持现有 config/cache/remote 语义不变

本次不做：

1. token-meta 接入 CEX 多源
2. 远端多源加权与排序配置化
3. 任务参数结构变更

验收标准：

1. `arkm + network=eth + forceRemote=true` 可解析出 eth 地址
2. 未指定 network 时仍保持原有最佳 pair 行为
3. 旧测试不回归

## 15. 当前切片计划（进行中）

### Slice P-1：price 侧 symbol 精确匹配同步

本次只做：

1. DexScreener `getPrice` 增加 symbol/name 精确匹配优先
2. price pipeline 调 source 时透传 chain/network 上下文
3. 保持 Binance/CoinGecko 优先顺序不变

本次不做：

1. 价格源路由规则配置化
2. DEX 多池加权聚合
3. task 输入参数变更

验收标准：

1. 相似 symbol 干扰下，价格查询优先命中精确 symbol 资产
2. 指定 network 时，DexScreener 价格候选优先匹配对应链
3. 旧测试不回归

## 16. 当前切片计划（进行中）

### Slice M-2：token-meta 增加 CoinGecko 第二接口

本次只做：

1. token-meta 远端查询改为 CoinGecko + DexScreener 多源兜底
2. unresolved 候选列表支持跨 source 合并去重
3. 不改变 task 输入参数

本次不做：

1. 候选打分配置化
2. 新增第三方付费接口
3. 价格侧路由改动

验收标准：

1. `AAVE/UNI + network=eth` 在远端路径有更高命中稳定性
2. unresolved 时 candidates 可包含多源候选
3. 旧测试不回归

## 17. 当前切片计划（进行中）

### Slice P-2：BTC / BRC20 价格 ID 兜底

本次只做：

1. 修复 BTC / BRC20 symbol 在 CoinGecko 价格查询时的 id 不匹配问题
2. 保持现有价格源顺序不变，仅在 CoinGecko 源内部补 symbol/name 到 coin id 的兜底
3. 兼容现有 token meta 传入的 BTC 配置项，不改 task / cli 参数

本次不做：

1. 新增 BTC 专用第三方价格源
2. 批量 symbol 搜索结果打分配置化
3. SATS / RATS 等更多币种的额外路由策略

验收标准：

1. `ORDI + network=btc + forceRemote=true` 可返回价格
2. CoinGecko 已能直接命中的现有 EVM / BTC native 行为不回归
3. 旧测试不回归