# tasks/search 开发计划

目标：把 tasks/search 保持为链无关编排层，逐步移除中心化链分支，仅保留参数整理、批量分组、统一输出包装。

## 1. 当前范围

1. `searchTask*` 负责 search-engine facade 封装。
2. 地址余额、估值、组合汇总仍在 task 层编排。
3. 各链 address pipeline 与 valuation builder 已下沉到各自 `apps/*/search/`。

## 2. 测试样本与测试文件

1. 测试样本：`src/test/tasks/search/test.data.md`
2. 测试文件：`src/test/tasks/search/search.test.mjs`
3. 当前测试以 mock engine / mock batch reader 为主，重点验证 task 编排而非真实链调用。

## 3. 切片计划

### Slice TS-1：批量余额 reader 注册表化（当前切片）

本次只做：

1. 去掉 `searchAddressTokenBalancesBatchTaskWithEngine()` 内部按链 `if/else` 选择 runner 的逻辑。
2. 建立批量余额 runner 注册表，按 `chain` 查找对应 runner。
3. 保留现有 `evmBatchReader` / `trxBatchReader` / `btcBatchReader` 测试注入接口，避免影响既有测试。

本次不做：

1. 估值 builder 分发改造。
2. portfolio risk extractor 注册表化。
3. 删除旧 pipeline 文件。

验收标准：

1. `tasks/search/index.mjs` 中该切片不再写死 `if (chain === "evm")` 形式的批量余额分发。
2. `search.test.mjs` 的批量余额相关测试继续通过。
3. 受影响的 search task 回归无新增失败。

### Slice TS-2：批量余额实现下沉到链模块（当前切片）

本次只做：

1. 将 EVM / BTC / TRX 的 batch-balance 实现迁移到各自 `apps/*/search/`。
2. task 层只保留 reader override 解析与按 `chain` 分发。
3. 保留现有批量余额测试和 mock 注入方式。

验收标准：

1. `tasks/search/index.mjs` 不再包含三链 batch-balance 具体实现。
2. `search.test.mjs` 相关测试继续通过。

### Slice TS-3：portfolio risk extractor 注册表化

1. 把 EVM 特有 risk flag 判断下沉到链模块。
2. task 层仅做聚合。

## 4. 当前进度 / 下一步

当前进度：

1. ✅ address pipeline 已迁移到 `apps/evm|btc|trx/search/address-pipeline.mjs`
2. ✅ valuation builder 已迁移到 `apps/evm|btc|trx/search/valuation.mjs`
3. ✅ TS-1 完成：批量余额 runner 注册表化
4. ✅ TS-3 完成：portfolio risk extractor 注册表化
5. 🔄 当前切片：TS-2 批量余额实现下沉到链模块

下一步：

1. 完成 TS-2 后，继续清理 task 层其余链实现残留