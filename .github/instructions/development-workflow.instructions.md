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
