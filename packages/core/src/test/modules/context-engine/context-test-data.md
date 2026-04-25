# context-engine 测试样本清单

目标：为 context-engine 切片开发准备最小可执行样本，满足 happy、edge、invalid、security 四类要求。

## 1. happy-path

1. 初始化空上下文树
- 输入：空 session
- 期望：返回默认结构 wallet/chat/env/task 四域

2. 写入 wallet 快照后读取
- 输入：wallet 基本信息与地址列表
- 期望：读模型可返回标准化 wallet 节点

3. 写入任务状态并读取
- 输入：taskId + running
- 期望：状态可读，时间戳可读

4. 写入 chat 摘要并读取
- 输入：summary + intent
- 期望：原文窗口与摘要字段按策略返回

5. 写入 env 脱敏快照并读取
- 输入：network/provider/health
- 期望：返回脱敏字段，不含 secret

## 2. edge-case

1. chat 原文窗口超过上限
- 输入：超量消息
- 期望：按窗口截断，摘要保留

2. 重复 task checkpoint 写入
- 输入：同 task 同 step 多次写入
- 期望：最新版本覆盖，历史可追踪

3. 部分域缺失
- 输入：只有 wallet 域
- 期望：其他域自动补默认值

4. 非标准 network 名称
- 输入：network 别名
- 期望：归一化后存储

## 3. invalid-case

1. 未知任务状态
- 输入：state=unknown
- 期望：返回校验错误

2. 非法时间戳
- 输入：updatedAt=NaN
- 期望：返回校验错误

3. 写入结构类型错误
- 输入：wallet 节点为数组
- 期望：返回校验错误

4. 缺少必填字段
- 输入：task 无 taskId
- 期望：返回校验错误

## 4. security-case

1. 输入包含 secret 字段
- 输入：apiKey/privateKey/seed
- 期望：对外读取对象不包含原值

2. 错误信息包含敏感字段
- 输入：故意注入 secret 值触发异常
- 期望：错误输出不回显 secret 原值

3. 日志快照字段过滤
- 输入：private 与 secret 混合字段
- 期望：日志只保留允许级别字段

## 5. 回归样本

1. 任务中断恢复
- 输入：running -> waiting_input -> resume
- 期望：恢复后状态连续且幂等

2. 跨域读取一致性
- 输入：wallet 与 task 连续更新
- 期望：统一读取结果无脏读

## 6. 样本文件规划

建议后续落地到 fixtures：

1. fixtures/inputs
- context-init.happy.input.json
- context-chat-overflow.edge.input.json
- context-secret.security.input.json

2. fixtures/expected
- context-init.happy.expected.json
- context-task-resume.regression.expected.json
- context-security-filter.security.expected.json

3. fixtures/errors
- context-invalid-state.invalid.error.json
- context-missing-taskid.invalid.error.json

## 7. 备注

1. 样本禁止真实私钥、助记词、密码
2. 使用占位符：
- PRIVATE_KEY_PLACEHOLDER
- MNEMONIC_PLACEHOLDER
- PASSWORD_PLACEHOLDER
3. 先样本后实现，未完成样本不得进入编码
