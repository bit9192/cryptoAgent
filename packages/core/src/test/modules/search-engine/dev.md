# modules/search-engine 开发计划

目标：建立统一 search 聚合能力，覆盖 token/trade/contract/address 四类搜索；采用多 provider + 单 action 聚合模式。

## 1. 模块范围

1. 统一 query 协议与输出协议
2. 跨链 provider 路由与聚合
3. 候选去重、排序、置信度输出
4. 与 request-engine 协同做请求去重与缓存复用

## 2. 分层落位

1. modules/search-engine
- 聚合编排、排序、去重、结果标准化

2. modules/request-engine
- 请求去重、缓存扇出、in-flight 合并

3. apps/*/search (后续)
- 各链 provider 原子搜索能力

4. tasks/search (后续)
- action 入口与参数校验

## 3. 当前切片计划

### Slice S-0：协议与样本先行

本次只做：

1. 定义 SearchQuery/SearchItem/SearchResult 协议
2. 定义 provider 能力声明协议
3. 定义样本边界（happy/edge/invalid/security）

本次不做：

1. 业务实现代码
2. CLI 交互展示
3. 复杂排序配置化

验收标准：

1. 协议文档可审阅
2. 子模块 dev 文档已建立
3. 可直接进入 S-1 开发

## 4. 子模块映射

1. token-search: symbol/name/tokenId 候选检索
2. trade-search: 交易与路由搜索
3. contract-search: 合约识别、标签、风险索引
4. address-search: 地址资产与行为聚合

## 5. 当前进度 / 下一步

当前进度：

1. 已完成 search 模块计划拆分
2. 已完成 token-search TS-1（最小闭环）
3. 已补齐 token-search 样本与单测

下一步：

1. 进入 token-search TS-2：接入 request-engine queryShared
2. 进入 trade-search TRS-1：协议与样本
