### Slice TRX-A1：TRX token metadata batch 接入 multicall 聚合

本次只做：

1. 新增 TRX multicall 只读调用 helper。
2. 在 `apps/trx/assets/token-metadata.mjs` 的 `queryTrxTokenMetadataBatch` 中优先走 multicall 聚合读取 `name/symbol/decimals`。
3. multicall 不可用、非 mainnet、或子调用失败时，降级回现有逐条读取逻辑。
4. 保持单条 `queryTrxTokenMetadata` 行为不变。

本次不做：

1. `queryTrxTokenBalanceBatch` 接入 multicall。
2. 修改 TRX token search 主链路。
3. 改动 task/search 对外协议。

验收标准：

1. metadata batch happy path 可通过单次 multicall 返回多 token 元信息。
2. partial failure 只影响对应 token，其他 token 继续返回。
3. multicall 抛错时自动降级到现有单条读取实现。
4. `src/test/apps/trx/trc20-assets.test.mjs` 回归通过。