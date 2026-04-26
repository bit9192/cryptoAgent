# Happy Cases

1. 可通过 `set` 写入完整输入上下文，并通过 `show` 读取同样字段。
2. 同一 scope 再次 `set` 时会整体覆盖旧值，旧字段不残留。

# Edge Cases

1. `patch` 仅更新部分字段，未提供字段保持不变。
2. 设置 `ttlMs` 后，过期读取返回空上下文。
3. 多 scope 并存时（如 wallet/search）互不影响。

# Invalid Cases

1. `set` 缺少 scope，返回明确错误。
2. `patch` 目标 scope 不存在时，返回明确错误。
3. `ttlMs` 为负数或非数字时，返回明确错误。

# Security Cases

1. `show` 输出不得包含 privateKey。
2. `show` 输出不得包含 mnemonic 或 password。
