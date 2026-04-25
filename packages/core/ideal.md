# 2.0 思路

1.0 项目管理边界不清晰，各链的配置 没有规划好，key的加密和地址转换没有统一路径，方法复杂，基础接口不够严格，边界不清，系统里要扩展一条链的话，需要修改的地方很多，整个数据没有一个主干，op 模式 没法夸文件使用，太死板

## 边界划分

contracts
    solidty sol 合约
storage 存储数据
    key
    backup
    export
    apps
        evm
            deployment
            abi
            ...
        btc
            txhash
modules
    key 管理私钥 加密
apps 管理每个链的功能脚本
    wallet 在系统里加载 解锁, 解锁维护密钥树
    btc
    trx
    evm
        fork 和 hardhat 的交互 单独实现
        configs
            networks.ts
            index.ts
        accounts
        ....
    offchain
    index.ts
execute 执行任务流程
task 管理复杂业务 
    key
        testdata
        test.js

test 开发测试时候使用
cli cli 端交互
serves 变成 serves 接口交互
AI assistant 可以接入
srcipt
    runtime 脚本命令




# wallet 已实现
在 ex 里 unlock derive clear 


# 开发计划前置

evm 中 deploy 的代码丢失，需要重构

# 开发计划

现在有了 wallet 的初级操作
接下来就是 实现 余额资产的查询
应当先针对各 chain 开发资产查询接口
包括 token 的 名称 查 合约，合约 转 token 信息
token 的安全性检查
token 价格
地址 资产余额查询
地址 资产价值查询

以上查询 要考虑 批量查询时的性能问题，如 同一链的 token 和 address 用 multicall 合并请求，以提高性能

完成了这些基本查询以后

再结合现已实现的 数据引擎 完成 对地址的筛选，如 资产最多的 evm 地址，持有最多的 资产
这种类型的筛选尽量封装到 ai 可以用简单 参数查询

**已经实现了基本的地址余额查询**

下一步计划
token 查询
* 根据 name 查地址，根据地址 查 name decimal symbol
* 根据 address 查询 token 风险
* token 价格查询
* token 配置，配置本地各链的默认 token，后面可以提供一个配置余额，一个地址查询本地配置的 token 余额列表

asset 和 wallet 组合
可以 使用 key name 查询对应的 token 

# 1.0 可用标准
可以用 测试 keys 完成 导入 备份 恢复 余额查看 转账



# 后期开发
专门做一个 模块，通过各平台检索 根据 token 的 symbol 或者 其他信息 获取 token 的详细信息，包括 流动性 流通量

需要完善 token search 功能，通过 name 查询 token 各种问题
还有 通过 一个 地址 查到价格 即使这个 token 是加了 两层 pair
还有对 token 的 交易 检查
不同链 的 token search 不同
要做的 能覆盖长尾token

还有个 address search ，把地址的 所有 资产 查询出来，包括不同链的
再来个 contract search ，对合约解析 包括 交易解析
这三个 search 是三个大的模块，决定了 agent 的能力，所以应当是一个大模块

# 开发计划
## search 板块
token search 
trade search
contract search
address search

## search 架构
和 provider 一样，基于每条链独立开发一个 searchprovider，在用一个 action 集成
比如 搜索 ordi ，action -> btc chain token search + evm ... -> 汇总到 action -> 处理输出

## 数据结构讨论

数据数 + 数据操作，在缓存中维护一颗 wallet tree ，每个 钱包的 name 地址 余额 交易记录 等 放到 tree 里，再提供一系列操作接口修改 tree

类似前端 的 数据绑定 ui 的思路，以 tree 为 核心维护

## cli 界面修改

分为 上下部分，上面 显示结果，下面负责输入，显示面板 可以在一些情况下提供输入，比如配置私钥时




 task assets:query assets.token-price --query 0xb45e6dd851df10961d1aad912baf220168fcaa25 --network bsc --forceRemote true --debugStats true