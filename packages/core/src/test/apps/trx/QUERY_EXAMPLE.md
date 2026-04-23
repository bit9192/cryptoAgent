# TRX 地址查询演示

## 概述

演示脚本展示了如何使用 TRON 网络的 REST API 查询账户信息。

## 测试地址

```
TTfXBJ1ssA2MTXTgdesjLddcYy4ccw4QGp
```

该地址在主网上有以下信息：
- **TRX 余额**: 104.778439 TRX
- **账户创建**: 2025-07-02
- **TRC-20 代币**: 11 个
- **TRC-10 资产**: 27 个
- **冻结资源**: ENERGY、TRON_POWER
- **权限**: Owner 权限（阈值: 1）

## 运行方式

### 演示脚本

```bash
cd packages/core
node src/run/trx.mjs
```

输出包含：
- Network 信息（RPC 端点、ChainId 等）
- 主网账户查询结果
- 测试网账户查询结果

### 测试脚本

```bash
cd packages/core
node src/test/apps/trx/query.test.mjs
```

测试项目：
1. ✓ mainnet 地址查询
2. ✓ nile 测试网地址查询
3. ✓ 网络配置读取
4. ✓ 地址数据完整性验证
5. ⊘ TRC 资产统计 (skip - 防止速率限制)

## API 详情

### 支持的网络

| 网络 | RPC 端点 | ChainId |
|------|---------|---------|
| mainnet | https://api.trongrid.io | 728126428 |
| nile | https://nile.trongrid.io | 3448148188 |
| shasta | https://api.shasta.trongrid.io | 2494104990 |
| local | http://127.0.0.1:8090 | 0 |

### 账户查询端点

```
GET /v1/accounts/{address}
```

**返回数据结构**:
```json
{
  "data": [{
    "address": "41...",           // 16 进制地址
    "balance": 104778439,         // Sun 单位 (1 TRX = 10^6 Sun)
    "create_time": 1751445939000, // 账户创建时间戳
    "free_net_usage": 580,        // 已用免费带宽
    "free_asset_net_usageV2": [], // 各代币已用免费带宽
    "assetV2": [],                // TRC-10 资产列表
    "trc20": [],                  // TRC-20 代币余额
    "frozenV2": [],               // 冻结资源信息
    "owner_permission": {},       // Owner 权限
    "active_permission": [],      // Active 权限列表
    "account_resource": {}        // 账户资源信息
  }],
  "success": true,
  "meta": {
    "at": 1775306454361,
    "page_size": 1
  }
}
```

## 数据解析

### 余额单位转换

TRON API 返回的余额单位是 **Sun**，转换为 **TRX**：

```javascript
const balanceTrx = accountInfo.balance / 1e6;
```

### TRC-20 代币

```javascript
accountInfo.trc20 = [
  { "TContractAddress1": "balance1" },
  { "TContractAddress2": "balance2" }
]
```

### TRC-10 资产

```javascript
accountInfo.assetV2 = [
  { key: "tokenId", value: "balance" },
  ...
]
```

### 冻结资源类型

- `ENERGY` - 冻结用于能量消耗
- `TRON_POWER` - 冻结用于投票权

## 注意事项

### API 速率限制

TRX 节点有速率限制（通常 429 Too Many Requests）：
- **免费 API**: 约 50 请求 / 秒
- **付费 API**: 更高限制（需要 API key）

配置 API key 方式：
```bash
export TRX_MAINNET_API_KEY="your-api-key"
```

### 地址格式

- **Base58Check 格式** (用户友好): `TTfXBJ1ssA2MTXTgdesjLddcYy4ccw4QGp`
- **Hex 格式** (内部存储): `41c219f322aa7c5953253bfe75667be7260842ff9e`

API 返回 Hex 格式，可转换为 Base58Check，反之亦可。

## 参考

- [TRON API 文档](https://developers.tron.network/reference/wallet-api)
- [TRX 网络配置](../../../apps/trx/config/networks.js)
