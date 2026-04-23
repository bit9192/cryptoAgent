# 模块开发计划：data-engine

## 1. 模块信息

- 模块名称：data-engine
- 所属层：modules
- 目标：为任务链提供统一的数据提取、数据运算与安全输出能力
- 关联场景：归集账户 token 余额、任务链中间结果过滤与汇总

## 2. 方案讨论记录

### 2.1 目标

- 支持任意 object 的字段提取和匹配。
- 支持任意 object 的聚合计算。
- 支持输出安全分层（阻断 private/secret 泄露到 AI/UI）。

### 2.2 输入输出契约（MVP）

- extractData(options)
  - 输入：input, sourcePath, filters, select
  - 输出：数组结果
- computeData(options)
  - 输入：input, sourcePath, filters, aggregate
  - 输出：单值或分组对象
- sanitizeForChannel(options)
  - 输入：data, channel, fieldLevels
  - 输出：已裁剪/脱敏的数据

### 2.3 边界与失败路径

- 路径不存在：返回空数组，不抛异常。
- 过滤条件非法：抛出参数错误。
- 聚合字段非数字：按失败处理，返回错误。
- groupBy 字段缺失：归入 __unknown__ 分组。

### 2.4 安全分层

- public：AI/UI/内部均可读
- internal：仅内部与受控日志
- private：仅执行链内部
- secret：仅最小运行时，输出时强制脱敏

### 2.5 兼容与迁移

- 先在 tasks 新功能中接入，不破坏旧逻辑。
- 稳定后在 execute 的统一输出阶段接入。

## 3. 测试数据计划（先于开发）

测试目录：src/test/modules/data-engine

- happy-path：余额对象中提取可转移 token
- edge-case：缺字段、空数组、0 余额
- invalid-case：非法过滤操作符
- security-case：privateKey、secretNote 字段脱敏验证

## 4. 开发任务拆解（MVP）

1. 路径解析器（支持 dot + [*]）
2. 过滤器引擎（eq/ne/gt/gte/lt/lte/in/contains/exists）
3. 提取器（select 投影）
4. 聚合器（sum/count/min/max/avg/groupBy+sum）
5. 安全裁剪器（channel + fieldLevels）

## 5. 测试任务拆解

1. 提取功能测试
2. 聚合功能测试
3. 错误路径测试
4. 安全输出测试

## 6. 验收标准

- 提取和运算通过测试
- 安全字段不泄露到 ai/ui 输出
- 具备可复用 API，能直接用于 task 链路

## 7. 后续扩展

- BigInt/Decimal 精度增强
- 规则 DSL 与 schema 校验
- 与 execute 生命周期事件联动
