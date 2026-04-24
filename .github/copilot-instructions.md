# Copilot Collaboration Workflow

本仓库的开发协作必须遵循以下流程，默认适用于 packages/core 下的 modules、apps、execute、tasks、cli 与对应 test 目录。

## 固定流程

1. 先确认需求，不直接写代码。
2. 先准备或更新测试数据。
3. 先把本次开发计划写到对应测试目录下的 dev.md。
4. 计划经确认后，再开始实现。
5. 实现后先跑新增测试，再跑受影响测试。
6. 最后汇总本次变更函数、测试、风险与下一步。

## 开发约束

1. 未更新对应 test 目录下的 dev.md 前，不进入正式实现。
2. 未准备 happy / invalid / edge / security 样本前，不进入正式实现。
3. task 与 cli 只做编排和暴露，不承载核心业务逻辑。
4. 新能力优先放到 apps、modules 等对应层，不允许临时散落。
5. 如需求涉及缓存、fallback、批量优化，必须在计划中明确写出查询顺序和失效策略。
6. 若用户要求“继续某模块开发”，必须先读取该模块 test 目录下的 dev.md 与测试数据文件，再继续。
7. 若本次对话未完成“需求/样本/计划”三步，只允许做文档与样本编辑，不允许直接进入业务实现。
8. 未经用户明确确认，不得跨切片同时实现多个能力（例如 token meta / price / risk 不得混做）。

## 交付格式

每次进入实现前，Copilot 必须先与用户完成以下对齐：

1. 本次只做什么
2. 本次不做什么
3. 测试数据文件位置
4. 开发计划文件位置
5. 验收标准

每次实现完成后，Copilot 必须给出：

1. 本次变更函数列表
2. 对应测试列表
3. 未完成项与风险点
4. 下一步建议

## 对应计划文件规则

1. 每个模块在对应 test 目录下维护 dev.md。
2. 需求、测试数据、切片计划、当前进度、下一步都写在该文件。
3. 若用户要求继续某模块开发，优先读取该模块的 dev.md，再继续。

## token-price 模块特别规则

路径：packages/core/src/test/apps/offchain/token-price/

1. 先看 dev.md 与 price-test-data.md。
2. token meta / price / risk 必须分切片开发，不允许一次性混做。
3. token 查询默认采用：配置优先 -> 本地缓存 -> RPC / 第三方接口 -> 回写缓存。
4. 当前默认只允许先做 Slice A：token meta；price 与 risk 需单独确认后再实现。

