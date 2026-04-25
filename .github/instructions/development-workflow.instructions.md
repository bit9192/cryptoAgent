---
applyTo: "packages/core/src/**,packages/core/src/test/**"
description: "Use when continuing module development, adding new features, or implementing test-driven slices in packages/core. Enforces: read test dev.md first, prepare test data first, write plan first, then implement one slice only."
---

# Development Workflow Gate

对 packages/core 的新增功能开发，必须遵循以下门禁：

1. 先读取对应 test 目录下的 dev.md。
2. 先读取对应测试数据文件。
3. 若 dev.md 中未写本次切片计划，不得进入实现。
4. 若测试样本未覆盖 happy / invalid / edge，默认停止实现并先补样本。
5. 一次只实现一个切片，不得跨切片混做。
6. 实现完成后，必须先运行该切片测试，再运行受影响测试。

对话中若用户说“继续开发某模块”，默认先做以下三件事：

1. 总结当前 dev.md 中的当前进度与下一步。
2. 检查测试数据是否足够。
3. 若不足，先编辑文档与样本，不直接写代码。
@@
@@---
@@
@@# 系统架构和文档指南
@@
@@在开始任何开发前，参考以下核心文档：
@@
@@## 核心文档（必读）
@@
@@1. **[ARCHITECTURE_OVERVIEW.md](../../ARCHITECTURE_OVERVIEW.md)** - 系统整体设计
@@   - 多链微内核操作系统架构
@@   - Provider 模型（Wallet/Net/Search）
@@   - Request Engine 和 Context Engine
@@   - 数据流和关键优势
@@
@@2. **[DEVELOPMENT_WORKFLOW.md](../../packages/core/DEVELOPMENT_WORKFLOW.md)** - 开发流程
@@   - "样本 → 测试 → 计划 → 实现"的4阶段流程
@@   - 门禁检查（开发前必须通过）
@@   - 定义完成 (DoD)
@@
@@3. **[MODULE_DESIGN_TEMPLATE.md](../../packages/core/MODULE_DESIGN_TEMPLATE.md)** - 模块设计指南
@@   - 设计新模块的检查清单
@@   - 四种模块类型（Provider / Search / Utility / Task）
@@   - 常见陷阱和解决方案
@@
@@## 规范文档
@@
@@4. **[CODING_STANDARDS.md](../../DEV_STANDARDS.md)** - 代码规范
@@   - 文件命名规范
@@   - 代码结构和导入导出
@@   - 模块导出规范
@@
@@5. **[TESTING_STANDARDS.md](../../packages/core/TESTING_STANDARDS.md)** - 测试规范
@@   - 四种样本类型（Happy/Edge/Invalid/Security）
@@   - 测试代码框架
@@   - 覆盖率标准（>80%）
@@
@@6. **[SECURITY_STANDARDS.md](../../packages/core/SECURITY_STANDARDS.md)** - 安全规范
@@   - 字段分层体系（Public/Internal/Private/Secret）
@@   - 输出过滤规则
@@   - 敏感数据处理最佳实践
@@
@@---
@@
@@# 开发流程完整检查表
@@
@@## 阶段 1: 理解需求
@@
@@□ 已读 ARCHITECTURE_OVERVIEW.md
@@□ 已读 MODULE_DESIGN_TEMPLATE.md
@@□ 已明确模块类型（Provider / Search / Utility / Task）
@@□ 已理解模块与系统的关系
@@□ 已检查是否涉及敏感字段
@@
@@## 阶段 2: 准备测试样本
@@
@@参考：[TESTING_STANDARDS.md](../../packages/core/TESTING_STANDARDS.md)
@@
@@□ 创建或更新 src/test/{module}/test-data.md
@@□ 包含 Happy Path 样本（至少 1 个）
@@□ 包含 Edge Cases 样本（至少 3 个）
@@□ 包含 Invalid Cases 样本（至少 3 个）
@@□ 包含 Security Cases 样本（至少 2 个）
@@□ 所有样本无真实敏感数据（都用 mock）
@@□ 样本数据格式清晰易读
@@
@@## 阶段 3: 编写测试代码
@@
@@参考：[TESTING_STANDARDS.md](../../packages/core/TESTING_STANDARDS.md)
@@
@@□ 创建 src/test/{module}/*.test.mjs
@@□ 导入 test-data.md 中的样本
@@□ 使用 node:test 框架
@@□ 覆盖所有 4 种样本类型
@@□ 包含安全测试（敏感字段不泄露）
@@□ 运行测试验证失败（TDD）
@@
@@## 阶段 4: 编写开发计划
@@
@@参考：[DEVELOPMENT_WORKFLOW.md](../../packages/core/DEVELOPMENT_WORKFLOW.md)
@@
@@□ 创建或更新 src/test/{module}/dev.md
@@□ 明确需求理解（输入/输出/边界/失败路径）
@@□ 列出所有实现切片（S-1, S-2, ...）
@@□ 对应测试覆盖（哪个切片对应哪个样本）
@@□ 记录设计决策理由
@@□ 定义验收标准
@@
@@## 阶段 5: 实现单个切片
@@
@@参考：[CODING_STANDARDS.md](../../DEV_STANDARDS.md), [SECURITY_STANDARDS.md](../../packages/core/SECURITY_STANDARDS.md)
@@
@@□ 严格按 dev.md 的切片描述实现
@@□ 不临场扩散需求
@@□ 不跨切片混做
@@□ 遵循代码规范（文件命名、导出等）
@@□ 包含足够的注释
@@□ 涉及敏感字段时，使用 sanitize 函数
@@
@@## 阶段 6: 验证和测试
@@
@@□ 运行该切片的单元测试 → 应该全部通过
@@□ 运行全量回归测试 → 不应有新增失败
@@□ 检查测试覆盖率 > 80%
@@□ 检查安全测试通过（敏感字段未泄露）
@@□ 更新相关文档
@@
@@---
@@
@@# 每次开发前的强制门禁（AI 必须执行）
@@
@@如果 **任何一个** 以下条件不满足，则 **停止并告知用户**，不进入实现阶段：
@@
@@```
@@检查 dev.md：
@@  ├─ 文件存在？
@@  │  └─ 不存在 → 停止，先创建
@@  └─ 包含本次切片计划？
@@     └─ 不包含 → 停止，先添加
@@
@@检查 test-data.md：
@@  ├─ 文件存在？
@@  │  └─ 不存在 → 停止，先创建
@@  └─ 覆盖 Happy/Edge/Invalid/Security？
@@     └─ 不足 → 停止，先补充
@@
@@检查 *.test.mjs：
@@  ├─ 文件存在？
@@  │  └─ 不存在 → 停止，先创建
@@  └─ 测试数量是否充分？
@@     └─ 不足 → 停止，先补充
@@
@@检查切片计划：
@@  ├─ 本次只做一个切片？
@@  │  └─ 多于一个 → 停止，分次做
@@  └─ 切片在 dev.md 中明确？
@@     └─ 不明确 → 停止，先明确
@@```
@@
@@---
@@
@@# 对话流程说明
@@
@@当用户说 **"继续开发某模块"** 时，AI 必须按以下顺序执行：
@@
@@## 第 1 步：读取和总结
@@
@@1. 读取 dev.md
@@2. 识别当前进度（已完成的切片）
@@3. 标明下一步（下一个切片）
@@4. 向用户汇报进度
@@
@@## 第 2 步：检查完整性
@@
@@1. 检查 test-data.md 是否存在
@@2. 检查测试样本是否足够
@@3. 检查 *.test.mjs 是否完整
@@4. 如果缺失，**优先完善** 而不是进入实现
@@
@@## 第 3 步：进入实现或反馈
@@
@@- 如果通过门禁检查：进入阶段 5（实现）
@@- 如果未通过：停止，告知用户需要先完善哪些文档
@@
@@---
@@
@@# 敏感数据处理提醒
@@
@@每次开发都要检查：
@@
@@□ 是否涉及 privateKey?
@@  └─ 是 → 必须使用 sanitizeForPanel() 函数
@@
@@□ 是否涉及 mnemonic?
@@  └─ 是 → 必须使用 sanitizeForPanel() 函数
@@
@@□ 是否涉及 password?
@@  └─ 是 → 必须在错误消息中隐藏
@@
@@□ 是否在 CLI 中输出?
@@  └─ 是 → 必须过滤所有敏感字段
@@
@@□ 是否在日志中记录?
@@  └─ 是 → 只记录 public 字段
@@
@@详见：[SECURITY_STANDARDS.md](../../packages/core/SECURITY_STANDARDS.md)
