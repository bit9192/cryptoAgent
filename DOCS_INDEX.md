# 文档导航和总结

**最后更新**: 2026-04-25

---

## 核心文档体系

本工作区现在包含一套完整的文档体系，用于指导系统架构、开发流程和代码规范。

---

## 📚 文档清单

### 第一层：整体架构（根目录）

#### [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)
**→ 从这里开始！理解整个系统**

- 多链微内核操作系统架构
- 核心层级：Provider / Request Engine / Search Engine / Context Engine
- 典型数据流
- 关键优势
- 与 Agent 的关系

**何时阅读**：开始任何新功能开发前

---

### 第二层：开发规范（packages/core/）

#### [DEVELOPMENT_WORKFLOW.md](./packages/core/DEVELOPMENT_WORKFLOW.md)
**→ 开发流程的圣经**

- "样本 → 测试 → 计划 → 实现" 四阶段流程
- 每个阶段的详细说明
- 门禁检查（不通过则停止）
- 定义完成 (DoD)
- 快速参考

**何时阅读**：开始任何新模块开发前

#### [CODING_STANDARDS.md](./DEV_STANDARDS.md)
**→ 代码规范**

- 文件命名规范（kebab-case）
- 代码结构规范
- 模块导出规范
- 测试文件规范
- 文档文件规范

**何时阅读**：创建新文件或编写代码时

#### [TESTING_STANDARDS.md](./packages/core/TESTING_STANDARDS.md)
**→ 测试规范**

- 四种样本类型：Happy / Edge / Invalid / Security
- 详细的样本定义和示例
- 测试代码框架（node:test）
- 覆盖率标准（> 80%）
- 测试数据管理

**何时阅读**：准备测试样本和编写测试代码时

#### [SECURITY_STANDARDS.md](./packages/core/SECURITY_STANDARDS.md)
**→ 安全规范**

- 字段分层体系：Public / Internal / Private / Secret
- 输出过滤规则
- Sanitization 函数使用
- 敏感数据处理最佳实践
- 安全测试编写

**何时阅读**：模块涉及敏感数据时（privateKey / password / secret）

---

### 第三层：模块设计指南（packages/core/）

#### [MODULE_DESIGN_TEMPLATE.md](./packages/core/MODULE_DESIGN_TEMPLATE.md)
**→ 设计新模块的完整指南**

- 四种模块类型的设计方法：
  - A. Chain Provider（如 Solana）
  - B. Search 子系统（如 Liquidity Search）
  - C. Utility 模块（如 Notification Engine）
  - D. Task（如 Bridge Transfer）
- 每种类型的检查清单
- 常见陷阱和解决方案

**何时阅读**：设计新模块时

#### [TASK_DEFINITION_GUIDELINES.md](./packages/core/TASK_DEFINITION_GUIDELINES.md)
**→ Task 定义规范**

- Task 结构定义
- Action Dispatcher 用法
- 元信息要求

**何时阅读**：定义新 Task 时

#### [DEV_MD_TEMPLATE.md](./packages/core/DEV_MD_TEMPLATE.md)
**→ dev.md 文件的统一模板**

- 模板格式和各个部分说明
- 如何填写每个部分
- 进度跟踪方式

**何时阅读**：创建新模块的 dev.md 时

---

### 第四层：自动化工作流（.github/）

#### [development-workflow.instructions.md](./.github/instructions/development-workflow.instructions.md)
**→ AI 自动遵循的门禁和规则**

- 系统自动执行的检查项
- 开发前必须通过的门禁
- 每次开发的强制步骤
- 敏感数据处理提醒

**谁读**：主要是 AI Agent（自动执行）

---

## 🔄 推荐阅读顺序

### 第一次接触系统

1. ✅ [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - 理解架构（15 分钟）
2. ✅ [DEVELOPMENT_WORKFLOW.md](./packages/core/DEVELOPMENT_WORKFLOW.md) - 了解流程（10 分钟）
3. ✅ [CODING_STANDARDS.md](./DEV_STANDARDS.md) - 学习规范（5 分钟）

### 开发新模块前

1. ✅ [MODULE_DESIGN_TEMPLATE.md](./packages/core/MODULE_DESIGN_TEMPLATE.md) - 设计方案（10 分钟）
2. ✅ [TESTING_STANDARDS.md](./packages/core/TESTING_STANDARDS.md) - 准备样本（5 分钟）
3. ✅ [DEV_MD_TEMPLATE.md](./packages/core/DEV_MD_TEMPLATE.md) - 写开发计划（5 分钟）

### 开发有敏感数据的功能

1. ✅ [SECURITY_STANDARDS.md](./packages/core/SECURITY_STANDARDS.md) - 学习隔离规则（10 分钟）
2. ✅ [TESTING_STANDARDS.md](./packages/core/TESTING_STANDARDS.md) - 编写安全测试（5 分钟）

---

## 🎯 快速参考

### 我想...

#### ...理解系统架构
→ [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)

#### ...开发新的 Chain Provider（如 Solana）
→ [MODULE_DESIGN_TEMPLATE.md](./packages/core/MODULE_DESIGN_TEMPLATE.md#a-chain-provider)

#### ...开发新的 Search 子模块
→ [MODULE_DESIGN_TEMPLATE.md](./packages/core/MODULE_DESIGN_TEMPLATE.md#b-search-子系统)

#### ...定义新 Task
→ [TASK_DEFINITION_GUIDELINES.md](./packages/core/TASK_DEFINITION_GUIDELINES.md)

#### ...准备测试样本
→ [TESTING_STANDARDS.md](./packages/core/TESTING_STANDARDS.md#一测试样本的四种类型)

#### ...处理敏感数据（privateKey 等）
→ [SECURITY_STANDARDS.md](./packages/core/SECURITY_STANDARDS.md)

#### ...编写测试代码
→ [TESTING_STANDARDS.md](./packages/core/TESTING_STANDARDS.md#二测试代码框架)

#### ...创建 dev.md
→ [DEV_MD_TEMPLATE.md](./packages/core/DEV_MD_TEMPLATE.md)

#### ...了解开发流程
→ [DEVELOPMENT_WORKFLOW.md](./packages/core/DEVELOPMENT_WORKFLOW.md)

---

## 📊 文档关系图

```
ARCHITECTURE_OVERVIEW.md (核心)
  ├─ 定义系统整体结构
  └─ 所有其他文档都参考它

DEVELOPMENT_WORKFLOW.md (流程)
  ├─ 定义"样本→测试→计划→实现"
  └─ 所有开发都遵循此流程

MODULE_DESIGN_TEMPLATE.md (设计)
  ├─ 如何设计新模块
  └─ 链接到 CODING_STANDARDS 和 SECURITY_STANDARDS

TESTING_STANDARDS.md (测试)
  ├─ 定义四种样本类型
  ├─ 包括安全样本（Security Case）
  └─ 链接到 SECURITY_STANDARDS

SECURITY_STANDARDS.md (安全)
  ├─ 定义字段分层
  ├─ 定义 Sanitization 规则
  └─ 用于所有涉及敏感数据的开发

CODING_STANDARDS.md (规范)
  ├─ 文件命名
  ├─ 代码结构
  └─ 所有开发都遵循

TASK_DEFINITION_GUIDELINES.md (Task)
  └─ 特定于 Task 的规范

DEV_MD_TEMPLATE.md (模板)
  └─ dev.md 文件的统一格式

.instructions.md (自动化)
  └─ AI 自动执行的检查项
```

---

## 🔐 关键要点速记

### 开发流程（4 步）
1. 准备测试样本 (test-data.md)
2. 编写测试代码 (*.test.mjs)
3. 编写开发计划 (dev.md)
4. 实现一个切片

### 测试样本（4 种）
1. Happy Path - 正常情况
2. Edge Cases - 边界情况
3. Invalid Cases - 错误输入
4. Security Cases - 敏感数据

### 字段分层（4 级）
1. PUBLIC - 可以暴露
2. INTERNAL - 系统内部
3. PRIVATE - 链路内部
4. SECRET - 极度敏感

### 门禁检查（4 个）
1. dev.md 存在且包含切片计划
2. test-data.md 存在且覆盖 4 种样本
3. *.test.mjs 存在且完整
4. 本次只做一个切片

---

## 📝 最近更新

- **2026-04-25**: 建立完整的文档体系，包括 6 个核心文档
- 所有新创建的文档都遵循统一的格式和结构
- 更新 .instructions.md 以自动执行开发规范

---

## 📞 获取帮助

### 如果你不知道...

**Q: 系统怎么工作？**  
A: 阅读 [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)

**Q: 怎么开始新模块开发？**  
A: 按顺序阅读：MODULE_DESIGN → DEVELOPMENT_WORKFLOW → TESTING_STANDARDS

**Q: 敏感数据怎么处理？**  
A: 阅读 [SECURITY_STANDARDS.md](./packages/core/SECURITY_STANDARDS.md)

**Q: 测试样本怎么写？**  
A: 阅读 [TESTING_STANDARDS.md](./packages/core/TESTING_STANDARDS.md)

**Q: dev.md 怎么填？**  
A: 参考 [DEV_MD_TEMPLATE.md](./packages/core/DEV_MD_TEMPLATE.md)

---

## ✅ 验证清单

系统已建立的完整文档体系：

- [x] ARCHITECTURE_OVERVIEW.md - 架构总览
- [x] DEVELOPMENT_WORKFLOW.md - 开发流程
- [x] CODING_STANDARDS.md - 代码规范
- [x] TESTING_STANDARDS.md - 测试规范
- [x] SECURITY_STANDARDS.md - 安全规范
- [x] MODULE_DESIGN_TEMPLATE.md - 模块设计指南
- [x] TASK_DEFINITION_GUIDELINES.md - Task 定义规范
- [x] DEV_MD_TEMPLATE.md - dev.md 模板
- [x] development-workflow.instructions.md - AI 自动化规则

**总计**: 9 个核心文档，提供了从架构理解、开发设计、编码规范、到测试安全的完整指导。

---

## 🎓 学习路径

**初学者** (1-2 小时)
1. ARCHITECTURE_OVERVIEW
2. DEVELOPMENT_WORKFLOW
3. 一个 MODULE_DESIGN_TEMPLATE 示例

**中级开发者** (第一个模块)
1. 所有 6 个核心文档
2. DEV_MD_TEMPLATE
3. 创建第一个模块的 test-data.md 和 dev.md

**高级开发者** (扩展系统)
1. 深入研究特定领域文档
2. 贡献改进文档
3. 指导其他开发者

---

**下一步**：按照 [DEVELOPMENT_WORKFLOW.md](./packages/core/DEVELOPMENT_WORKFLOW.md) 开始你的第一个模块开发！
