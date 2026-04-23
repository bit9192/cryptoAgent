# 测试数据规范

目标：统一各模块在 src/test 下的测试数据准备方式，确保“先数据后开发”。

## 目录约定

按模块分层镜像业务目录：

- src/test/modules
- src/test/apps
- src/test/execute
- src/test/tasks
- src/test/cli
- src/test/wallet

每个模块建议结构：

- fixtures/inputs
- fixtures/expected
- fixtures/errors
- <module>.test.mjs

## 数据样本要求

至少包含四类数据：

1. happy-path
- 标准输入与标准输出。

2. edge-case
- 空数组、空对象、缺省字段、超大数值、极小数值。

3. invalid-case
- 类型错误、必填字段缺失、非法枚举值。

4. security-case
- 包含 private 和 secret 字段，验证输出不会泄露。

## 敏感数据规则

- 禁止提交真实私钥、真实助记词、真实密码。
- 使用脱敏占位符：
  - PRIVATE_KEY_PLACEHOLDER
  - MNEMONIC_PLACEHOLDER
  - PASSWORD_PLACEHOLDER
- 任何测试快照不得出现 secret 原值。

## 断言要求

每个测试用例建议断言：

1. 业务结果正确。
2. 错误码与错误消息正确。
3. 输出字段安全级别符合预期。
4. private 和 secret 字段未出现在 AI 或 UI 输出对象中。

## 推荐命名

- 输入：<case>.input.json
- 期望输出：<case>.expected.json
- 错误输出：<case>.error.json

示例：

- collect-token-balance.happy.input.json
- collect-token-balance.happy.expected.json
- collect-token-balance.security.input.json
- collect-token-balance.security.expected.json

## 提交流程

1. 先提交测试数据与测试草案。
2. 评审通过后再提交功能实现。
3. 功能提交必须附带测试通过结果。
