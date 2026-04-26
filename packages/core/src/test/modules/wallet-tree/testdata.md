# Happy Cases

1. 已存在 key 会话文件，包含 1 个钱包，能构建 1 棵最小树。
2. 已存在 key 会话文件，包含多钱包，能按名称稳定排序。

# Edge Cases

1. 空钱包列表返回空树，不抛异常。
2. 同名钱包出现时，节点 id 仍唯一。
3. 部分链地址缺失时，仅跳过缺失分支。

# Invalid Cases

1. 输入会话对象为空，返回明确错误。
2. 输入结构缺少 wallets 字段，返回明确错误。
3. 节点 path 非法时，不写入树并记录错误。

# Security Cases

1. 树节点输出不得包含 privateKey。
2. 树节点输出不得包含 mnemonic 或 password。
