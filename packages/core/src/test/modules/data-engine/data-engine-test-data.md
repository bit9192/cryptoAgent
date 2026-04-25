# data-engine DQ-1 测试样本清单

目标：覆盖 data-engine 接入 request-engine 薄层后的 happy / edge / invalid / security 四类样本。

## 1. happy-path

1. queryShared 命中去重
- 输入：同 requestKey 并发 3 次 queryShared
- 期望：fetcher 仅调用 1 次

2. queryChain 命中 fanout 缓存
- 输入：第一次 queryChain 拉全量并 fanout，第二次读取另一链
- 期望：第二次不触发 fetcher

## 2. edge-case

1. 自定义 ttlPolicy
- 输入：requestTtlMs 与 chainTtlMs 分开设置
- 期望：两者独立生效

2. invalidateQueryCache 前缀失效
- 输入：requestPrefix 或 chainPrefix
- 期望：仅匹配 key 失效

## 3. invalid-case

1. requestKey 缺失
- 输入：queryShared({ fetcher })
- 期望：抛 TypeError

2. fetcher 非函数
- 输入：queryShared({ requestKey, fetcher: 123 })
- 期望：抛 TypeError

## 4. security-case

1. getQueryStats 不泄露缓存原文
- 输入：fetcher 返回 private/secret 字段
- 期望：getQueryStats 只返回统计，不包含敏感原文

2. invalidateQueryCache 回执不泄露数据
- 输入：缓存中有敏感字段
- 期望：返回删除计数，不返回数据内容

## 5. 占位符

- PRIVATE_KEY_PLACEHOLDER
- PASSWORD_PLACEHOLDER
- SECRET_PLACEHOLDER
