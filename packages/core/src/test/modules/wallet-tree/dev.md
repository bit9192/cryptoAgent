# modules/wallet-tree 开发计划

目标：在不泄露密钥的前提下，建立 wallet tree 的会话加载与节点展示能力，并可在 lon 中稳定复用。

## 1. 模块范围

1. 从已加密 key 文件加载钱包会话
2. 生成 wallet tree 节点（chain/network/account/address）
3. 在会话层提供增量更新与查询
4. 与 key 模块保持边界：key 只负责密钥载入与解密

## 2. 测试样本与测试文件

1. 测试样本：src/test/modules/wallet-tree/testdata.md
2. 开发基线：依赖 src/test/modules/key/testdata.md 导入后的 key 文件
3. 测试文件：src/test/modules/wallet-tree/wallet-tree.test.mjs

## 3. 切片计划

### Slice WT-1：协议与样本先行（已完成）

本次只做：

1. 建立 wallet-tree dev.md
2. 建立 wallet-tree testdata.md（happy/edge/invalid/security）
3. 建立最小测试文件，校验样本门禁格式

本次不做：

1. wallet tree 业务实现
2. lon 命令接线
3. 会话缓存改造

验收标准：

1. dev/testdata/test 文件存在且可运行
2. 样本覆盖 happy/edge/invalid/security 四类

### Slice WT-2：会话加载与最小树节点（当前切片）

本次只做：

1. 从 key 会话读取基础账户
2. 生成最小 tree 节点结构

验收标准：

1. 单测覆盖空会话/单账户/多账户

### Slice WT-2R：实现迁移到 modules 层（当前切片）

本次只做：

1. 将 `buildWalletTree` 从 `tasks/wallet/tree.mjs` 迁移到 `modules/wallet-tree/index.mjs`
2. `tasks/wallet/index.mjs` 仅保留薄适配调用，不承载业务实现
3. 更新 wallet-tree 模块测试引用到 modules 路径

本次不做：

1. 变更 tree 输出结构
2. 调整 wallet.tree action 输入输出契约

验收标准：

1. wallet-tree 模块测试与 wallet.session 任务测试均通过
2. 迁移后 task 层不再持有 tree 构建业务逻辑

### Slice WT-3：lon 接线与展示

本次只做：

1. 在 lon 中接入 `wallet.tree` 展示
2. 输出结构化摘要与计数信息

本次不做：

1. 复杂交互式树 UI
2. 跨模块状态同步改造

验收标准：

1. ex:lon 可直接调用 `wallet tree`
2. 输出包含 account/chain/address 统计

## 4. 当前进度 / 下一步

当前进度：

1. 已建立 wallet-tree 开发门禁文档（WT-1）
2. 已完成 WT-2：最小 wallet tree 构建函数与任务入口
3. 已完成 WT-2R：实现迁移到 modules 层，task 保持薄适配

下一步：

1. 进入 WT-3，接入 lon 展示与回归

## 5. 开发门禁（执行前检查）

1. 先读本文件，再读 testdata.md
2. 一次只做一个切片
3. 涉及 privateKey/mnemonic/password 时必须做输出过滤
