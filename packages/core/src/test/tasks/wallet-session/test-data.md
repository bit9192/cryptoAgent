# wallet-session S-1 测试样本

## Happy Path

### HP-1 unlock 后 session.tree 可读
输入:
- 执行 wallet unlock 成功
- unlock 返回包含 tree

预期:
- task 会话快照包含 `data.tree`
- `wallet.tree` action 返回同一结构

## Edge Cases

### EC-1 session.tree 为空
输入:
- 执行 wallet.clear 后直接调用 wallet.tree

预期:
- 返回空 `tree: []`
- `counts.accounts/chains/addresses = 0`
- 包含 warning: `session.tree 为空`

### EC-2 unlock 返回 tree 但 addresses 为空
输入:
- unlock 返回仅 orig 行

预期:
- `wallet.tree` 仍返回合法 tree
- counts.addresses 可为 0

### EC-3 多 key 连续 unlock
输入:
- 同一次流程解锁多个 key

预期:
- task 取到最后一次成功 unlock 的 tree 快照
- 结构完整，不抛错

## Invalid Cases

### IC-1 unlock 失败
输入:
- 密码错误导致 unlock 失败

预期:
- 不写入 session.tree
- wallet.tree 保持空树或上次快照

### IC-2 unlock 返回 tree 非对象
输入:
- unlock 返回 `tree: "bad"`

预期:
- task 忽略该值，不污染 session.tree

### IC-3 unlock 返回 tree.tree 非数组
输入:
- unlock 返回 `tree: { tree: {} }`

预期:
- wallet.tree 走空树分支并给 warning

## Security Cases

### SC-1 tree 中不得泄露 password
输入:
- 正常 unlock（包含 password）

预期:
- session.tree 不包含 password 字段
- wallet.tree 输出不包含 password 字段

### SC-2 tree 中不得泄露 mnemonic/privateKey
输入:
- mnemonic/privateKey key 解锁后生成 tree

预期:
- tree 仅含公开字段（keyId/name/path/addresses）
- 不输出 secret 内容
