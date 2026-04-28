
# 动作解析示例（归集资产）

## 第一步：用户输入 → 结构化指令

```
用户输入: "帮我把钱包里的零碎的地址资产归集起来"
```

↓ AI 解析

```json
{
  "action": "asset.consolidate",
  "scope": "me",
  "target": {
    "selectors": { "name": "x" }
  },
  "outps": {
    "chains": "all",
    "domain": "address",
    "limit": 20
  },
  "consolidate": {
    "mode": "dust",
    "to": "main",
    "minValueUsd": 5
  }
}
```

字段说明：
- `action`：动作类型，资产归集
- `scope: "me"`：当前已解锁钱包，无需用户额外指定
- `target.selectors`：从会话 inputs 取，这里演示用 name=x
- `chains: "all"`：全链展开，用户没有限定链
- `domain: "address"`：先查地址维度资产，作为归集输入
- `limit`：每个地址最多返回条数
- `consolidate`：归集策略（归集小额资产到主地址）

---

## 第二步：结构化指令 → pickWallet → 地址集合

把第一步的指令映射成 pickWallet 请求：

```js
const pickRequest = {
  scope: "all",
  selectors: action.target.selectors,   // { name: "x" }
  outps: {
    signer: true,
    chains: action.outps.chains,         // "all"
  },
};

const pickedWallets = await wallet.pickWallet(pickRequest, tree);
```

↓ pickedWallets 结果结构（每条代表一个 key）

```json
[
  {
    "keyId": "k1",
    "name": "x",
    "sourceName": "walletnew",
    "addresses": {
      "evm": "0xabc...",
      "trx": "TXyz...",
      "btc": [
        { "type": "p2wpkh", "address": "bc1q..." },
        { "type": "p2tr",   "address": "bc1p..." }
      ]
    }
  }
]
```

关键点：
- `selectors` 直接来自第一步，不需要 AI 再参与
- `chains: "all"` 由 wallet 自动展开已注册链
- btc 多地址类型由 provider 能力决定，调用方无需关心

---

## 第三步：地址集合 → 参数化请求 → 资产搜索结果

把第二步拿到的 `pickedWallets` 转成 search 可调用参数：

```js
const searchInputs = buildAssetSearchInputsFromPicked(pickedWallets, {
  limit: action.outps.limit,   // 20
});
```

参数化后的每条请求（示例）：

```json
{
  "domain": "address",
  "query": "bc1q...",
  "network": "btc",
  "limit": 20,
  "chain": "btc",
  "addressType": "p2wpkh"
}
```

然后调用下游 search：

```js
const result = await searchEngine.search(searchInput);
```

↓ 返回资产搜索结果（简化示例）

```json
{
  "ok": true,
  "items": [
    { "title": "BTC", "symbol": "BTC", "amount": "0.123" },
    { "title": "ORDI", "symbol": "ORDI", "amount": "56" }
  ]
}
```

关键点：
- 第三步只做“参数化 + 调用”，不改业务语义
- `domain` 固定 `address`，因为归集前必须先知道地址下有哪些资产
- 每个地址独立查询，最后再做汇总展示

---

## 第四步：搜索结果 → 交易参数化（交易类下游）

这里不再用 `buildAssetSearchInputsFromPicked`，而是用新的交易参数化函数。

```js
const transferPlans = buildConsolidationTransferInputs({
  pickedWallets,
  searchResults,
  policy: action.consolidate,
});
```

交易参数（示例）：

```json
{
  "chain": "evm",
  "from": "0xsub...",
  "to": "0xmain...",
  "token": "USDT",
  "amount": "12.45",
  "reason": "dust-consolidation"
}
```

关键点：
- `buildAssetSearchInputsFromPicked` 只适配“搜索类下游”
- 遇到“交易类下游”，用独立的 `buildConsolidationTransferInputs`
- 两个函数职责分开：一个查资产，一个组交易

---

## 第五步：交易计划 → 执行前检查 → 执行

把第四步产出的 `transferPlans` 逐条做检查，然后执行：

```js
for (const plan of transferPlans) {
  validateTransferPlan(plan);         // 字段完整性、金额精度、地址格式
  checkRiskPolicy(plan, action);      // 风控：最小金额、白名单、链限制
  const tx = await executeTransfer(plan);
  receipts.push(tx);
}
```

执行结果（示例）：

```json
[
  {
    "ok": true,
    "chain": "evm",
    "txHash": "0x123...",
    "from": "0xsub...",
    "to": "0xmain...",
    "token": "USDT",
    "amount": "12.45"
  }
]
```

关键点：
- 先检查再执行，避免直接广播错误交易
- 失败项单独记录，不影响其他可执行项

---

## 第六步：执行结果 → 用户可读回复

把执行结果汇总成一句话和明细：

```text
已完成归集：3 笔成功，1 笔失败。
成功归集总额：USDT 38.2
失败原因：1 笔余额不足
```

关键点：
- 给用户看总结，不暴露内部字段细节
- 保留明细供追踪（txHash、失败原因）