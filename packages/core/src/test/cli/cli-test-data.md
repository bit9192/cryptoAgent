# cli/ex:lon 测试样本清单

目标：为 CLI 上下分区与条件输入能力提供最小样本。

## 1. happy-path

1. task 成功后显示结果摘要
- 输入：模拟成功执行记录
- 期望：上方结果面板显示 task 名称、状态、时间

2. task 失败后显示错误摘要
- 输入：模拟失败执行记录
- 期望：面板状态为 error，并显示脱敏错误消息

3. 交互请求输入时显示 awaiting_input
- 输入：interact 开始事件
- 期望：面板状态切换为 awaiting_input

4. 交互请求时显示字段摘要
- 输入：fields 含 text/password/confirm
- 期望：面板摘要包含字段名、类型、required 标识

## 2. edge-case

1. 无历史执行记录
- 输入：空会话
- 期望：面板显示“暂无结果”占位

2. 超长结果对象
- 输入：大对象结果
- 期望：摘要截断，面板不溢出

3. 连续状态切换
- 输入：running -> awaiting_input -> running -> done
- 期望：状态机显示顺序正确

4. 交互字段过多
- 输入：fields 数量超阈值
- 期望：摘要截断但不抛异常

## 3. invalid-case

1. 未知状态值
- 输入：status=unknown
- 期望：渲染为 fallback 文案，不抛异常

2. 缺少 task 名称
- 输入：无 task 字段
- 期望：显示 anonymous task，不抛异常

3. 非法 fields 结构
- 输入：fields 为 null/对象混杂
- 期望：面板回退到通用提示，不抛异常

## 4. security-case

1. 错误信息含 secret
- 输入：error 含 PRIVATE_KEY_PLACEHOLDER
- 期望：面板摘要不展示原值

2. 结果对象含 secret 字段
- 输入：result.privateKey/result.mnemonic
- 期望：摘要不包含敏感字段

3. 输入字段默认值含 secret
- 输入：password 字段 initial 为敏感占位
- 期望：面板不展示该默认值

## 5. 回归样本

1. 旧命令语义兼容
- 输入：wallet/task/help/state/history
- 期望：命令行为不变

2. interact 结束后可继续输入
- 输入：interact 完成
- 期望：prompt 恢复正常
