1. assets.query  -> assets query --chain <evm|btc|trx> --addresses [...] --tokens [...]

命令 应该是 [address:token:network, address:token:network] 这种每一条单独分开
当用户需要 请求 A地址下的 多个token时，由 ai 用 数据引擎 生成 [ A: t1, A:t2 ...] 再传入，这样是不是更利于标准化使用

2. assets.query 改为 [address:token:network, address:token:network] 参数类型后，是否可以根据 address 判断所属 chain ，然后 相同的 chain 先归集到一起，在 evm 的情况下，network 相同的 请求 放到一起 用 一个 query 执行，这样可以保证尽可能的减少请求，同时如果是 btc 的情况下，可以根据 network 自动转化 address 的前缀
3. 2 的这些根据各链的特殊用法应当放到 各链的 asset 里特殊处理，总的 assets.query 只是将 参数 按 chain 分发