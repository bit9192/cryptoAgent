# apps/trx/search/token-search 测试样本

目标：覆盖 `searchToken` 的 happy / edge / invalid / security 四类样本。

## 1. happy-path

### H1-1: symbol 精确匹配（mainnet USDT）

input:
- query: usdt
- network: mainnet

expected:
- items.length >= 1
- items[0].domain = "token"
- items[0].chain = "trx"
- items[0].network = "mainnet"
- items[0].symbol = "USDT"
- items[0].address = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
- items[0].source = "config"
- items[0].extra.protocol = "trc20"
- items[0].extra.decimals = 6

### H1-2: symbol 大写输入命中（USDT → usdt）

input:
- query: USDT
- network: mainnet

expected:
- items.length >= 1
- items[0].symbol = "USDT"

### H1-3: name 模糊匹配（"Tether" → USDT）

input:
- query: Tether
- network: mainnet

expected:
- items.length >= 1
- items[0].symbol = "USDT"

### H1-4: contractAddress 精确匹配

input:
- query: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
- network: mainnet

expected:
- items.length = 1
- items[0].address = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

### H1-5: nile 测试网 USDT 命中

input:
- query: usdt
- network: nile

expected:
- items.length >= 1
- items[0].network = "nile"
- items[0].address = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"

## 2. edge-case

### E1-1: query 大小写混排（uSdT）

input:
- query: uSdT
- network: mainnet

expected:
- items.length >= 1
- items[0].symbol = "USDT"

### E1-2: network 未传 → 默认 mainnet

input:
- query: usdt
（不传 network）

expected:
- items[0].network = "mainnet"

### E1-3: limit = 1 → 最多返回 1 条

input:
- query: usdt
- network: mainnet
- limit: 1

expected:
- items.length <= 1

### E1-4: query 为 contractAddress 大小写混排

input:
- query: tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t  （全小写）
- network: mainnet

expected:
- items.length = 1（大小写不敏感匹配）

### E1-5: 空 token book 网络（shasta）→ 返回 []

input:
- query: usdt
- network: shasta

expected:
- items = []（shasta 无配置 token）

## 3. invalid-case

### I1-1: 空 query → 抛 TypeError

input:
- query: ""
- network: mainnet

expected:
- 抛 TypeError（"query 不能为空" 或类似信息）

### I1-2: query = undefined → 抛 TypeError

input:
- query: undefined
- network: mainnet

expected:
- 抛 TypeError

### I1-3: query 无匹配 → 返回 []，不抛错

input:
- query: nonexistent_token_xyz
- network: mainnet

expected:
- items = []

## 4. security-case

### S1-1: resolver 内部抛错 → provider 降级返回 []，不透出原始错误

mock: resolver 抛 Error("Internal DB connection: password=secret123")

expected:
- searchToken 返回 []（不抛出）
- 返回值中不包含 "secret123" 或原始错误信息

### S1-2: 超长 query 不崩溃

input:
- query: 一个 512 字符的随机字符串
- network: mainnet

expected:
- 返回 []，不抛错，不超时
