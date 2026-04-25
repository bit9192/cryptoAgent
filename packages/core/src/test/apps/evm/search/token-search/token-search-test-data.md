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
- 抛 TypeError 或回退 auto（按实现约定统一）

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
