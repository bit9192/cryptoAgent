# address-search TS-5 测试样本清单

目标：覆盖 address-search 协议接入（mock provider）的 happy / edge / invalid / security 四类样本。

## 1. happy-path

1. 地址摘要命中
- 输入：domain=address, query=0x...
- 期望：返回 item，extra 含 assetCount/totalUsd

2. 多链地址摘要
- 输入：多个链 provider 返回
- 期望：统一 items 输出

## 2. edge-case

1. address kind 自动识别
- 输入：evm 与 trx 风格地址
- 期望：queryKind 自动输出 address

2. cursor 透传
- 输入：cursor=next-1
- 期望：provider 可读取 cursor

## 3. invalid-case

1. 非法 domain
- 输入：domain=wallet
- 期望：抛 TypeError

2. provider 不支持 address
- 输入：仅 token provider
- 期望：items 为空

## 4. security-case

1. provider 错误脱敏
- 输入：抛敏感错误文本
- 期望：结果不包含敏感文本

2. sourceStats 不泄露 extra
- 输入：extra 中有敏感字段
- 期望：sourceStats 仍仅统计
