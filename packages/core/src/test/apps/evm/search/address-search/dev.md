# apps/evm/search/address-search 开发计划

## 当前切片计划

### Slice EAS-1：address check + address balance 批量接口（先单网络批量）

本次只做：

1. 新增 `queryAddressCheck` 与 `queryAddressCheckBatch`（search 域）。
2. `queryAddressCheck` 输出地址类型与资产列表，资产对象保留扩展字段（`extra`）。
3. 新增 `queryAddressBalanceByNetwork`，输入 `([address+assets], network)`，在单网络内走一次批量余额查询。
4. 新增 `queryAddressBalance`，输入 `[address+assets+network]`，先按 network 分组，再并发请求并按输入顺序返回。
5. 余额结果支持原生 token（`native`）与 ERC20。

本次不做：

1. ERC721/ERC1155 tokenId 明细拉取。
2. 自动发现全量持仓（依赖外部索引源）。
3. 风险评分与安全分析。

验收标准：

1. 两个接口均支持批量输入。
2. `queryAddressBalanceByNetwork` 可在单网络内批量返回多地址多资产余额。
3. `queryAddressBalance` 可按 network 分组并发执行，结果顺序与输入一致。
4. 资产列表字段稳定，支持后续扩展。

### Slice EAS-2：address check 默认接入 Alchemy 地址资产发现

本次只做：

1. 新增 Alchemy 地址资产查询适配（search 子模块）。
2. `queryAddressCheck` 在未提供 `assetListResolver` 时，默认尝试通过 Alchemy 按 `address+network` 拉取 token 资产列表。
3. Alchemy 失败时静默降级，不抛异常；仍返回基础资产（如 native / erc20 自身）。
4. 新增可注入钩子 `alchemyGetAddressAssets`，用于测试和运行时替换。

本次不做：

1. NFT（ERC721/ERC1155）资产明细。
2. Alchemy 分页翻页聚合（先返回单页）。
3. 多源资产合并冲突策略。

验收标准：

1. `queryAddressCheck` 可在 `network` 维度返回 Alchemy 资产列表。
2. 不传 `assetListResolver` 也能有地址资产发现能力。
3. Alchemy 报错时可降级，不影响主流程返回。

### Slice EAS-3：无 network 的多网络发现 + 余额后 metadata 三级补全

本次只做：

1. `queryAddressCheck` 在未指定 `network` 时，Alchemy 资产发现按配置网络列表批量查询（而不是单网络）。
2. `queryAddressBalanceByNetwork` 在余额查询后，按 `network` 维度对 token 先查本地 token book，缺失再走 multicall metadata，仍缺失再走 token-search 接口补全。
3. `createEvmAddressSearchProvider.searchAddress` 在未指定 `network` 时，按资产的 `extra.network` 归集为多网络批量余额查询并合并输出。

本次不做：

1. Alchemy 分页多页聚合。
2. NFT metadata 补全。
3. 跨链统一价格估值。

验收标准：

1. 未传 `network` 时，Alchemy 调用接收到配置网络数组。
2. metadata 缺失时可通过 token-search 回补 `symbol/name/decimals`。
3. 未传 `network` 的地址查询结果可按资产所属网络完成余额查询并输出。

### Slice EAS-4：余额查询复用预置余额并按需跳过批量 RPC

本次只做：

1. `queryAddressBalanceByNetwork` 对资产中已存在的预置余额（如 `extra.alchemyTokenBalance`）直接复用。
2. 仅对缺失余额的 token 构建 `queryBalanceBatch` 请求。
3. 当本批次资产均有预置余额时，跳过 `queryBalanceBatch` 调用。

本次不做：

1. 预置余额可信度评分。
2. 链上余额与预置余额冲突诊断。
3. 跨源余额优先级配置化。

验收标准：

1. 全量预置余额场景不会触发 `queryBalanceBatch`。
2. 输出 `rawBalance/formatted` 仍可正确生成。
3. 现有地址查询与批量查询测试全部通过。
