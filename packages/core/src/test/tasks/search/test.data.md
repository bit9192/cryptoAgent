# tasks/search test data

## happy

- 批量余额 mixed chains:
  - evm / eth / native
  - trx / mainnet / native
  - btc / mainnet / ORDI
- 保持输入顺序与输出顺序一致

## invalid

- pairs 为空
- pair.address 为空
- pair.token 为空
- pair.chain 非法

## edge

- network 使用链别名（btc / mainnet / trx）后仍能归一化
- 某一链 reader 返回空 items 时仍保持输出槽位
- 某一链 reader 返回 `ok=false` 时错误字段透传

## security

- task 输出不包含私钥、助记词、密码
- batch reader 错误消息仅透传公共错误文本