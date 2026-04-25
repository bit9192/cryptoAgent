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

### Slice S-5：trade/contract/address 协议接入与 mock 验证

本次只做：

1. 统一 SearchItem 输出字段（domain/id/title/address/extra）
2. SearchEngine 支持三域按统一协议分发（mock provider）
3. 补齐三域样本并新增协议回归测试

本次不做：

1. 真实链 trade/contract/address provider 实现
2. 任务层和 CLI 展示接入
3. 链上深度检索算法

验收标准：

1. 三域都可通过 registerProvider + search 走通统一返回结构
2. 旧 token-search 回归不破坏
3. 样本覆盖 happy/edge/invalid/security

### Slice S-6：composition root 外置默认 provider 装配

本次只做：

1. `createSearchEngine` 收口为纯引擎（不内置默认 provider）
2. 新增 composition root（默认 provider 装配与注册函数）
3. 保持 token-search 对外行为兼容（自定义 providers 默认不叠加）

本次不做：

1. 新链 provider 实现
2. 搜索任务层与 CLI 接入
3. 跨域策略配置化

验收标准：

1. `createSearchEngine` 默认 provider 数量为 0
2. composition root 可恢复现有默认 provider 行为
3. token-search 回归测试通过

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
4. 已完成 token-search TS-2~TS-4（注册式、缓存、trx与排序）
5. 已完成 S-5：trade/contract/address 协议接入（mock）
6. 已完成 S-6：composition root 外置默认 provider 装配

下一步：

1. 进入各链真实 provider 替换切片（先 EVM contract/address）
2. 进入 tasks/search 接入统一 SearchEngine 入口
