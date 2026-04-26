# 完整流程体验指南：查询 Inputs 地址资产

## 概览
这个演示展示了完整的端到端流程：
1. **设置 inputs** - 用 `wallet inputs.set` 指定一个钱包地址或 key
2. **查看 inputs** - 用 `wallet inputs.show` 验证设置
3. **查询资产** - 用新增的 `si` 命令查询该地址的资产

## 前置条件
- 已有至少一个可用的 key（可通过 `wallet list-keys` 查看）
- dev 模式下通常有内置的 test/dev key

## 完整演示步骤

### 步骤 1：启动 Lon REPL

```bash
cd /Users/zhangyi/Desktop/moneyOS/contractHelper-new
node packages/core/src/cli/lon.mjs --mode dev --autoConfirm true
```

输出应该类似：
```
┌───────────────────────────────────┐
│           Lon REPL  (ex:lon)      │
└───────────────────────────────────┘
  mode:        dev
  autoConfirm: true
  network:     (默认)
  输入 help 查看命令列表
  上方为结果面板，下方为命令输入区

lon[dev]>
```

### 步骤 2：查看可用的 Key

```
lon[dev]> wallet list-keys
```

输出示例：
```
  [wallet.listKeys] 已加载 2 个 key
  [wallet.tree] 摘要
  {
    "keyCount": 2,
    "tree": [
      {
        "keyId": "test-key-001",
        "keyName": "test-key-001",
        "chains": [...]
      },
      ...
    ]
  }
```

### 步骤 3：设置 Inputs 地址

使用参数匹配设置 inputs：

**方法 A：模糊匹配 key 名称**
```
lon[dev]> wallet inputs.set --name test
```

**方法 B：精确匹配 key ID**
```
lon[dev]> wallet inputs.set --id test-key-001
```

**方法 C：同时使用 name 和 id**
```
lon[dev]> wallet inputs.set --name test --id test-key-001
```

输出示例：
```
  [wallet.inputs] inputs 已设置
  {
    "targets": [
      {
        "keyId": "test-key-001",
        "keyName": "test-key-001",
        "chain": "evm",
        "address": "0x1234567890abcdef...",
        "name": null,
        "path": "m/44'/60'/0'/0/0"
      }
    ],
    "keyIds": ["test-key-001"],
    "keyId": "test-key-001",
    "keyName": "test-key-001",
    "chain": "evm",
    "address": "0x1234567890abcdef...",
    ...
  }
```

### 步骤 4：查看已设置的 Inputs

```
lon[dev]> wallet inputs.show
```

输出示例：
```
  [wallet.inputs] scope=wallet 已检索
  {
    "targets": [...],
    "keyIds": [...],
    "address": "0x1234567890abcdef...",
    ...
  }
```

### 步骤 5：查询地址的资产（新功能）

#### 查询 Token 资产
```
lon[dev]> si token
```

输出示例：
```
  [search-inputs] 查询地址: 0x1234567890abcdef...
  [search-inputs] domain: token
  [search-inputs] 查询成功
  [search-inputs] 找到 5 条结果
  {
    "ok": true,
    "domain": "token",
    "query": "0x1234567890abcdef...",
    "candidates": [
      {
        "domain": "token",
        "chain": "evm",
        "network": "eth",
        "id": "eth:USDC",
        "title": "USD Coin",
        "symbol": "USDC",
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "source": "evm-config",
        "confidence": 1,
        "balance": "1234.56"
      },
      ...
    ]
  }
```

#### 查询 Trade 数据（DEX 信息）
```
lon[dev]> si trade
```

#### 查询 Address 详情
```
lon[dev]> si address
```

#### 指定网络查询
```
lon[dev]> si token --network bsc
lon[dev]> si token --network hardhat
```

## 故障排除

### 错误：inputs 中未找到有效地址
```
[search-inputs] 查询失败: inputs 中未找到有效地址，请先执行 wallet inputs.set
```

**解决方案**：
```
lon[dev]> wallet inputs.set --name <keyname>
```

### 错误：未找到匹配的 key
```
未匹配到候选项 (name=xxx, id=xxx)
```

**解决方案**：
1. 先用 `wallet list-keys` 查看可用的 key
2. 用正确的 key 名称或 ID 重试

### 没有查询到资产结果
```
[search-inputs] 查询成功
[search-inputs] 找到 0 条结果
```

**可能原因**：
- 地址确实没有该资产
- 该链网络不支持
- 搜索 provider 暂未初始化

## 架构说明

### 参数流程

```
┌─────────────────────────┐
│ wallet inputs.set       │
│ --name <fuzzy>          │
│ --id <exact>            │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ matchWalletTargetsByNameOrId()       │
│ - 读取 wallet tree + key list        │
│ - 模糊/精确匹配                       │
│ - 返回 targets[]                    │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ buildInputsDataFromTargets()         │
│ - 组织 targets, keyIds 等字段        │
│ - 设置到 inputs scope 中             │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ wallet inputs.show                  │
│ - 读取当前 inputs                   │
│ - 获得地址、keyId 等信息             │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ si <domain>                         │
│ - readWalletInputs() 读取 inputs    │
│ - 提取第一个有效地址                  │
│ - 调用 search task 查询资产           │
│ - 展示结果                           │
└─────────────────────────────────────┘
```

### 关键模块

| 模块 | 功能 |
|------|------|
| `wallet inputs.set` | 参数匹配 + 目标选择 + inputs 写入 |
| `wallet inputs.show` | inputs 读取 + 安全过滤 |
| `si` | inputs 读取 + 地址提取 + search 调用 |
| `matchWalletTargetsByNameOrId()` | 模糊/精确匹配核心 |
| `readWalletInputs()` | inputs 同步读取 helper |
| `queryInputsAssets()` | 资产查询核心 helper |

## 验收标准

✅ `wallet inputs.set --name <key>` 能正确匹配并设置 inputs  
✅ `wallet inputs.show` 能读取已设置的 inputs  
✅ `si token` 能查询地址的 token 资产  
✅ `si trade` 能查询地址的 trade 数据  
✅ `si token --network <net>` 能指定网络查询  
✅ 无有效地址时报错提示清晰  
✅ 所有交互无需手动确认（autoConfirm=true）

## 后续工作

- [ ] 支持多地址查询聚合（si 结果汇总所有 inputs 地址）
- [ ] 支持资产排序（按余额、价值等）
- [ ] 支持资产过滤（只看 >1000 USDT 的资产）
- [ ] 支持历史对比（查询前后资产变化）
