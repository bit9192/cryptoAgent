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
