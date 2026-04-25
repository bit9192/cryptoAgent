# 统一开发工作流

**最后更新**: 2026-04-25

本文档定义了 contractHelper 所有模块开发必须遵循的统一流程。目的是：
- 保证代码质量和测试覆盖
- 避免"同类功能不同实现"
- 使 AI 能自动按规范开发

---

## 核心原则

### "样本 → 测试 → 计划 → 实现"

```
┌──────────────────────────────────────────────────────┐
│ 阶段 1: 准备测试样本 (test-data.md)                  │
│ ├─ Happy Path: 标准输入 → 标准输出                   │
│ ├─ Edge Cases: 边界值、空值、极值                    │
│ ├─ Invalid Cases: 类型错误、非法状态                 │
│ └─ Security Cases: 敏感字段处理                      │
└──────────────────┬───────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────┐
│ 阶段 2: 编写测试代码 (*.test.mjs)                    │
│ ├─ 导入测试样本                                       │
│ ├─ TDD 方式: 先写失败的测试                          │
│ └─ 覆盖所有 4 种样本类型                             │
└──────────────────┬───────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────┐
│ 阶段 3: 编写开发计划 (dev.md)                        │
│ ├─ 明确输入、输出、边界、失败路径                    │
│ ├─ 列举所有实现切片 (S-1, S-2, ...)                  │
│ ├─ 记录设计决策理由                                  │
│ └─ 定义验收标准                                      │
└──────────────────┬───────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────┐
│ 阶段 4: 实现一个切片                                 │
│ ├─ 严格按 dev.md 计划                                │
│ ├─ 不临场扩散需求                                    │
│ └─ 不跨切片混做                                      │
└──────────────────┬───────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────┐
│ 阶段 5: 测试验证                                     │
│ ├─ 先跑该切片的测试                                  │
│ ├─ 再跑全量回归测试                                  │
│ └─ 通过后进入下一个切片                              │
└──────────────────────────────────────────────────────┘
```

---

## 一、阶段 1：准备测试样本

### 1.1 样本位置

```
src/test/modules/{module-name}/
  └─ test-data.md          ← 所有测试样本在这里

或

src/test/apps/{app-name}/
  └─ test-data.md
```

### 1.2 四种必备样本类型

#### A. Happy Path（正常流）
```markdown
### Happy Path

**输入**：标准数据
**预期**：标准输出
**说明**：正常情况下系统的行为

#### 示例 1: 查询 USDC 价格
input:
  token: "USDC"
  network: "evm"

output:
  priceUsd: 1.00
  source: "coingecko"
  
error: null
timestamp: "2026-04-25T10:00:00Z"
```

#### B. Edge Cases（边界情况）
```markdown
### Edge Cases

#### 空值处理
input:
  token: null
  network: "evm"

output:
  error: "token is required"
  
#### 超大值
input:
  amount: "999999999999999999999999"
  
output:
  amount: (科学计数法表示)

#### 缺少可选字段
input:
  token: "USDC"
  (network 字段缺少，使用默认值)

output:
  priceUsd: 1.00
  network: "evm" (使用默认值)
```

#### C. Invalid Cases（非法输入）
```markdown
### Invalid Cases

#### 类型错误
input:
  amount: "not a number"

error: "amount must be a number"

#### 非法字段
input:
  token: "USDC"
  invalidField: "xyz"

error: "unknown field: invalidField"

#### 违反约束
input:
  slippage: 50  (应该在 0-1 之间)

error: "slippage must be between 0 and 1"
```

#### D. Security Cases（敏感字段）
```markdown
### Security Cases

#### 包含私钥的输入
input:
  wallet: {
    address: "0x123...",
    privateKey: "0xabc..."  ← 敏感字段
  }

expected:
  output: {
    address: "0x123...",
    # privateKey 不应该出现在输出中
  }
  
验证: privateKey 不在任何日志或输出中
```

### 1.3 样本命名规范

```markdown
### Happy Path - {场景描述}
### Edge Case - {边界类型}
### Invalid Case - {错误类型}
### Security - {敏感数据类型}
```

### 1.4 检查清单

- [ ] 每种样本类型至少 1 个
- [ ] Happy path 应该覆盖主要功能
- [ ] Edge cases 包括：null、undefined、空值、超大值、极小值
- [ ] Invalid cases 包括：类型错误、非法字段、违反约束
- [ ] Security cases 包括：privateKey、mnemonic、password、secret
- [ ] 所有样本无真实敏感数据（都用 mock 或 placeholder）
- [ ] 样本数据格式清晰（易于测试代码读取）

---

## 二、阶段 2：编写测试代码

### 2.1 测试文件位置

```
src/test/modules/{module-name}/
  ├─ test-data.md
  ├─ {module-name}.test.mjs      ← 单元测试
  ├─ {module-name}.integration.test.mjs ← 集成测试
  └─ index.mjs                   ← 测试数据导出（可选）

src/test/apps/{app-name}/
  ├─ test-data.md
  ├─ {app-name}.test.mjs
  └─ index.mjs
```

### 2.2 测试代码框架

```javascript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  happyPathSample,
  edgeCaseSample,
  invalidCaseSample,
  securityCaseSample,
} from "./test-data.mjs";
import { myModule } from "../../modules/my-module/index.mjs";

describe("My Module", () => {
  // Happy Path 测试
  describe("Happy Path", () => {
    it("should query token price", async () => {
      const result = await myModule.getPrice(happyPathSample.input);
      assert.equal(result.priceUsd, happyPathSample.output.priceUsd);
      assert.equal(result.source, happyPathSample.output.source);
    });
  });

  // Edge Cases 测试
  describe("Edge Cases", () => {
    it("should handle null token", async () => {
      const result = await myModule.getPrice(edgeCaseSample.nullToken);
      assert.equal(result.error, "token is required");
    });

    it("should handle large amounts", async () => {
      const result = await myModule.getPrice(edgeCaseSample.largeAmount);
      // 不要崩溃，应该返回合理的值
      assert(result.amount !== undefined);
    });
  });

  // Invalid Cases 测试
  describe("Invalid Cases", () => {
    it("should reject non-numeric amount", async () => {
      const result = await myModule.getPrice(invalidCaseSample.nonNumeric);
      assert(result.error);
      assert.match(result.error, /must be a number/);
    });
  });

  // Security Cases 测试
  describe("Security Cases", () => {
    it("should not leak privateKey in output", async () => {
      const result = await myModule.process(securityCaseSample.withPrivateKey);
      
      // 检查 privateKey 不出现在任何地方
      assert(!JSON.stringify(result).includes("0xabc123def456"));
      assert(!result.wallet?.privateKey);
    });
  });
});
```

### 2.3 导入测试数据

```javascript
// src/test/modules/my-module/index.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import yaml from "js-yaml"; // 如果用 YAML 格式

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDataRaw = readFileSync(
  path.join(__dirname, "test-data.md"),
  "utf-8"
);

// 解析 Markdown 中的 YAML frontmatter 或 code blocks
export const testData = parseTestData(testDataRaw);
```

或者更简单的方式：在 test-data.md 中用 JSON 代码块：

```markdown
### Happy Path

\`\`\`json
{
  "input": { "token": "USDC" },
  "output": { "priceUsd": 1.00 }
}
\`\`\`
```

然后用脚本解析。

### 2.4 检查清单

- [ ] 测试文件使用 node:test
- [ ] 导入了 test-data.md 中的所有样本
- [ ] 覆盖了 4 种样本类型
- [ ] 每种样本至少有 1 个测试用例
- [ ] 安全测试检查敏感字段不泄露
- [ ] 测试具有描述性名称

---

## 三、阶段 3：编写开发计划

### 3.1 dev.md 文件位置

```
src/test/modules/{module-name}/
  └─ dev.md                  ← 开发计划

src/test/apps/{app-name}/
  └─ dev.md
```

### 3.2 dev.md 模板

```markdown
# {模块名} 开发计划

## 一、需求理解

### 输入
- 类型：...
- 约束：...
- 例子：...

### 输出
- 类型：...
- 格式：...
- 例子：...

### 边界
- 处理方式：...
- 失败路径：...
- 回滚策略：...

## 二、架构决策

### 是否需要 Provider 模式？
- 答：是/否
- 理由：...

### 是否涉及敏感字段？
- 答：是/否
- 字段列表：privateKey, mnemonic, ...
- 隔离策略：...

### 与哪些模块交互？
- Request Engine：是/否
- Context Engine：是/否
- 其他模块：...

## 三、实现切片

### S-1: {功能描述}
- 输入：...
- 输出：...
- 验收标准：...
- 预估工作量：...

### S-2: {功能描述}
- ...

## 四、测试覆盖

- Happy Path：[S-1, S-2, ...]
- Edge Cases：[S-1, ...]
- Invalid Cases：[S-1, ...]
- Security Cases：[S-1, ...]

## 五、定义完成 (DoD)

- [ ] test-data.md 已准备
- [ ] *.test.mjs 已编写
- [ ] 所有测试通过
- [ ] 字段隔离检查通过
- [ ] 文档已更新

## 进度跟踪

| 切片 | 状态 | 验收日期 |
|------|------|---------|
| S-1 | 未开始 | - |
| S-2 | 未开始 | - |
```

### 3.3 检查清单

- [ ] 需求理解是否明确
- [ ] 所有输入/输出是否定义
- [ ] 是否列举了所有切片
- [ ] 是否有明确的验收标准
- [ ] 是否考虑了错误处理

---

## 四、阶段 4：实现一个切片

### 4.1 实现规则

1. **一次只实现一个切片**
   - ❌ 不要同时做 S-1 + S-2
   - ✅ 完成 S-1 → 测试通过 → 进入 S-2

2. **严格按 dev.md 计划**
   - ❌ 不要临场扩散需求
   - ✅ 如果发现新需求，先停下来更新 dev.md

3. **保持代码简洁**
   - ❌ 不要混合多个关注点
   - ✅ 单一职责原则

### 4.2 代码位置

```
src/modules/{module-name}/
  ├─ index.mjs           ← 导出
  ├─ core.mjs            ← 核心逻辑
  ├─ provider.mjs        ← 如果需要多链适配
  └─ types.mjs           ← 类型定义（可选）

src/apps/{app-name}/
  ├─ index.mjs           ← 导出
  ├─ provider.mjs        ← 链适配
  └─ ...

src/tasks/{task-domain}/
  └─ index.mjs           ← Task 定义
```

### 4.3 检查清单

- [ ] 代码是否遵循命名规范？（[CODING_STANDARDS.md](CODING_STANDARDS.md)）
- [ ] 是否有足够的注释？
- [ ] 是否涉及敏感字段输出？（需要 sanitize）
- [ ] 错误处理是否完善？

---

## 五、阶段 5：测试验证

### 5.1 测试命令

```bash
# 运行单个模块的测试
node --test src/test/modules/{module-name}/{module-name}.test.mjs

# 运行该模块的全部测试
node --test "src/test/modules/{module-name}/**/*.test.mjs"

# 运行全量回归测试
node --test "src/test/**/*.test.mjs"
```

### 5.2 验收标准

- ✅ 当前切片测试全部通过
- ✅ 回归测试无新增失败
- ✅ 代码覆盖率 > 80%
- ✅ 敏感字段未泄露
- ✅ 文档更新完成

### 5.3 检查清单

- [ ] 新增测试是否通过？
- [ ] 回归测试是否通过？
- [ ] 是否有新的警告或错误？
- [ ] 文档是否已更新？

---

## 六、门禁检查（AI 每次开发时必须通过）

```
开始开发前检查：

├─ dev.md 是否存在？
│  └─ 如果不存在 → 停止，先创建 dev.md
│
├─ test-data.md 是否存在？
│  └─ 如果不存在 → 停止，先创建 test-data.md
│
├─ 样本覆盖率是否 >= 80%？
│  └─ 如果不足 → 停止，先补充样本
│
├─ 是否明确了本次开发的切片？
│  └─ 如果不明确 → 停止，先在 dev.md 中明确
│
└─ 是否已有测试代码？
   └─ 如果没有 → 停止，先编写测试代码
```

**如果任何门禁未通过，则不进入实现阶段。**

---

## 七、违反流程的后果

| 违反行为 | 后果 |
|---------|------|
| 跳过测试样本准备 | 测试覆盖不足，隐藏 BUG |
| 跳过测试代码 | 实现时无法验证，返工成本高 |
| 跳过 dev.md 计划 | 临场修改需求，代码质量差 |
| 一次实现多个切片 | 难以定位问题，回退困难 |
| 跳过回归测试 | 影响其他模块，难以追溯 |

---

## 八、快速参考

### 我现在要开发什么？

**1. 新模块（如 Request Engine）**
   ```
   1. 创建 src/test/modules/request-engine/ 目录
   2. 编写 test-data.md（测试样本）
   3. 编写 *.test.mjs（测试代码）
   4. 编写 dev.md（开发计划）
   5. 按切片实现
   ```

**2. 现有模块的新功能（如 Token Search）**
   ```
   1. 在 src/test/modules/search-engine/token-search/ 中
   2. 更新 test-data.md
   3. 更新 *.test.mjs
   4. 更新 dev.md（添加新切片）
   5. 按切片实现
   ```

**3. 新 Task**
   ```
   1. 在 src/test/tasks/{domain}/ 中
   2. 编写 test-data.md（task 入参示例）
   3. 编写 *.test.mjs
   4. 编写 dev.md
   5. 在 src/tasks/{domain}/index.mjs 中实现
   ```

---

## 九、相关文档

- [ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md) - 系统整体设计
- [CODING_STANDARDS.md](CODING_STANDARDS.md) - 代码规范
- [TESTING_STANDARDS.md](TESTING_STANDARDS.md) - 测试规范
- [SECURITY_STANDARDS.md](SECURITY_STANDARDS.md) - 安全规范
- [MODULE_DESIGN_TEMPLATE.md](MODULE_DESIGN_TEMPLATE.md) - 模块设计指南
- [TASK_DEFINITION_GUIDELINES.md](TASK_DEFINITION_GUIDELINES.md) - Task 定义指南

---

**最后记住**：这个流程存在的目的是保证**代码质量、可维护性和可测试性**。每一步都很重要，不能跳过。
