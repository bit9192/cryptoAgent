# trade-search TS-5 测试样本清单

目标：覆盖 trade-search 协议接入（mock provider）的 happy / edge / invalid / security 四类样本。

## 1. happy-path

1. txHash 查询命中
- 输入：domain=trade, query=0xabc..., kind=txHash
- 期望：返回 item，含 domain/id/title/address/extra

2. 路由摘要透传
- 输入：provider 返回 route summary
- 期望：输出在 extra.routeSummary

## 2. edge-case

1. 多 provider 去重
- 输入：同 id 的 trade item 由两 provider 返回
- 期望：只保留一条

2. network 过滤
- 输入：network=eth
- 期望：只调用支持 eth 的 provider

## 3. invalid-case

1. domain 不支持
- 输入：domain=foo
- 期望：抛 TypeError

2. provider 未实现 searchTrade
- 输入：capabilities 包含 trade 但无对应函数
- 期望：provider 记空命中，不抛敏感错误

## 4. security-case

1. provider 错误不透出
- 输入：provider 抛 PRIVATE_KEY_PLACEHOLDER
- 期望：结果仅 failed+1，无敏感文本

2. extra 禁止注入敏感字段
- 输入：extra 带 secret
- 期望：当前阶段仅协议透传，不在 stats 输出原文
