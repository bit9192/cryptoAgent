# trade-search 测试样本（ETS-T1）

目标：按 `tokenAddress + network` 查询交易对，校验 network 过滤、流动性排序、limit 截断与参数错误行为。

## happy-path

### h1: bsc token address 查询可返回 trade items

- network: bsc
- tokenAddress: 0x55d398326f99059ff775485246999027b3197955

### h2: eth token address 查询可返回 trade items

- network: eth
- tokenAddress: 0xdac17f958d2ee523a2206206994597c13d831ec7

## edge-case

### e1: mixed-case 地址输入应被接受

- network: bsc
- tokenAddress: 0x72449ED79841981B19d4552861007A63Da3963fE

### e2: limit 截断

- network: eth
- tokenAddress: 0x39AA39c021dfbaE8faC545936693aC917d5E7563
- limit: 1

### e3: 同 token 多个 pair，按 liquidityUsd 降序

- network: bsc
- tokenAddress: 0xfd5840cd36d94d7229439859c0112a4185bc0255

## invalid-case

### i1: network 缺失

- tokenAddress: 0x55d398326f99059ff775485246999027b3197955
- expected: 抛 TypeError

### i2: 非法地址

- network: bsc
- tokenAddress: 0x123
- expected: 返回空数组

## security-case

### s1: 远端 source 抛错时，不透出敏感字段

- network: bsc
- tokenAddress: 0x55d398326f99059ff775485246999027b3197955
- source error message (mock): "apiKey=SECRET_TOKEN"
- expected: provider 返回空数组（或可预测降级），不把原始敏感信息透给外层

## summary-case（ETS-T2）

### s2-h1: summary 返回 top pair 与总量

- network: bsc
- tokenAddress: 0x55d398326f99059ff775485246999027b3197955
- expected:
	- pairCount > 0
	- topDex/topPairAddress 有值
	- totalLiquidityUsd >= liquidityUsd
	- totalVolume24h >= volume24h

### s2-i1: network 缺失时报错

- tokenAddress: 0x55d398326f99059ff775485246999027b3197955
- expected: 抛 TypeError

### s2-e1: 无 pair 时返回空摘要

- network: eth
- tokenAddress: 0xdac17f958d2ee523a2206206994597c13d831ec7
- expected:
	- pairCount = 0
	- topDex/topPairAddress = null
	- totalLiquidityUsd/totalVolume24h = 0

## two-hop-route-case（ETS-T3）

### t3-h1: token 通过中间资产可达 USDT

- network: bsc
- tokenAddress: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- first hop: B/WBNB
- second hop: WBNB/USDT
- expected:
	- routes.length >= 1
	- route[0].intermediateToken.symbol = WBNB
	- route[0].targetSymbol = USDT

### t3-i1: network 缺失时报错

- tokenAddress: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- expected: 抛 TypeError

### t3-e1: 第二跳不存在时返回空数组

- network: bsc
- tokenAddress: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- first hop: B/WBNB
- second hop: WBNB 无 USDT pair
- expected: routes = []

## multi-source-and-config-case（ETS-T4）

### t4-h1: 多 offchain source 可合并结果

- network: bsc
- tokenAddress: 0x55d398326f99059ff775485246999027b3197955
- source A: 返回 pairA
- source B: 返回 pairB
- expected: 合并后 items.length >= 2（去重后）

### t4-h2: 可读取 network dex config

- network: bsc
- expected: dex config 至少包含 1 个 enabled dex（建议 1~3 个）

### t4-e1: offchain 无结果且开启 onchain fallback 时调用独立链上函数

- network: bsc
- tokenAddress: 0xF89712b7C0b6136E1436a8c4E3f4B9C1a1276dfC
- offchain: []
- onchain fallback: mock 返回 1 条 pair
- expected: items.length >= 1

### t4-e2: offchain 无结果且未开启 onchain fallback 时返回空

- network: bsc
- tokenAddress: 0xc353950E65Ad19D4FC57Ce655Be474831ADC26Cc
- offchain: []
- expected: items = []

## onchain-multicall-case（ETS-T5）

### t5-h1: 同一 dex 下多 quote 的 getPair 使用一次 multicall 聚合

- network: bsc
- tokenAddress: 0xfc69c8a4192130f5d3295876bec43f22704df1e2
- dex quotes: [USDT, WBNB]
- multicall result: USDT=zero, WBNB=validPair
- expected:
	- 返回 1 条 pair（WBNB）
	- 不因 USDT 子调用失败或空结果中断

### t5-e1: multicall 子调用失败降级

- network: bsc
- tokenAddress: 0xfc69c8a4192130f5d3295876bec43f22704df1e2
- multicall result: one null / one valid
- expected:
	- 仅保留有效 pair
	- 整体不抛异常

## onchain-reserves-multicall-case（ETS-T6）

### t6-h1: 命中 pair 后批量读取 token0/token1/getReserves

- network: bsc
- tokenAddress: 0xfc69c8a4192130f5d3295876bec43f22704df1e2
- quote: USDT
- multicall stage1: getPair 命中 validPair
- multicall stage2: token0/token1/getReserves 返回可用储备
- expected:
	- 输出含 priceUsd/liquidityUsd（非 null）
	- multicall 分两批调用（pair + reserves）

### t6-e1: reserve 批量失败降级

- network: bsc
- tokenAddress: 0xfc69c8a4192130f5d3295876bec43f22704df1e2
- multicall stage1: getPair 命中 validPair
- multicall stage2: 抛错
- expected:
	- 仍返回 pair 基础信息
	- priceUsd/liquidityUsd 为 null

## onchain-decimals-multicall-case（ETS-T7）

### t7-h1: 非 18 位 decimals 使用链上批量结果参与估算

- network: bsc
- tokenAddress: 0xfc69c8a4192130f5d3295876bec43f22704df1e2
- multicall stage1: getPair 命中 validPair
- multicall stage2: token0/token1/getReserves 返回可用储备
- multicall stage3: decimals 返回 token0=9, token1=6
- expected:
	- priceUsd/liquidityUsd 基于链上 decimals 计算正确
	- 不依赖默认 18 位

### t7-e1: decimals 批量失败降级

- network: bsc
- tokenAddress: 0xfc69c8a4192130f5d3295876bec43f22704df1e2
- stage1/stage2 成功，stage3 抛错
- expected:
	- 仍返回 pair 基础结果
	- 按回退 decimals 路径计算或降级，不抛异常

## onchain-anchor-usd-case（ETS-T8）

### t8-h1: WBNB quote 通过 WBNB/USDT 池锚定 USD

- network: bsc
- 主 pair: TOKEN/WBNB
- anchor pair: WBNB/USDT
- expected:
	- 主 pair 返回非 null 的 priceUsd/liquidityUsd
	- 数值与 anchor 池比率一致

### t8-e1: anchor 池失败降级

- network: bsc
- 主 pair: TOKEN/WBNB
- anchor 查询失败
- expected:
	- 主 pair 仍返回
	- priceUsd/liquidityUsd 降级为 null

## onchain-decimals-cache-case（ETS-T9）

### t9-h1: 第二次调用 searchOnchainLiquidityPairs 时 cache 命中，decimals multicall 不再触发

- network: bsc
- 两次调用同一 token 地址，注入同一 decimalsCache Map
- 第一次调用：decimals multicall 触发，结果写入 cache
- 第二次调用：所有 token 已在 cache 中，decimals multicall 批次为 0
- expected: 第二次调用中 decimals batch 不触发

### t9-e1: decimalsCache 未注入时行为与原来相同

- decimalsCache: undefined
- expected: 行为不变，decimals multicall 正常触发

## onchain-anchor-external-fallback-case（ETS-T10）

### t10-h1: anchor 池失败时 anchorPriceResolver 被调用并用于估算

- network: bsc
- 主 pair: TOKEN/WBNB
- anchor 池查询：抛错（失败）
- anchorPriceResolver: mock 返回 WBNB = 500
- expected:
	- 主 pair 返回非 null 的 priceUsd/liquidityUsd（基于 500 估算）

### t10-e1: anchorPriceResolver 失败时降级

- network: bsc
- 主 pair: TOKEN/WBNB
- anchor 池查询：失败
- anchorPriceResolver: 抛错
- expected:
	- 主 pair 仍返回，priceUsd/liquidityUsd = null

### t10-e2: anchorPriceResolver 未注入时行为与原来相同（向后兼容）

- 不注入 anchorPriceResolver
- anchor 池失败
- expected: priceUsd/liquidityUsd = null（原有降级行为不变）

## address pool（用户提供样本）

### bsc

- 0x23fe903be385832fd7bb82bf1fee93f696278888
- 0xfdc66a08b0d0dc44c17bbd471b88f49f50cdd20f
- 0xb8a677e6d805c8d743e6f14c8bc9c19305b5defc
- 0xac51066d7bec65dc4589368da368b212745d63e8
- 0x8dedf84656fa932157e27c060d8613824e7979e3
- 0xda05ca5303d75f14e298fb8aeff51fd2f2105803
- 0x72449ED79841981B19d4552861007A63Da3963fE
- 0x55d398326f99059ff775485246999027b3197955
- 0xfd5840cd36d94d7229439859c0112a4185bc0255

### bsc old
- 0xfC69c8a4192130F5d3295876BeC43F22704DF1E2

### bsc multi route
- 0xF89712b7C0b6136E1436a8c4E3f4B9C1a1276dfC
- 0xc353950E65Ad19D4FC57Ce655Be474831ADC26Cc

### eth

- 0x44e89d34601b8d0155e16634d2553ef7f54dbab2
- 0xcb84d72e61e383767c4dfeb2d8ff7f4fb89abc6e
- 0x84018071282d4B2996272659D9C01cB08DD7327F
- 0xfd1450a131599ff34f3be1775d8c8bf79e353d8c
- 0x777172d858dc1599914a1c4c6c9fc48c99a60990
- 0x55a380d134d722006A5CE2d510562e1239D225B1
- 0x7483e83b481c69a93cb025395194e0dc4F32d9C4
- 0xdac17f958d2ee523a2206206994597c13d831ec7
- 0x39AA39c021dfbaE8faC545936693aC917d5E7563