# address-search 测试样本

## Happy

1. H1: address check batch 返回 eoa/erc20 两种类型，并包含资产列表。
2. H2: 单网络批量余额查询：2 个地址 x 2 个资产（含 native）一次返回。
3. H3: 混合网络批量余额查询：eth+bsc 按 network 分组并发返回，且顺序与输入一致。
4. H4: 未传 `assetListResolver` 时，`queryAddressCheck` 可通过 Alchemy 返回 network 对应 token 资产列表。
5. H5: 未传 `network` 时，`queryAddressCheck` 会按配置网络列表调用 Alchemy。
6. H6: 余额阶段 metadata 缺失时，按本地/Multicall/token-search 顺序补全 decimals 等字段。
7. H7: 当资产已带预置余额（如 Alchemy tokenBalance）时，余额阶段跳过对应 token 的 batch balance 查询。

## Edge

1. E1: `assest` 拼写字段也可被识别为资产列表输入。
2. E2: 资产列表缺失时，可由 `includeNative=true` 自动补 native。
3. E3: `queryAddressCheck` 在地址类型探测失败时降级 `unknown`，不抛异常。
4. E4: Alchemy 返回无效 token 地址时会被过滤，不影响其它资产。
5. E5: 未传 `network` 的地址查询会按资产 `extra.network` 分组后再查余额并合并。

## Invalid

1. I1: `queryAddressBalanceByNetwork` 的 batch 不是数组时抛错。
2. I2: 批量项缺少 network（用于 `queryAddressBalance`）时抛错。
3. I3: address 非法时抛错。
4. I4: Alchemy 异常时 `queryAddressCheck` 仍返回 ok=true。

## Security

1. S1: 输出中不回传 options 私有上下文字段。
2. S2: 资产 extra 字段仅透传业务扩展字段，不自动注入敏感配置。
