# 模块开发交付模板

使用方式：复制本模板，保存到 plan 下并命名为 module-<模块名>-plan.md。

## 1. 模块信息

- 模块名称：
- 所属层：modules / apps / execute / tasks / cli
- 负责人：
- 关联需求：

## 2. 方案讨论记录

### 2.1 目标

- 

### 2.2 输入输出契约

- 输入：
- 输出：
- 错误输出：

### 2.3 边界与失败路径

- 

### 2.4 安全分层

- public 字段：
- internal 字段：
- private 字段：
- secret 字段：

### 2.5 兼容与迁移

- 

## 3. 测试数据计划（先于开发）

测试目录：src/test/<对应模块目录>/

- 样本 1（happy-path）：
- 样本 2（edge-case）：
- 样本 3（invalid-case）：
- 样本 4（security-case）：

测试文件建议：

- fixtures/inputs/*.json
- fixtures/expected/*.json
- <module>.test.mjs

## 4. 开发任务拆解

1. 
2. 
3. 

## 5. 测试任务拆解

1. 单元测试：
2. 集成测试：
3. 回归测试：
4. 安全测试：

## 6. 验收标准

- 功能正确
- 错误处理完整
- 输出安全分层正确
- 测试通过
- 文档完成

## 7. 结果记录

- 实际完成时间：
- 风险与遗留：
- 后续优化项：
