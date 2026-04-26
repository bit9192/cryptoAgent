# modules/inputs 开发计划

目标：建立统一的 inputs 上下文能力，支持用户与 AI 以同一输入模型驱动查询与后续交易流程，并保持可审计、可回放。

## 1. 模块范围

1. 管理会话级 inputs（set/patch/show/clear）
2. 定义 inputs 字段规范与优先级（显式参数 > inputs > 默认值）
3. 提供 selector 到唯一地址目标的解析能力（resolve）
4. 提供高风险操作所需的执行前快照与确认约束

## 2. 测试样本与测试文件

1. 测试样本：src/test/modules/inputs/testdata.md
2. 开发基线：依赖 src/test/modules/wallet-tree/testdata.md 的结构约束
3. 测试文件：src/test/modules/inputs/inputs.test.mjs

## 3. 切片计划

### Slice WI-1：协议与门禁文档（当前切片）

本次只做：

1. 建立 inputs dev.md
2. 明确输入模型与边界（读写分级、审计约束）
3. 明确后续切片顺序与验收标准

本次不做：

1. 业务代码实现
2. task/cli 接线
3. send/swap 执行逻辑改造

验收标准：

1. dev.md 完整描述模块边界与切片计划
2. 下一切片明确要求先补 testdata

### Slice WI-2：测试样本与基础测试骨架

本次只做：

1. 创建 testdata.md（happy/edge/invalid/security）
2. 创建最小测试文件并校验样本标题门禁

验收标准：

1. 样本覆盖四类场景
2. 测试文件可运行且通过

### Slice WI-3：inputs 模块最小读写能力

本次只做：

1. 在 modules 层实现 inputs 会话读写（set/show/clear）
2. 提供 TTL 与最小字段校验

验收标准：

1. 单测覆盖空输入、覆盖写入、过期处理
2. 不泄露敏感字段

### Slice WI-4：task 薄适配接入

本次只做：

1. 在 wallet:session 增加 wallet.inputs.* action
2. task 层仅调用模块层能力

验收标准：

1. task 集成测试通过
2. 对外返回契约稳定

### Slice WI-5：inputs.patch 与 resolver（当前切片）

本次只做：

1. 在 modules/inputs 增加 `patch` 能力（局部更新，保留未提供字段）
2. 在 modules/inputs 增加最小 `resolve` 能力（显式参数 > inputs > 默认值）
3. 在 wallet:session 增加 `wallet.inputs.patch` 与 `wallet.inputs.resolve` 薄适配 action

本次不做：

1. send/swap 的执行策略接入
2. Data Engine 动态策略托管

验收标准：

1. 模块测试覆盖 patch 与 resolve 合并优先级
2. wallet:session 集成测试覆盖 patch/resolve action
3. 不泄露敏感字段

### Slice WI-6：resolver 接入读任务（当前切片）

本次只做：

1. 在 `wallet.status` 增加 `useInputs` 读入能力
2. 通过 `inputs.resolve` 获取筛选条件并应用于状态输出
3. 保持未开启 `useInputs` 时旧行为不变

本次不做：

1. 资产查询任务接入
2. 写操作（send/swap）策略接入

验收标准：

1. `wallet.status` 在 `useInputs=true` 时可按 inputs 过滤输出
2. 关闭 `useInputs` 时返回结果与原行为一致
3. wallet:session 集成测试通过

### Slice WI-7：wallet inputs 交互壳（当前切片）

本次只做：

1. 在 lon 的 `wallet` 命令分支支持 `wallet inputs.set/patch` 参数透传
2. 当 `set/patch` 缺少必要参数时，提供最小交互采集（scope + data JSON）
3. 保持最终执行仍走 `wallet:session` 任务接口，不新增业务分叉

本次不做：

1. 资产查询任务接入 inputs
2. send/swap 写操作策略接入

验收标准：

1. `wallet inputs.set --scope ... --data ...` 不再被忽略参数
2. 缺参时可交互补齐后执行
3. 原有 `wallet unlock/clear/derive/status/tree` 行为不受影响

## 4. 当前进度 / 下一步

当前进度：

1. 已建立 inputs 开发门禁文档（WI-1）
2. 已完成 WI-2：补齐 testdata 与基础测试骨架
3. 已完成 WI-3：实现 modules/inputs 最小读写能力（set/show/clear）
4. 已完成 WI-4：wallet:session 接入 wallet.inputs.* action（task 薄适配）
5. 已完成 WI-5：实现 inputs.patch 与 resolver 读入策略（先读场景）
6. 已完成 WI-6：resolver 接入 wallet.status 读任务（useInputs）
7. 已完成 WI-7：wallet inputs 交互壳（参数透传 + 缺参交互）

下一步：

1. 可选进入 WI-8：将 resolver 接入资产查询任务（assets:query）

## 5. 开发门禁（执行前检查）

1. 先读本文件，再读 testdata.md
2. 一次只做一个切片
3. 高风险操作（send/swap）必须有唯一目标与确认快照
4. 涉及 privateKey/mnemonic/password 时必须做输出过滤
