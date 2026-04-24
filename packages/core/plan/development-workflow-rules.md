# 模块开发流程规范

目标：所有模块开发统一遵循“先讨论方案，再准备测试数据，再开发，再测试”的闭环流程。

## 适用范围

- packages/core/src/modules
- packages/core/src/apps
- packages/core/src/execute
- packages/core/src/tasks
- packages/core/src/cli

## 统一流程（必须按顺序）

1. 方案讨论
- 明确输入、输出、边界、失败路径、回滚策略。
- 明确是否涉及敏感字段与权限分层。
- 形成简要设计结论并记录到 plan 文档。

2. 测试数据准备
- 在 src/test 对应分层目录准备测试数据与基线样本。
- 先定义成功样本，再定义失败样本与边界样本。
- 样本中不得包含真实私钥、助记词、密码等敏感信息。

3. 开发实现
- 严格按讨论方案实现，不临场扩散需求。
- 新增能力优先模块化，避免逻辑散落在 task 与 cli。
- 代码中涉及输出的对象必须经过安全筛选。

4. 测试验证
- 先跑新增测试，再跑受影响模块测试。
- 覆盖成功、失败、边界、权限四类场景。
- 测试通过后再进入合并流程。

## 必备测试样本类型

每个模块至少准备以下样本：

- happy-path：标准输入，产出标准输出。
- edge-case：空值、超大值、极小值、缺字段。
- invalid-case：类型错误、非法字段、非法状态。
- security-case：包含 private 或 secret 字段的输入。

## 敏感字段安全规则

统一字段级别：

- public：允许 AI 与 UI 读取。
- internal：仅系统内部与日志摘要可读。
- private：仅执行链路内部可读，不可出现在 AI 或 UI 输出。
- secret：仅最小范围运行时可读，不可记录到日志、trace、快照。

执行要求：

1. 所有对外输出必须经过字段过滤。
2. 测试中必须包含 private 和 secret 字段泄露检查。
3. 生命周期事件与错误信息不得回传 secret 原值。

## Definition of Done

满足以下条件才算完成：

1. plan 中已有本模块方案记录。
2. src/test 对应目录已有测试数据与用例。
3. 功能测试与回归测试通过。
4. 输出对象通过安全分层检查。
5. 文档更新完成（如涉及接口或规则变化）。

## 快速检查清单

- 方案讨论已完成并记录
- 测试数据已准备
- 开发实现已完成
- 测试已通过
- 安全字段检查已通过
- 文档已更新

## Task 开发规范（固定流程）

目标：统一 task 的定义、动作分发、CLI 暴露和测试方式，避免“同类任务不同写法”。

### 1. 任务定义层

1. 所有 task 必须使用 defineTask 定义，禁止手写松散对象。
2. 必填字段：id、title、run。
3. 建议字段：description、sourcePolicy、tags、inputSchema、operations。
4. inputSchema 仅描述 task 入口公共参数；动作级参数放到每个 action 的 argsSchema。
5. id 采用 domain:scope 格式（例如 wallet:session）。

### 2. 动作分发层

1. 多动作 task 必须使用 buildActionDispatcher，禁止在 run 中堆叠 if/else 分支。
2. 每个 action 必须包含以下元信息：
	- action：完整动作名（例如 wallet.unlock）
	- sub：CLI 子命令（例如 unlock）
	- usage：帮助文案中的命令示例
	- description：一句话描述
	- argsSchema：该 action 的参数约束
	- handler：唯一执行入口
3. run(ctx) 仅做三件事：读取 input、提取 action、调用 dispatcher.dispatch。
4. 对外导出 actionList/operationList，供 help 和工具发现。

### 3. CLI 暴露层

1. 面向用户的固定流程命令，优先走 wallet <sub> 形式。
2. 若该子命令为固定流程，不接收参数；多余参数要显式提示“已忽略”。
3. task <taskId> <sub> 应支持自动映射为 --action，保证手输体验一致。
4. task -h <taskId> 必须能展示 operations 与 action 级参数说明。

### 4. 会话与状态规则

1. clear 类动作必须清理“任务缓存 + 底层会话状态”。
2. 对 wallet 场景，clear 必须同时执行：
	- clearSession(default)
	- wallet.lockAll()（若钱包实例提供该能力）
3. status 动作必须是只读快照，不允许产生写入副作用。

### 5. 派生与容错规则（wallet 类 task）

1. 派生前必须确保 providers 就绪（btc/evm/trx 自动注册）。
2. 若配置 path，按 path 优先，不因 type/path 不匹配中断；输出 warning 即可。
3. 当 path=* 时，按 chain/type 自动解析默认路径。
4. 严重错误（provider 缺失、签名器失败）按 strict 策略处理；可恢复问题进入 warnings。

### 6. 测试最小集合（每个 task 至少覆盖）

1. happy-path：核心动作成功。
2. invalid-path：参数缺失或类型错误。
3. state-path：clear 后状态确实归零，且不被底层残留会话污染。
4. workflow-path：典型顺序调用（例如 unlock -> derive -> status）。
5. regression-path：针对历史 bug 的回归用例（例如 clear 后旧 key 残留）。

### 7. 变更落地清单（提交前自检）

1. operations 与 actionObject 一致，无漏项。
2. CLI help 文案和真实行为一致。
3. 新增动作已在测试中覆盖。
4. warnings 与 errors 分层清晰，不泄露敏感信息。
5. 对外输出对象字段已过安全筛选。
6. assets 目录不存在“仅 re-export 占位文件”。

建议执行的门禁检查（提交前）：

- `rg '^export \{[^}]+\} from "\.\./' packages/core/src/apps/*/assets`
- 若命中结果非空，默认视为不符合落位规范（除非评审中明确豁免与截止迁移时间）。

## 资产查询能力落位规则（ideal 需求适用）

目标：将“链能力、聚合逻辑、筛选逻辑、任务编排”分层放置，避免功能散落。

### 1. apps 层（链原子能力）

1. 放置位置：
	- packages/core/src/apps/evm/assets/
	- packages/core/src/apps/btc/assets/
	- packages/core/src/apps/trx/assets/
2. assets 目录文件必须包含真实实现，禁止仅用 re-export 占位：
	- 禁止写法：`export { fn } from "../xxx.mjs"`
	- 兼容层允许放在旧路径文件（如 `apps/btc/core.mjs`），但主实现必须在 assets 目录。
3. 仅放链相关原子查询：
	- token 元信息（name/symbol/decimals）
	- address/token 余额
	- 链内批量查询（如 evm multicall）
4. 禁止在 apps 层写跨链聚合、排序、筛选。

### 2. offchain 层（外部数据源）

1. 放置位置：packages/core/src/apps/offchain/sources/
2. 放价格与安全性来源适配：
	- token price provider
	- token risk provider
3. 统一输出标准化结构，供 modules 层消费。

### 3. modules/assets-engine 层（跨链资产聚合与筛选）

1. 放置位置：packages/core/src/modules/assets-engine/
2. 负责：
	- 标准资产快照聚合（balance + price => value）
	- 排名与筛选（top holders, token exposure 等）
	- 面向 AI 的简化查询参数映射
3. 禁止直接操作 CLI 交互和 task 参数解析。

补充说明：

1. packages/core/src/modules/data-engine/ 保持为通用数据工具与规则能力，不承载跨链业务编排。
2. 资产类“跨链聚合/估值/筛选”默认放入 assets-engine，避免 data-engine 语义膨胀。
3. 若未来出现非资产类跨链聚合，再按领域新增独立 engine，不回填到 data-engine。

### 4. tasks 层（业务编排入口）

1. 放置位置：packages/core/src/tasks/assets/
2. 负责：
	- 输入参数校验
	- 调用 apps + offchain + modules/assets-engine 组合执行
	- 返回可审计、可展示的结果
3. task 不承载复杂业务细节实现，只做编排。

### 5. cli 层（命令暴露）

1. 只暴露固定子命令和帮助信息。
2. 不写核心资产计算逻辑。

## 微步开发与可审阅规则（新增）

目标：开发过程细粒度可 review，降低一次性大改风险。

### 1. 切片原则

1. 一个迭代只做一个最小能力切片（例如“仅实现 evm token metadata 批量查询”）。
2. 每个切片优先新增小函数，单函数尽量保持单职责。
3. 单次提交应可独立运行并可验证。

### 2. 先测后并（小函数级）

1. 新增或改动函数时，同步补对应单测或最小回归测。
2. 测试命名需能反映函数行为与边界。
3. 若函数尚未稳定，至少补一条失败样本测试防回归。

### 3. 提交与 review 粒度

1. 推荐顺序：
	- 第 1 提交：接口/类型与测试样本
	- 第 2 提交：函数实现
	- 第 3 提交：task 编排与 CLI 暴露
2. 每次提交须附“本次只解决什么，不解决什么”。
3. 若一次改动超过 300 行核心逻辑，需拆分为多提交。

### 4. 运行门禁

1. 每完成一个切片就运行该切片测试。
2. 每完成一个模块后运行受影响模块测试。
3. 合并前至少执行一次关键流程端到端验证。

### 5. 输出要求

1. 每次开发更新需同步更新 plan 的“当前进度/下一步”。
2. review 回复中必须给出：
	- 本次变更函数列表
	- 对应测试列表
	- 未完成项与风险点

## 本阶段微步开发步骤（资产查询第一阶段）

目标：先打通“单链查询 -> 跨源聚合 -> task 输出”的最小闭环，保证每一步都可独立 review 与回归。

### Step 0：接口草案与样本先行

1. 定义统一资产快照字段（token metadata、balance、price、value）。
2. 在 src/test 准备 happy/invalid/edge 三类样本。
3. 产出“本步不做项”：暂不做多链并发优化、暂不做复杂筛选 DSL。

验收：接口文档 + 测试样本可审阅，无业务实现代码。

### Step 1：EVM token metadata 最小切片

1. 新增 apps/evm/assets/token-metadata.mjs。
2. 仅实现单 token 与小批量 metadata 查询。
3. 补充对应单测（成功 + 非法 token 地址）。

验收：metadata 查询可独立运行，单测通过。

### Step 2：EVM balance 批量切片

1. 新增 apps/evm/assets/balance-batch.mjs。
2. 先实现基础批量余额查询，再接入 multicall 合并请求。
3. 补充单测（单地址、多地址、空 token 列表）。

验收：balance 批量查询稳定，测试覆盖基础边界。

### Step 3：offchain 价格与风险适配切片

1. 新增 offchain price provider 适配（统一输出字段）。
2. 新增 offchain risk provider 适配（统一风险标签）。
3. 补充适配器单测（正常返回、缺字段、来源异常降级）。

验收：offchain 输出可被上游直接消费，异常可降级不崩。

### Step 4：modules/assets-engine 聚合切片

1. 新增 modules/assets-engine/snapshot-aggregate.mjs。
2. 聚合规则：balance + price => value，附带 risk 摘要。
3. 补充单测（价格缺失时 value 处理、重复 token 去重、排序稳定性）。

验收：产出统一资产快照结构，聚合逻辑可复用。

### Step 5：tasks/assets 编排切片

1. 新增 tasks/assets/index.mjs（defineTask + dispatcher）。
2. 第一版仅暴露：assets.status、assets.query。
3. 参数保持最小：chain、addresses、tokens、quote。

验收：task 可执行，help 可发现，输出字段可审计。

### Step 6：CLI 暴露与最小端到端切片

1. 增加 assets 子命令帮助与子路由。
2. 打通一条端到端流程：query -> snapshot 输出。
3. 补充 workflow 回归测试（含错误路径）。

验收：CLI 可直接调用，端到端流程可复现。

### Step 7：阶段收口与 review 包

1. 汇总本阶段函数清单、测试清单、风险清单。
2. 标注未完成项（BTC/TRX 适配、高级筛选、缓存优化）。
3. 更新 plan 的“下一阶段目标”。

验收：可直接进入下一阶段迭代，无隐式需求漂移。
