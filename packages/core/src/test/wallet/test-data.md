# wallet S-1 测试样本（getTree 直出接口）

## Happy Path
- HP-1: 解锁成功后调用 `wallet.getTree()` 返回 `ok=true` 且 `tree` 为数组。

## Edge Cases
- EC-1: 未解锁任何 key 时调用 `wallet.getTree()`，返回空树结构（counts 为 0）。
- EC-2: 已解锁但无 configured 地址时，仍返回包含 `orig` 行的合法 tree。
- EC-3: 多 key 已解锁时，`wallet.getTree()` 可返回完整聚合结果。

## Invalid Cases
- IC-1: provider 未注册导致地址派生失败时，不抛出异常，进入 `warnings`。
- IC-2: key 会话过期后调用 `wallet.getTree()`，过期 key 不应出现在 tree 中。
- IC-3: key 被 lockAll 后调用 `wallet.getTree()`，结果应为空树。

## Security Cases
- SC-1: `wallet.getTree()` 返回体中不得包含 password 字段。
- SC-2: `wallet.getTree()` 返回体中不得包含 mnemonic/privateKey 明文。

## S-2 样本（getTree 按 chains 补地址并回写缓存）

### Happy Path
- HP-2: 已解锁 key 在无该链地址时，调用 `wallet.getTree({ chains: ["evm"] })` 会生成 evm 地址并出现在 tree。
- HP-3: 对同一 key 再次调用 `wallet.getTree({ chains: ["evm"] })` 不重复生成（复用缓存）。

### Edge Cases
- EC-4: `chains` 使用对象格式 `{ chain: "btc", addressTypes: ["p2wpkh", "p2tr"] }` 时，可按类型逐项生成。
- EC-5: 已存在地址的 chain 不重复追加重复项。

### Invalid Cases
- IC-4: 指定 chain 未注册 provider 时不抛错，写入 warnings。
- IC-5: 单个 addressType 生成失败时跳过该项并继续其它项。

### Security Cases
- SC-3: 自动补地址流程不暴露 password/session 敏感字段。
