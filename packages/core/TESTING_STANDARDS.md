# 测试规范

**最后更新**: 2026-04-25

本文档定义了所有测试的标准，包括样本类型、框架、覆盖率等。

---

## 一、测试样本的四种类型

### 1.1 Happy Path（正常流）

**目的**：验证功能在正常情况下的行为

**特征**：
- 标准输入
- 预期成功
- 标准输出

**示例**：

```markdown
### Happy Path 1: 查询常见代币价格

**输入**
```javascript
{
  token: "USDC",
  network: "evm"
}
```

**预期输出**
```javascript
{
  priceUsd: 1.00,
  source: "coingecko",
  timestamp: "2026-04-25T10:00:00Z",
  error: null
}
```

**说明**: USDC 是稳定币，价格应该接近 1 USD
```

**最少数量**：每个模块至少 1 个

### 1.2 Edge Cases（边界情况）

**目的**：验证系统在边界条件下的行为

**特征**：
- 非标准但合法的输入
- 应该优雅降级或返回合理结果
- 不应该崩溃

**常见类型**：

#### 空值处理
```markdown
### Edge Case 1: 空字符串 Token

**输入**
```javascript
{
  token: "",
  network: "evm"
}
```

**预期**
```javascript
{
  error: "token cannot be empty",
  status: 400
}
```
```

#### 超大值
```markdown
### Edge Case 2: 超大数值

**输入**
```javascript
{
  amount: "999999999999999999999999999999"
}
```

**预期**
```javascript
{
  amount: "9.99...e+29", // 科学计数法表示
  error: null
}
```
```

#### 缺少可选字段
```markdown
### Edge Case 3: 缺少可选字段

**输入**
```javascript
{
  token: "USDC"
  // network 字段缺少，应该使用默认值
}
```

**预期**
```javascript
{
  priceUsd: 1.00,
  network: "evm" // 使用默认值
}
```
```

#### 极小值 / 特殊值
```markdown
### Edge Case 4: 零值

**输入**
```javascript
{
  amount: 0
}
```

**预期**
```javascript
{
  amount: 0,
  error: null
}
```
```

**最少数量**：每个模块至少 3 个

### 1.3 Invalid Cases（非法输入）

**目的**：验证系统对非法输入的拒绝能力

**特征**：
- 违反类型或约束的输入
- 应该被明确拒绝
- 错误消息要清晰

**常见类型**：

#### 类型错误
```markdown
### Invalid Case 1: 类型错误

**输入**
```javascript
{
  amount: "not a number", // 应该是 number
  network: "evm"
}
```

**预期**
```javascript
{
  error: "amount must be a number",
  status: 400,
  code: "INVALID_TYPE"
}
```
```

#### 非法字段
```markdown
### Invalid Case 2: 未知字段

**输入**
```javascript
{
  token: "USDC",
  invalidField: "xyz"
}
```

**预期**
```javascript
{
  error: "unknown field: invalidField",
  status: 400,
  allowedFields: ["token", "network", ...]
}
```
```

#### 违反约束
```markdown
### Invalid Case 3: 超出范围

**输入**
```javascript
{
  slippage: 50 // 应该在 0-1 之间（百分比）
}
```

**预期**
```javascript
{
  error: "slippage must be between 0 and 1",
  status: 400
}
```
```

#### 非法状态
```markdown
### Invalid Case 4: 操作顺序错误

**输入**
```javascript
{
  operation: "confirm",
  txHash: undefined // 必须先 execute，才能 confirm
}
```

**预期**
```javascript
{
  error: "cannot confirm without execution",
  status: 409
}
```
```

**最少数量**：每个模块至少 3 个

### 1.4 Security Cases（敏感字段处理）

**目的**：验证敏感数据是否被正确隐藏

**特征**：
- 输入包含私密信息
- 验证输出中不含私密信息
- 验证日志中不含私密信息

**常见类型**：

#### privateKey 泄露
```markdown
### Security Case 1: privateKey 不应泄露

**输入**
```javascript
{
  wallet: {
    address: "0x1234567890abcdef",
    privateKey: "0xabcdefg123456" // 敏感
  }
}
```

**预期输出**
```javascript
{
  wallet: {
    address: "0x1234567890abcdef"
    // privateKey 完全不出现
  }
}
```

**验证**
```javascript
// 确保 JSON.stringify(output) 中不包含 0xabcdefg123456
assert(!JSON.stringify(output).includes("0xabcdefg123456"));
```
```

#### Mnemonic 泄露
```markdown
### Security Case 2: Mnemonic 不应泄露

**输入**
```javascript
{
  seed: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
}
```

**预期**
- 输出中无 mnemonic
- 日志中无 mnemonic
- 错误消息中无 mnemonic
```

#### 密码泄露
```markdown
### Security Case 3: 密码不应泄露到日志

**输入**
```javascript
{
  password: "mysecretpassword123"
}
```

**预期**
- 日志中应该显示 "***" 或 "[REDACTED]"
- 错误消息中只显示 "[REDACTED]"
```

**最少数量**：每个模块至少 2 个

---

## 二、测试代码框架

### 2.1 使用 node:test

```javascript
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("Module Name", () => {
  // Happy Path 测试
  describe("Happy Path", () => {
    it("should query token price successfully", async () => {
      const result = await myModule.getPrice({ token: "USDC" });
      assert.equal(result.priceUsd, 1.00);
      assert.equal(result.error, null);
    });

    it("should handle multiple tokens", async () => {
      const result = await myModule.getPrices(["USDC", "USDT"]);
      assert.equal(result.length, 2);
    });
  });

  // Edge Cases 测试
  describe("Edge Cases", () => {
    it("should handle null token gracefully", async () => {
      const result = await myModule.getPrice({ token: null });
      assert(result.error !== null);
    });

    it("should handle large amounts", async () => {
      const result = await myModule.getPrice({
        amount: "999999999999999999999999"
      });
      assert(result.amount !== undefined);
    });

    it("should use default network when not provided", async () => {
      const result = await myModule.getPrice({ token: "USDC" });
      assert.equal(result.network, "evm"); // 默认值
    });
  });

  // Invalid Cases 测试
  describe("Invalid Cases", () => {
    it("should reject non-string token", async () => {
      const result = await myModule.getPrice({ token: 123 });
      assert.match(result.error, /must be string/);
    });

    it("should reject unknown network", async () => {
      const result = await myModule.getPrice({
        token: "USDC",
        network: "invalid-network"
      });
      assert.match(result.error, /unknown network/);
    });
  });

  // Security Cases 测试
  describe("Security Cases", () => {
    it("should not leak privateKey in output", async () => {
      const input = {
        wallet: {
          address: "0x123...",
          privateKey: "0xsecret..."
        }
      };
      const result = await myModule.process(input);
      
      // 检查所有输出中都没有私钥
      const jsonStr = JSON.stringify(result);
      assert(!jsonStr.includes("0xsecret"));
      assert(!result.wallet?.privateKey);
    });

    it("should not include password in error messages", async () => {
      const input = { password: "mysecret" };
      try {
        await myModule.validate(input);
      } catch (err) {
        assert(!err.message.includes("mysecret"));
      }
    });
  });
});
```

### 2.2 生命周期钩子

```javascript
describe("Module with Setup/Teardown", () => {
  let testData;

  // 所有测试前执行一次
  before(async () => {
    console.log("Setting up test environment");
    testData = await loadTestFixtures();
  });

  // 所有测试后执行一次
  after(async () => {
    console.log("Tearing down test environment");
    await cleanupTestData();
  });

  // 每个测试前执行
  beforeEach(() => {
    console.log("Preparing for each test");
    // 重置状态
  });

  // 每个测试后执行
  afterEach(() => {
    console.log("Cleaning up after each test");
  });

  it("test 1", () => {
    // 使用 testData
  });
});
```

### 2.3 异步测试

```javascript
import { describe, it } from "node:test";

describe("Async Operations", () => {
  it("should await promises", async () => {
    const result = await fetchData();
    assert.ok(result);
  });

  it("should handle errors", async () => {
    assert.rejects(
      async () => await failingFunction(),
      /expected error message/
    );
  });

  it("should timeout on slow operations", {timeout: 5000}, async () => {
    // 这个测试最多等待 5 秒
  });
});
```

---

## 三、覆盖率标准

### 3.1 覆盖率目标

| 类型 | 目标 | 说明 |
|------|------|------|
| **语句覆盖** | > 80% | 至少执行 80% 的代码行 |
| **分支覆盖** | > 75% | 至少覆盖 75% 的 if/else 分支 |
| **函数覆盖** | > 85% | 至少调用 85% 的函数 |
| **行覆盖** | > 80% | 至少覆盖 80% 的代码行 |

### 3.2 检查覆盖率

```bash
# 使用 c8 测试覆盖工具
npm install --save-dev c8

# 运行测试并生成覆盖率报告
c8 node --test "src/test/**/*.test.mjs"

# 生成 HTML 报告
c8 report --reporter=html
```

### 3.3 识别覆盖不足的代码

```bash
# 查看未覆盖的代码
c8 report --reporter=text-summary
```

输出示例：
```
────────────────────────────────────────────────
File                    | % Stmts | % Branch | % Funcs | % Lines |
────────────────────────────────────────────────
All files               |   82.1 |     76.5 |    85.3 |    82.0 |
 src/modules/foo       |   78.5 |     70.0 |    80.0 |    78.0 | ← 低于目标
────────────────────────────────────────────────
```

---

## 四、测试命名规范

### 4.1 测试文件命名

```
{module-name}.test.mjs              ← 单元测试
{module-name}.integration.test.mjs  ← 集成测试
{feature-name}.e2e.test.mjs         ← 端对端测试
```

### 4.2 测试用例命名

```javascript
// ✅ 好
it("should return price when token exists", async () => {});
it("should reject when token is null", async () => {});
it("should not leak privateKey in output", async () => {});

// ❌ 差
it("test1", async () => {}); // 不清晰
it("query price", async () => {}); // 不完整
it("works", async () => {}); // 没有说明
```

### 4.3 describe 分组

```javascript
describe("TokenPriceModule", () => {
  describe("Happy Path", () => {
    it("should...", () => {});
  });

  describe("Edge Cases", () => {
    it("should...", () => {});
  });

  describe("Security", () => {
    it("should not leak privateKey", () => {});
  });
});
```

---

## 五、常见断言

```javascript
import assert from "node:assert/strict";

// 相等性
assert.equal(a, b);           // a === b
assert.deepEqual(obj1, obj2); // 深度相等
assert.notEqual(a, b);        // a !== b

// 真假值
assert.ok(value);             // value 是 truthy
assert.strictEqual(true, true);

// 错误检查
assert.throws(() => fn());           // 应该抛出错误
assert.rejects(asyncFn());           // 异步函数应该被拒绝
assert.doesNotThrow(() => fn());     // 不应该抛出错误

// 字符串匹配
assert.match(str, /pattern/);        // 字符串匹配正则
assert.doesNotMatch(str, /pattern/); // 字符串不匹配

// 数组检查
assert(Array.isArray(value));        // 是数组
assert.deepStrictEqual(arr, [1,2]); // 数组内容相等

// 存在性
assert(value !== null);     // 不是 null
assert(value !== undefined); // 不是 undefined
```

---

## 六、测试数据管理

### 6.1 测试数据位置

```
src/test/modules/{module}/
  ├─ test-data.md          ← 所有测试样本定义
  ├─ __fixtures__.mjs      ← 导出的测试数据
  ├─ {module}.test.mjs     ← 测试代码
  └─ index.mjs             ← 可选：测试工具函数
```

### 6.2 test-data.md 格式

```markdown
### Happy Path 1

\`\`\`json
{
  "name": "query-usdc",
  "input": { "token": "USDC" },
  "output": { "priceUsd": 1.00 },
  "description": "标准查询"
}
\`\`\`

### Edge Case 1

\`\`\`json
{
  "name": "null-token",
  "input": { "token": null },
  "shouldError": true,
  "errorPattern": "token.*required"
}
\`\`\`
```

### 6.3 从 test-data.md 加载

```javascript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadTestData() {
  const md = fs.readFileSync(
    path.join(__dirname, "test-data.md"),
    "utf-8"
  );
  
  // 解析 Markdown 中的 JSON code blocks
  const jsonBlocks = md.match(/```json\n([\s\S]*?)\n```/g) || [];
  
  return jsonBlocks.map(block => {
    const json = block.replace(/```json\n/, "").replace(/\n```/, "");
    return JSON.parse(json);
  });
}
```

---

## 七、测试工作流

```
1. 准备测试样本
   └─ 写 test-data.md（4 种样本）

2. 编写测试代码
   └─ 写 *.test.mjs（导入样本，编写测试）

3. 运行测试（TDD 方式）
   ├─ 测试应该失败（因为功能还没实现）
   └─ 实现功能，测试通过

4. 检查覆盖率
   └─ c8 report（应该 > 80%）

5. 回归测试
   └─ 验证没有破坏现有功能
```

---

## 八、调试失败的测试

### 8.1 查看详细日志

```bash
# 增加日志输出
node --test --reporter=spec src/test/modules/foo/foo.test.mjs

# 查看完整错误信息
node --test --no-warnings src/test/modules/foo/foo.test.mjs
```

### 8.2 运行单个测试

```javascript
// 使用 only 运行单个测试
it.only("should focus on this test", async () => {
  // 其他测试不会运行
});

// 使用 skip 跳过某个测试
it.skip("should skip this", async () => {
  // 这个测试被跳过
});
```

### 8.3 增加调试信息

```javascript
it("should calculate correctly", async () => {
  const input = { amount: 100 };
  const result = myModule.calculate(input);
  
  console.log("Input:", JSON.stringify(input));
  console.log("Result:", JSON.stringify(result));
  
  assert.equal(result.total, 100);
});
```

---

## 相关文档

- [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) - 开发流程
- [SECURITY_STANDARDS.md](SECURITY_STANDARDS.md) - 安全规范
- [CODING_STANDARDS.md](../DEV_STANDARDS.md) - 代码规范
