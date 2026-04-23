# Binance CEX 集成

## 快速开始

### 初始化客户端

```javascript
import { createBinanceClient } from "../../apps/cex/binance/index.mjs";

const binance = createBinanceClient({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
});
```

## 功能模块

### 1. 行情数据 (`market`)

获取交易对行情、K 线、深度等数据。

```javascript
// 获取最新价格
const price = await binance.market.getLatestPrice("BTCUSDT");
// { symbol: "BTCUSDT", price: "43521.50" }

// 获取 24 小时数据
const ticker24h = await binance.market.get24hTicker("BTCUSDT");
// { symbol, price, priceChange, priceChangePercent, ... }

// 获取 K 线
const klines = await binance.market.getKlines("BTCUSDT", "1h", {
  limit: 100,
  startTime: Date.now() - 24 * 60 * 60 * 1000, // 过去 24 小时
  endTime: Date.now(),
});

// 获取订单簿深度
const depth = await binance.market.getOrderBook("BTCUSDT", 10);
// { bids: [[price, qty], ...], asks: [[price, qty], ...], lastUpdateId }
```

### 2. 现货交易 (`spot`)

下单、查询、取消订单，管理账户持仓。

```javascript
// 下限价单
const limitOrder = await binance.spot.placeLimitOrder(
  "BTCUSDT",
  "BUY",           // 方向
  0.01,            // 数量
  43000,           // 价格
  { timeInForce: "GTC" }
);
// { symbol, orderId, clientOrderId, price, origQty, status, ... }

// 下市价单
const marketOrder = await binance.spot.placeMarketOrder(
  "BTCUSDT",
  "SELL",
  0.01
);

// 查询订单
const order = await binance.spot.queryOrder("BTCUSDT", { orderId: 123456 });

// 取消订单
const cancelled = await binance.spot.cancelOrder("BTCUSDT", { orderId: 123456 });

// 获取账户余额
const balances = await binance.spot.getBalances();
// [ { asset: "BTC", free: "0.05", locked: "0" }, ... ]

const btcBalance = await binance.spot.getBalance("BTC");
// { asset: "BTC", free: "0.05", locked: "0" }

// 获取打开的订单
const openOrders = await binance.spot.getOpenOrders("BTCUSDT");

// 获取成交历史
const trades = await binance.spot.getTradeHistory("BTCUSDT", {
  startTime: Date.now() - 7 * 24 * 60 * 60 * 1000, // 过去 7 天
  limit: 500,
});
```

### 3. 合约交易 (`futures`)

USDT 合约的杠杆交易、持仓管理。

```javascript
// 下合约单（双向持仓模式）
const futureOrder = await binance.futures.placeLimitOrder(
  "BTCUSDT",
  "BUY",           // 方向
  "LONG",          // 持仓方向
  1,               // 合约数量
  43000,           // 价格
);

// 查询持仓
const positions = await binance.futures.getPositions();
// [ { symbol, positionAmt, entryPrice, markPrice, unRealizedProfit, ... }, ... ]

const btcPosition = await binance.futures.getPosition("BTCUSDT");

// 设置杠杆
await binance.futures.setLeverage("BTCUSDT", 5);

// 设置持仓模式（双向/单向）
await binance.futures.setPositionMode(true); // true: 双向, false: 单向

// 获取成交历史
const futuresTrades = await binance.futures.getTradeHistory("BTCUSDT", {
  limit: 100,
});
```

### 4. 账户信息 (`account`)

获取账户详情、资产、佣金、权限。

```javascript
// 获取账户信息
const account = await binance.account.getAccountInfo();
// { makerCommission, takerCommission, canTrade, canWithdraw, balances, ... }

// 获取所有资产余额
const allBalances = await binance.account.getBalances();

// 获取特定资产
const usdtBalance = await binance.account.getBalance("USDT");

// 获取账户总资产（以 USDT 计）
const equity = await binance.account.getTotalEquity("USDT");
// { total: 50000, byAsset: { BTC: 21500, USDT: 28500 } }

// 获取交易对佣金
const commission = await binance.account.getCommission("BTCUSDT");

// 检查 API 密钥权限
const permissions = await binance.account.getApiKeyPermission();
// { ipRestrict, createTime, enableWithdrawals, enableFutures, ... }

// 充提历史
const deposits = await binance.account.getDepositHistory({
  coin: "BTC",
  startTime: Date.now() - 30 * 24 * 60 * 60 * 1000,
});

const withdrawals = await binance.account.getWithdrawalHistory({
  coin: "USDT",
  limit: 100,
});

// 账户状态
const status = await binance.account.getAccountStatus();
// { vipLevel, userClass, ... }
```

## 错误处理

```javascript
try {
  const price = await binance.market.getLatestPrice("BTCUSDT");
} catch (error) {
  console.error("请求失败:", error.message);
  // HTTP 429: 速率限制 -> 会自动重试
  // HTTP 400: 参数错误
  // HTTP 401: 密钥无效
}
```

## 配置选项

```javascript
const binance = createBinanceClient({
  apiKey: "your-api-key",
  apiSecret: "your-api-secret",
  
  // 可选
  baseUrl: "https://api.binance.com", // 默认
  timeout: 5000,                       // 请求超时 (ms)
  recvWindow: 5000,                    // 请求有效时间窗口 (ms)
  retryAttempts: 3,                    // 重试次数
  retryDelay: 100,                     // 重试延迟 (ms)
});
```

## 环境变量

建议使用环境变量存储 API 密钥：

```bash
export BINANCE_API_KEY="your-api-key"
export BINANCE_API_SECRET="your-api-secret"
```

## 通用错误代码

- **429**: 请求过于频繁（速率限制）-> 自动重试
- **400**: 参数格式错误
- **401**: API 密钥无效或无权限
- **403**: IP 不在白名单中
- **500**: Binance 服务器错误 -> 自动重试

## 参考

- [Binance API 文档](https://binance-docs.github.io/apidocs/)
- [现货交易 API](https://binance-docs.github.io/apidocs/spot/cn/)
- [合约交易 API](https://binance-docs.github.io/apidocs/futures/cn/)
