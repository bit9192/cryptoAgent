# apps/trx/search/address-search 测试样本

目标：覆盖 `searchAddress` 的 happy / edge / invalid / security 四类样本。

## 地址簿（测试用固定地址）

| 标签              | 地址                                       | 说明                       |
|-------------------|--------------------------------------------|----------------------------|
| USDT contract     | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t       | mainnet TRC20 USDT 合约     |
| nile USDT contract| TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf       | nile 测试网 USDT 合约       |
| 测试钱包 A        | TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9       | 虚构地址，用于 mock 场景    |
| 测试钱包 B        | TPjzedDEjwSo8MWXe9MCWkPFdnGmEPkDag       | 虚构地址，nile 场景         |

---

## 1. happy-path

### H2-1: 正常地址 → native TRX + TRC20 USDT 结果

mock:
- nativeResolver 返回 TRX: 123.456 TRX, exists: true
- trc20Resolver 返回 USDT: 50.000000

input:
- address: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9
- network: mainnet

expected:
- items.length >= 1
- 至少一条 items[i].extra.protocol = "native"
- 至少一条 items[i].extra.protocol = "trc20"
- 所有 items[i].domain = "address"
- 所有 items[i].chain = "trx"
- 所有 items[i].network = "mainnet"
- 所有 items[i].address = "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9"

### H2-2: native TRX 结果字段完整

mock:
- nativeResolver 返回 TRX: 200 TRX, exists: true
- trc20Resolver 返回 []（无 TRC20 持仓）

input:
- address: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9
- network: mainnet

expected:
- items.length = 1
- items[0].symbol = "TRX"
- items[0].extra.balance 为字符串
- items[0].extra.exists = true
- items[0].source = "trongrid"

### H2-3: TRC20 结果字段完整

mock:
- nativeResolver 返回 TRX: 0 TRX, exists: false
- trc20Resolver 返回 USDT: 100.5

input:
- address: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9
- network: mainnet

expected:
- items 中有 USDT 条目
- USDT 条目 extra.protocol = "trc20"
- USDT 条目 extra.contractAddress = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
- USDT 条目 extra.decimals = 6

### H2-4: nile 测试网 → nile USDT 合约地址

mock:
- nativeResolver 返回 TRX: 10 TRX
- trc20Resolver 返回 nile USDT: 5.0

input:
- address: TPjzedDEjwSo8MWXe9MCWkPFdnGmEPkDag
- network: nile

expected:
- USDT 条目 extra.contractAddress = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
- 所有 items[i].network = "nile"

---

## 2. edge-case

### E2-1: TRC20 零余额 → 过滤掉，不出现在结果

mock:
- trc20Resolver 返回 USDT balance = 0

input:
- address: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9
- network: mainnet

expected:
- items 中无 USDT 条目

### E2-2: network 未传 → 默认 mainnet

input:
- address: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9
（不传 network）

expected:
- 所有 items[i].network = "mainnet"

### E2-3: native resolver 失败 → 只返回 TRC20，不抛错

mock:
- nativeResolver 抛 Error("Network timeout")
- trc20Resolver 返回 USDT: 50

input:
- address: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9
- network: mainnet

expected:
- searchAddress 不抛错
- items 中有 USDT 条目（native 失败不影响 TRC20）

### E2-4: TRC20 resolver 失败 → 只返回 native，不抛错

mock:
- nativeResolver 返回 TRX: 100
- trc20Resolver 抛 Error("TRC20 batch failed")

input:
- address: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9
- network: mainnet

expected:
- searchAddress 不抛错
- items 中有 native TRX 条目

### E2-5: 地址无资产（新账户）→ 只有 native exists=false 或 []

mock:
- nativeResolver 返回 TRX: 0, exists: false
- trc20Resolver 返回 []

input:
- address: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9
- network: mainnet

expected:
- items.length = 0 或 items 全为 native exists=false 条目（视实现决定是否过滤零额 native）

---

## 3. invalid-case

### I2-1: 空 address → 抛 TypeError

input:
- address: ""
- network: mainnet

expected:
- 抛 TypeError（"address 不能为空" 或类似）

### I2-2: 非 TRX 地址格式（EVM 地址）→ 抛 TypeError

input:
- address: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- network: mainnet

expected:
- 抛 TypeError（格式不合法）

### I2-3: 格式错误的 Base58 地址 → 抛 TypeError

input:
- address: INVALID_ADDRESS_XYZ
- network: mainnet

expected:
- 抛 TypeError

---

## 4. security-case

### S2-1: resolver 抛含 API key 的错误 → provider 降级，不透出

mock:
- nativeResolver 抛 Error("trongrid apiKey=TG_SECRET_123 unauthorized")

input:
- address: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9
- network: mainnet

expected:
- searchAddress 不抛出异常
- 返回值中不包含 "TG_SECRET_123" 字符串
- native 部分降级为空，TRC20 部分仍正常返回

### S2-2: items 中不包含私钥或助记词字段

expected:
- 所有 SearchItem 的 key/path 中不含 "privateKey" / "mnemonic" / "seed"
