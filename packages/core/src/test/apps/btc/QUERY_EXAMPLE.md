# BTC 余额查询示例说明

## 执行结果总结

### ✓ 主网 P2PKH 地址
- 地址: `13Q1WmqLg5CQHtPCYdH3YXboWu26G79FWi`
- **查询成功** ✓
- 确认余额: 0 BTC
- 未确认余额: 0.00007353 BTC
- UTXO 数: 1

### ⚠ 主网 Taproot 地址
- 地址: `bc1pxaneaf3w4d27hl2y93fuft2xk6m4u3wc4rafevc6slgd7f5tq2dqyfgy06`
- **查询失败** (HTTP 400: Bad Request)
- 原因: mempool.space API 对该地址格式的限制
- 建议: 使用 Bitcoin Core 或 blockbook provider 替代

### ✓ 测试网 Taproot 地址
- 地址: `tb1p2260r7y6r4lya5ds8lvwwdhccvg4u3qjtxxl7a2ayhvmy4uck3gqc6zhsk`
- **查询成功** ✓
- 确认余额: 0 BTC
- 未确认余额: 0 BTC
- UTXO 数: 0

## 演示脚本位置

[packages/core/src/run/btc.mjs](../../src/run/btc.mjs)

## 运行方式

### 使用 mempool.space 公开 API（默认）
```bash
cd packages/core
node src/run/btc.mjs
```

### 使用自定义 REST 端点
```bash
BTC_MAINNET_REST_URL="https://your-url" \
BTC_TESTNET_REST_URL="https://your-testnet-url" \
node src/run/btc.mjs
```

### 使用本地 Bitcoin Core（如果已启动）
```bash
BTC_MAINNET_PROVIDER_TYPE="bitcoind" \
BTC_TESTNET_PROVIDER_TYPE="bitcoind" \
node src/run/btc.mjs
```

## API 能力展示

这个脚本演示了以下 BTC Core API 的使用：

1. **btcProviderSummary** - 获取 provider 元数据
2. **btcBalanceGet** - 查询地址余额（confirmed/unconfirmed 分离）
3. **resolveBtcProvider** - 根据网络名称解析 provider

## 代码示例摘录

```javascript
// 查询单个地址的余额
const balance = await btcBalanceGet(
  { addresses: ["13Q1WmqLg5CQHtPCYdH3YXboWu26G79FWi"] },
  "mainnet"  // 或 "testnet", "signet", "regtest"
);

// 结果格式
balance.rows.forEach(row => {
  console.log(`地址: ${row.address}`);
  console.log(`确认余额: ${row.confirmed} BTC`);
  console.log(`未确认余额: ${row.unconfirmed} BTC`);
  console.log(`总余额: ${row.total} BTC`);
  console.log(`UTXO 数: ${row.utxoCount}`);
});
```

## 关键特性

### 三模式 Provider 支持
- **bitcoind** (JSON-RPC): 完整功能，需要本地 Bitcoin Core 节点
- **mempool** (REST API): 轻量公开查询，无需部署节点
- **blockbook** (REST API): 另一种 REST 选项

### 智能错误处理
- 不支持的 provider 能力清晰报错
- 网络连接问题有友好的降级提示
- 本地节点不可用时自动跳过

### 多地址类型支持
- P2PKH (Legacy): `1...`
- P2SH-P2WPKH (Nested Segwit): `3...`
- P2WPKH (Segwit): `bc1q...` (mainnet), `tb1q...` (testnet)
- P2TR (Taproot): `bc1p...` (mainnet), `tb1p...` (testnet)

## 后续开发方向

现已完成的功能：
- ✓ Network 配置
- ✓ Provider Layer (resolver + adapters)
- ✓ Read APIs (balance, tx, utxo, fee)

计划中的功能：
- ⏳ Write APIs (broadcast, build, sign)
- ⏳ Wallet Management APIs
- ⏳ Transaction History / Scanning
