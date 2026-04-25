# apps/evm/search/token-search 测试样本

目标：覆盖 searchToken 与 tokenRiskCheck 在开发阶段最小接口的 happy / edge / invalid / security 四类样本。

## 1. happy-path

### searchToken-h1: symbol 命中配置

input:
- query: usdt
- kind: auto
- network: eth
- limit: 20

expected:
- items.length >= 1
- 第一条包含：domain=token, chain=evm, network=eth
- 包含 symbol/name/address/decimals

### searchToken-h2: address 命中配置

input:
- query: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- kind: auto
- network: eth

expected:
- queryKind 为 address
- 返回 tokenAddress 与输入地址语义一致（大小写不敏感）
- title 与 symbol/name 任一字段可用

### searchToken-h3: name 命中配置

input:
- query: Tether USD
- kind: name
- network: eth

expected:
- 返回 usdt 对应候选
- source 标记为 config 或 provider

### searchToken-h4: batch 查询命中并返回分组结果

input:
- items:
  - query: usdt
    network: eth
  - query: uni
    network: eth

expected:
- 返回 batch 结果数组，长度与输入一致
- 每个子结果含 items/sourceStats

### searchToken-h5: batch metadata 通过 multicall 补全

input:
- items:
  - query: usdt
    network: eth
  - query: uni
    network: eth

expected:
- 批量 metadata reader 被调用一次
- 返回候选中 decimals/name/symbol 可被链上数据覆盖

### searchToken-h6: profile 字段来自本地配置映射

input:
- query: usdt
- network: eth

expected:
- extra.project 字段存在
- website/docs/social 等字段结构稳定

### tokenRiskCheck-h1: 风险摘要正常返回

input:
- chain: evm
- network: eth
- tokenAddress: 0xdAC17F958D2ee523a2206206994597C13D831ec7

expected:
- riskLevel in [low, medium, high, unknown]
- riskScore 为 number 或 null
- riskFlags 为数组
- sources 为数组

## 2. edge-case

### searchToken-e1: 大小写混合 symbol

input:
- query: UsDt
- kind: auto
- network: eth

expected:
- 可命中 usdt
- 行为与小写输入一致

### searchToken-e2: limit 边界

input:
- query: usdt
- kind: auto
- network: eth
- limit: 1

expected:
- items.length <= 1

### searchToken-e3: network 缺失默认行为

input:
- query: usdt
- kind: auto

expected:
- 不崩溃
- 若有返回，network 字段稳定

### searchToken-e6: kind 缺失时自动识别 query 类型

input:
- query: crv
- network: eth

expected:
- 不需要 kind 参数
- 能按 query 自动走 symbol/address/name 之一
- 返回结果不为空（若远端可用）或稳定降级为空（不抛异常）

### searchToken-e7: 无 network 时按网络分组 multicall 核验

input:
- query: crv
- network: (缺省)
- (mock) networkResolver: 返回 eth + bsc 候选
- (mock) metadataBatchReader: 按 network 分别返回链上 symbol/name

expected:
- metadataBatchReader 被按 network 分组调用（至少 eth/bsc 各一次）
- 链上核验通过的候选全部返回
- 核验失败候选被过滤

### searchToken-e4: batch 中单项失败不影响其它项

input:
- items:
  - query: usdt
    network: eth
  - query: "   "
    network: eth

expected:
- 第 1 项正常返回
- 第 2 项降级为空结果
- 不抛出批量级异常

### searchToken-e5: profile 未配置时保留空值结构

input:
- query: weth
- network: eth

expected:
- extra.project 字段仍存在
- description/website/docs/logo 为 null
- social 子字段结构固定

### tokenRiskCheck-e1: 市场风险源缺失

input:
- tokenAddress: 0x1111111111111111111111111111111111111111
- chain: evm
- network: eth

expected:
- riskLevel 可降级为 unknown
- 不抛异常

### tokenRiskCheck-e2: 静态风险源缺失

input:
- tokenAddress: 0x2222222222222222222222222222222222222222
- chain: evm
- network: bsc

expected:
- 可返回聚合结果
- sources 标识缺失来源

## 3. invalid-case

### searchToken-i1: 空 query

input:
- query: "   "
- kind: auto
- network: eth

expected:
- 抛 TypeError 或返回明确错误对象（按实现约定统一）

### searchToken-i2: 非法地址

input:
- query: 0x123
- kind: auto
- network: eth

expected:
- 不崩溃
- 结果为空或错误可预期

### searchToken-i3: 非法 kind

input:
- query: usdt
- kind: random-kind
- network: eth

expected:
- 不抛异常
- 忽略 kind，按 query 自动识别并继续执行

### tokenRiskCheck-i1: 缺失 tokenAddress

input:
- chain: evm
- network: eth

expected:
- 抛 TypeError 或返回 invalid 错误

### tokenRiskCheck-i2: 非法 network

input:
- tokenAddress: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- chain: evm
- network: invalid-net

expected:
- 行为可预测（抛错或 unknown）

## 4. security-case

### searchToken-s1: metadata 含敏感字段

input:
- query: usdt
- kind: auto
- network: eth
- metadata:
  - privateKey: PRIVATE_KEY_PLACEHOLDER
  - mnemonic: MNEMONIC_PLACEHOLDER
  - password: PASSWORD_PLACEHOLDER

expected:
- 返回结果与错误信息中不包含以上敏感值

### searchToken-s2: provider 内部异常含敏感信息

input:
- query: usdt
- kind: auto
- network: eth

expected:
- 异常被拦截或降级
- 输出不包含 apiKey/privateKey/env 原文

## 5. remote-fallback (ETS-5 样本)

### searchToken-rf1: symbol 未在本地配置但 DexScreener 有数据（happy）

input:
- query: crv
- kind: auto
- network: eth
- (mock) remoteSymbolFallback: 返回 { address: "0xD533a949740bb3306d119CC777fa900bA034cd52", symbol: "CRV", name: "Curve DAO Token" }

expected:
- items.length >= 1
- items[0].domain === "token"
- items[0].chain === "evm"
- items[0].network === "eth"
- items[0].tokenAddress 包含 0xD533a949...（大小写不敏感）
- items[0].extra.metadataSource 存在（"single-reader" 或 "remote-fallback"）

### searchToken-rf2: DexScreener 返回空时 fallback 静默降级（edge）

input:
- query: nonexistentxyz99
- kind: auto
- network: eth
- (mock) remoteSymbolFallback: 返回 null

expected:
- items 为空数组
- 不抛出异常

### searchToken-rf3: DexScreener 抛出异常时 fallback 静默降级（edge）

input:
- query: failtoken
- kind: auto
- network: eth
- (mock) remoteSymbolFallback: 抛出 Error("network error")

expected:
- items 为空数组
- 不传播异常
- 外层 searchToken 正常返回

### searchToken-rf4: remoteSymbolFallback 返回无效 address 时降级（invalid）

input:
- query: badtoken
- kind: auto
- network: eth
- (mock) remoteSymbolFallback: 返回 { address: null, symbol: null }

expected:
- items 为空数组
- 不抛出异常

## 6. resolveTokenNetworks (ETS-6 样本)

### rtn-h1: symbol 查询返回多网络分布（happy）

input:
- query: aave
- (mock) networkResolver: 返回 [
    { chain: "evm", network: "eth", tokenAddress: "0x7Fc66500c84A76Ad7e9c93437bFC5Ac33E2DDaE9", symbol: "AAVE", name: "Aave Token" },
    { chain: "evm", network: "polygon", tokenAddress: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", symbol: "AAVE", name: "Aave" }
  ]

expected:
- 返回 NetworkPresence[] 长度 >= 1
- 包含 chain/network/tokenAddress/symbol/name/source 字段
- eth 条目的 tokenAddress 为合法 EVM 地址

### rtn-h2: name 查询也可触发（happy）

input:
- query: Aave
- (mock) networkResolver: 返回同 rtn-h1

expected:
- 同 rtn-h1 结果

### rtn-e1: 相同 chain/network 多条时去重（edge）

input:
- query: aave
- (mock) networkResolver: 返回 [
    { chain: "evm", network: "eth", tokenAddress: "0xABC...", symbol: "AAVE" },
    { chain: "evm", network: "eth", tokenAddress: "0xABC...", symbol: "AAVE" }
  ]

expected:
- 返回长度 = 1（去重后）

### rtn-e2: networkResolver 返回空时返回空数组（edge）

input:
- query: unknownxyz
- (mock) networkResolver: 返回 []

expected:
- 返回 []
- 不抛出异常

### rtn-i1: networkResolver 抛出异常时静默降级（invalid）

input:
- query: failquery
- (mock) networkResolver: 抛出 Error("network error")

expected:
- 返回 []
- 不传播异常

## 7. name-onchain-verification (ETS-7 样本)

### nov-h1: 单条 name 查询链上匹配通过（happy）

input:
- query: Tether USD
- kind: name
- network: eth
- (mock) metadataSingleReader: 返回 name="Tether USD"

expected:
- items.length >= 1
- 首条候选保留

### nov-e1: 单条 name 查询链上不匹配被过滤（edge）

input:
- query: Tether USD
- kind: name
- network: eth
- (mock) metadataSingleReader: 返回 name="Wrong Name"

expected:
- items = []
- 不抛异常

### nov-h2: 批量 name 查询使用 multicall 核验（happy）

input:
- items:
  - query: Tether USD
    kind: name
    network: eth
  - query: Uniswap
    kind: name
    network: eth
- (mock) metadataBatchReader: 返回 usdt.name="Wrong Name"，uni.name="Uniswap"

expected:
- 批量 reader 调用一次
- 第 1 项被过滤为空
- 第 2 项保留
- sourceStats.hit/empty 与过滤后 items 一致

### tokenRiskCheck-s1: 风险聚合错误不泄露敏感字段

input:
- tokenAddress: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- chain: evm
- network: eth
- metadata:
  - apiKey: API_KEY_PLACEHOLDER

expected:
- riskLevel 可降级 unknown
- 错误与日志不包含 apiKey 值

### tokenRiskCheck-s2: sources 字段不泄露内部凭据

input:
- tokenAddress: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- chain: evm
- network: eth

expected:
- sources 仅包含来源标识与状态
- 不包含访问令牌与连接串

## 8. cross-network unverified (ETS-10 样本)

### searchToken-e10-h1: bsc multicall 未命中但 symbol 精确匹配时保留 unverified 条目（happy）

input:
- query: crv
- (mock) networkResolver: 返回 [
    { chain: "evm", network: "eth", tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52", symbol: "CRV", name: "Curve DAO Token", source: "coingecko" },
    { chain: "evm", network: "bsc", tokenAddress: "0xc7ae4ab742f6b0b203f6710c87677005bc45ad01", symbol: "CRV", name: "Bridged Curve DAO Token (Stargate)", source: "coingecko" }
  ]
- (mock) metadataBatchReader: eth 返回 [{ tokenAddress: "0xD533...", symbol: "CRV", name: "Curve DAO Token", decimals: 18 }]，bsc 返回空 items（合约无标准 ERC20 接口）

expected:
- items.length = 2
- eth 条目：extra.metadataSource = "multicall"，extra.unverified 不存在（或非 true）
- bsc 条目：extra.metadataSource = "network-resolver"，extra.unverified = true

### searchToken-e10-e1: symbol 不匹配时 unverified 候选不保留（edge）

input:
- query: crv
- (mock) networkResolver: 返回 [
    { chain: "evm", network: "bsc", tokenAddress: "0x1111111111111111111111111111111111111111", symbol: "XYZ", name: "Bad Token", source: "coingecko" }
  ]
- (mock) metadataBatchReader: 返回空 items

expected:
- items = []（symbol 不匹配，不保留 unverified）

### searchToken-e10-e2: multicall 命中时不打 unverified 标记（edge）

input:
- query: crv
- (mock) networkResolver: 返回 [
    { chain: "evm", network: "eth", tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52", symbol: "CRV", name: "Curve DAO Token", source: "coingecko" }
  ]
- (mock) metadataBatchReader: 正常返回 [{ tokenAddress: "0xD533...", symbol: "CRV", name: "Curve DAO Token", decimals: 18 }]

expected:
- items.length = 1
- extra.metadataSource = "multicall"
- extra.unverified 不存在（undefined 或 false）

### searchToken-e10-e3: name-shaped query 时 unverified 放宽不生效（edge）

input:
- query: Curve DAO Token（name-shaped query）
- (mock) networkResolver: 返回 [
    { chain: "evm", network: "bsc", tokenAddress: "0xc7ae4ab742f6b0b203f6710c87677005bc45ad01", symbol: "CRV", name: "Bridged Curve DAO Token (Stargate)", source: "coingecko" }
  ]
- (mock) metadataBatchReader: bsc 返回空 items（name 无法匹配）

expected:
- bsc 候选被过滤（queryKind=name，链上 name 不匹配，symbol 放宽不适用）
- items = []

## 9. cross-network profile (ETS-11 样本)

### searchToken-p11-h1: 跨网络路径 eth usdt 候选 profile 被填充（happy）

input:
- query: usdt（无 network）
- (mock) networkResolver: 返回 [
    { chain: "evm", network: "eth", tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD", source: "coingecko" }
  ]
- (mock) metadataBatchReader: 返回正常 metadata

expected:
- items[0].extra.project.website = "https://tether.to"
- items[0].extra.project.social 为对象（不为 null）

### searchToken-p11-h2: 跨网络路径 bsc usdt 候选 profile 被填充（happy）

input:
- query: usdt（无 network）
- (mock) networkResolver: 返回 [
    { chain: "evm", network: "bsc", tokenAddress: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", name: "Tether USD", source: "coingecko" }
  ]
- (mock) metadataBatchReader: 返回正常 metadata

expected:
- items[0].extra.project.website = "https://tether.to"（bsc profile 有数据）

### searchToken-p11-e1: 跨网络路径无 profile 数据时返回 null-safe 结构（edge）

input:
- query: crv（无 network）
- (mock) networkResolver: 返回 [
    { chain: "evm", network: "eth", tokenAddress: "0xD533a949740bb3306d119CC777fa900bA034cd52", symbol: "CRV", name: "Curve DAO Token", source: "coingecko" }
  ]
- (mock) metadataBatchReader: 返回正常 metadata

expected:
- items[0].extra.project 为对象（不为 null）
- items[0].extra.project.website = null
- items[0].extra.project.social 为对象，键包含 twitter/telegram/discord/github

## 10. token-risk-trade-summary (ETS-12 样本)

### tokenRiskCheck-t12-h1: input.tradeSummary 可作为 trade 风险来源（happy）

input:
- chain: evm
- network: eth
- tokenAddress: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- tradeSummary: { pairCount: 3, totalLiquidityUsd: 2000000, totalVolume24h: 500000 }

expected:
- sources 包含 name=trade 且 status=ok
- riskLevel 可受 trade 摘要影响（不再仅由 static/market/contract 决定）

### tokenRiskCheck-t12-e1: tradeSummaryChecker 抛错时降级（edge）

input:
- chain: evm
- network: eth
- tokenAddress: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- tradeSummaryChecker: throw Error("TRADE_API_KEY_PLACEHOLDER")

expected:
- tokenRiskCheck 不抛异常
- sources 包含 name=trade 且 status=error
- riskFlags 含 trade-unavailable

## 11. token-risk-provider-auto-trade-summary (ETS-13 样本)

### tokenRiskCheck-t13-h1: autoTradeSummary 开启时自动注入 trade checker（happy）

input:
- chain: evm
- network: eth
- tokenAddress: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- options.autoTradeSummary: true
- options.tradeSummaryResolver: 返回 { pairCount: 2, totalLiquidityUsd: 1500000, totalVolume24h: 300000 }

expected:
- sources 包含 name=trade 且 status=ok

### tokenRiskCheck-t13-e1: autoTradeSummary resolver 抛错时降级（edge）

input:
- chain: evm
- network: eth
- tokenAddress: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- options.autoTradeSummary: true
- options.tradeSummaryResolver: throw Error("TRADE_RESOLVER_API_KEY")

expected:
- tokenRiskCheck 不抛异常
- sources 包含 name=trade 且 status=error
- riskFlags 含 trade-unavailable
