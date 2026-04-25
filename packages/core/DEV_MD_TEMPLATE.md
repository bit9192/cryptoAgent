# DEV.MD 统一模板

**文件位置**: `src/test/{module-name}/dev.md`

使用以下模板创建或更新每个模块的 dev.md。

---

# {模块名} 开发计划

> 最后更新: 2026-04-25  
> 状态: 规划中 / 进行中 / 完成  
> 负责人: [AI Agent / User]

---

## 一、需求理解

### 1.1 模块定义

**模块目的**：一句话说明这个模块解决什么问题

**类型**：
- [ ] Chain Provider（链适配层）
- [ ] Search Module（搜索聚合）
- [ ] Utility Module（工具模块）
- [ ] Task Definition（业务任务）

**与系统的关系**：
- 依赖的模块：[列出]
- 被依赖的模块：[列出]
- 分层位置：modules / apps / execute / tasks / cli

### 1.2 输入规范

```javascript
/**
 * 输入参数类型定义
 */
interface Input {
  // 参数1
  param1: string;
  
  // 参数2（可选）
  param2?: number;
}
```

**约束条件**：
- param1 必填，长度 > 0
- param2 可选，范围 0-100

### 1.3 输出规范

```javascript
/**
 * 输出结果类型定义
 */
interface Output {
  // 结果1
  result1: string;
  
  // 结果2
  result2: number;
  
  // 错误信息（如果有）
  error: Error | null;
}
```

### 1.4 失败路径

| 失败场景 | 错误类型 | 处理方式 |
|---------|---------|---------|
| param1 为空 | ValidationError | 返回错误信息 |
| 网络超时 | NetworkError | 重试 3 次，失败后报错 |
| 权限不足 | PermissionError | 返回 401 错误 |

### 1.5 边界和特殊情况

- 如果 param2 缺少，使用默认值 50
- 如果输入超过大小限制，截断或返回错误
- 如果涉及跨链操作，支持链优先级排序

---

## 二、架构决策

### 2.1 模块模式

**问题**：这个模块是否需要多链支持？

**答**：[是/否]

**理由**：[说明原因]

**实现方式**：
- [ ] Provider 模式（每条链一个实现）
- [ ] 单一实现
- [ ] 聚合模式（多源）

### 2.2 数据源

**主要数据源**：
- [数据源 1]：API 地址、速率限制、缓存策略
- [数据源 2]：...

**备用数据源**（故障时）：
- [备用 1]
- [备用 2]

### 2.3 缓存策略

**是否需要缓存**：[是/否]

**缓存层次**：
- [ ] L1：Request 级别去重（相同请求合并）
- [ ] L2：Chain 级别缓存（多个请求共享结果）
- [ ] L3：持久化缓存

**缓存时长**：[时间]

**缓存 Key 设计**：
```
格式: {chain}:{module}:{operation}:{hash(params)}
例子: evm:token-search:findToken:0x1234
```

### 2.4 敏感数据处理

**涉及敏感字段**：
- [ ] privateKey
- [ ] mnemonic
- [ ] password
- [ ] secret (API key)
- [ ] 其他：[列出]

**隔离策略**：
- 字段级别：[Public/Internal/Private/Secret]
- 输出过滤：[使用 sanitizeForPanel]
- 日志处理：[不记录/摘要记录]

### 2.5 与 Request Engine 的集成

**是否使用 Request Engine**：[是/否]

**理由**：[多链同时查询/需要去重/其他]

### 2.6 与 Context Engine 的集成

**是否使用 Context Engine**：[是/否]

**上下文内容**：[用户状态/会话信息/其他]

---

## 三、实现计划

### 3.1 切片分解

| 切片ID | 功能描述 | 文件 | 估计工作量 | 验收标准 | 状态 |
|--------|---------|------|-----------|---------|------|
| S-1 | [功能描述] | [文件] | [1d/2d/3d] | [标准] | 未开始 |
| S-2 | [功能描述] | [文件] | [1d/2d/3d] | [标准] | 未开始 |
| S-3 | [功能描述] | [文件] | [1d/2d/3d] | [标准] | 未开始 |

### 3.2 每个切片的详细规划

#### S-1: {功能名}

**输入**：[该切片的输入]  
**输出**：[该切片的输出]  
**关键逻辑**：[核心算法/调用流]

**实现要点**：
- [ ] 步骤 1：[具体操作]
- [ ] 步骤 2：[具体操作]
- [ ] 步骤 3：[具体操作]

**对应测试样本**：
- Happy Path：test-data.md 中的 [样本名]
- Edge Cases：[样本名1], [样本名2]
- Invalid Cases：[样本名3]
- Security Cases：[样本名4]

**验收测试**：
```bash
node --test src/test/{module}/S-1.test.mjs
```

**预期通过率**：100%

---

#### S-2: {功能名}

[同上格式]

---

### 3.3 文件结构

```
src/test/{module}/
  ├─ dev.md                    ← 本文件
  ├─ test-data.md              ← 测试样本定义
  ├─ index.mjs                 ← 测试数据导出
  ├─ {module}.test.mjs         ← 单元测试
  └─ {module}.integration.test.mjs (可选) ← 集成测试

src/modules/{module}/
  ├─ index.mjs                 ← 导出
  ├─ core.mjs                  ← 核心逻辑
  ├─ provider.mjs              ← Provider（如需要）
  └─ types.mjs                 ← 类型定义
```

---

## 四、测试覆盖

### 4.1 样本矩阵

| 切片 | Happy | Edge1 | Edge2 | Edge3 | Invalid1 | Invalid2 | Security |
|------|-------|-------|-------|-------|----------|----------|----------|
| S-1 | ✓ | ✓ | ✓ | | ✓ | | ✓ |
| S-2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| S-3 | ✓ | | ✓ | | ✓ | | |

### 4.2 覆盖率目标

- 语句覆盖：> 80%
- 分支覆盖：> 75%
- 函数覆盖：> 85%

---

## 五、定义完成 (DoD)

模块开发完成的检查清单：

### 文档阶段
- [ ] test-data.md 已完善
- [ ] dev.md 已完整
- [ ] API 文档已更新

### 测试阶段
- [ ] *.test.mjs 已完整
- [ ] 所有测试通过
- [ ] 覆盖率 > 80%

### 实现阶段
- [ ] 所有切片已实现
- [ ] 代码遵循规范
- [ ] 注释清晰完整

### 安全阶段
- [ ] 敏感字段已隔离
- [ ] 输出已过滤
- [ ] 安全测试通过

### 集成阶段
- [ ] 与其他模块集成测试通过
- [ ] 回归测试通过
- [ ] 部署文档已更新

---

## 六、进度跟踪

### 时间表

| 阶段 | 计划开始 | 计划完成 | 实际完成 | 进度 |
|------|---------|---------|---------|------|
| 样本准备 | 2026-04-25 | 2026-04-26 | | |
| 测试编写 | 2026-04-26 | 2026-04-27 | | |
| S-1 实现 | 2026-04-27 | 2026-04-28 | | |
| S-2 实现 | 2026-04-28 | 2026-04-29 | | |
| 集成测试 | 2026-04-29 | 2026-04-30 | | |

### 风险识别

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| [风险1] | [影响] | [方案] |
| [风险2] | [影响] | [方案] |

---

## 七、决策记录 (ADR)

### ADR-1: 为什么选择 Provider 模式？

**背景**：需要支持多条链的 token 搜索

**决策**：采用 Provider 模式，每条链一个实现

**结果**：易于扩展新链，测试隔离性好

---

## 八、参考资源

- 架构设计：[ARCHITECTURE_OVERVIEW.md](../../../ARCHITECTURE_OVERVIEW.md)
- 开发流程：[DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md)
- 模块设计：[MODULE_DESIGN_TEMPLATE.md](../MODULE_DESIGN_TEMPLATE.md)
- 测试规范：[TESTING_STANDARDS.md](../TESTING_STANDARDS.md)
- 安全规范：[SECURITY_STANDARDS.md](../SECURITY_STANDARDS.md)
- 代码规范：[CODING_STANDARDS.md](../DEV_STANDARDS.md)

---

## 九、附录

### 样本模板

在 test-data.md 中使用以下格式：

```markdown
### Happy Path - {场景描述}

\`\`\`json
{
  "input": { /* ... */ },
  "output": { /* ... */ },
  "description": "标准流程"
}
\`\`\`
```

---

**上次修改**：[日期]  
**修改者**：[名字/AI Agent]
