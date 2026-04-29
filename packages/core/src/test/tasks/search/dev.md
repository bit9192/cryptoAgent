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

### Slice TS-2：估值 helper 注册表化

1. 将 task 层对各链 valuation helper 的依赖统一收敛到注册表。
2. 保持 `buildAssetValuationInput()` 为链无关分发表达。

### Slice TS-3：portfolio risk extractor 注册表化

1. 把 EVM 特有 risk flag 判断下沉到链模块。
2. task 层仅做聚合。

## 4. 当前进度 / 下一步

当前进度：

1. ✅ address pipeline 已迁移到 `apps/evm|btc|trx/search/address-pipeline.mjs`
2. ✅ valuation builder 已迁移到 `apps/evm|btc|trx/search/valuation.mjs`
3. 🔄 当前切片：TS-1 批量余额 reader 注册表化

下一步：

1. 完成 TS-1 后，进入 TS-2（估值 helper 注册表化的 task 清理）