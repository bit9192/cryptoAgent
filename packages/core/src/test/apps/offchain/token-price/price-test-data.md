# token-price 测试数据

## happy-path

### evm

- vUSDT -> 0xfD5840Cd36d94D7229439859C0112a4185BC0255
- BSC-USD (USDT:bsc) -> 0x55d398326f99059fF775485246999027B3197955
- USDT (eth) -> 0xdAC17F958D2ee523a2206206994597C13D831ec7
- cUSDT -> 0xf650C3d88D12dB855b8bf7D11Be6C55A4e07dCC9
- fxs -> 0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0
- arkm -> 0x6E2a43be0B1d33b726f0CA3b8de60b3482b8b050

### trx

- SUN -> TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S
- USDT -> TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

### btc

- ORDI -> ordi
- SATS -> sats

## edge-case

- 同 symbol 跨链：USDT (eth / bsc / trx)
- 地址与 symbol 混合输入
- mixed chain batch 输入
- 大小写混合：usdt / USDT / OrDi

## invalid-case

- 空字符串
- 非法 evm 地址：0x123
- 非法 trx 地址：T123
- 未配置且远端无法解析的 symbol：not-a-token

## security-case

- 不记录敏感 API key
- 错误信息不回传环境变量内容

## price-slice-data

### happy-path

- ETH (eth) -> 价格应可解析（`priceUsd > 0`）
- USDT (bsc) -> 价格应可解析（`priceUsd > 0`）
- SUN (trx) -> 价格应可解析（`priceUsd > 0`）

### edge-case

- mixed chain batch：`eth + bsc + trx` 同批输入
- 同 token 重复输入：应触发去重，避免重复远端调用
- 远端返回 `priceUsd` 缺失：可降级 unresolved
- 主源仅返回部分 token：次源应补齐缺失 token

### fallback-case

- 主源抛错：次源成功返回价格
- 主源返回空：次源成功返回价格

### invalid-case

- 空 query
- 未解析 symbol：`not-a-token`

### security-case

- 远端异常时不回传密钥等敏感上下文


