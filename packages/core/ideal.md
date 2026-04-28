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
还差 contract search ，其他已完成，但是 价格获取 token 查询还是有限制，后期可以优化

## 数据结构讨论
### 已完成
已完成了 tree 的简单版本
还有 inputs 负责传递 wallet 给其他 函数

### 接下来的思路
现在已经解决 pickwallet 对钱包的检索操作，下一步 是 将结果用 参数提取器 使用，最后搭建任务流程

#### 待开发
各链 provide 提供一个 addressTypes 接口，返回所有地址类型，以便 pickwallet 可以用 key 之间 提取所有地址

提供一个 按地址 查询钱包名称的接口，一遍通过地址判断是哪个账户










## cli 界面修改
分为 上下部分，上面 显示结果，下面负责输入，显示面板 可以在一些情况下提供输入，比如配置私钥时


## 一些想到的点子

### 自动配置多链的模版 network 自动配置
根据 net name 自动 配置 各种地址 在 evm的config 里，包括 dex stable coin ，multi 等
是否可以 给出一个 模版生成程序，输入 链 name 以后，把 浏览器 rpc 接口查好，在 env 给出配置项，在 apps 下建好config ，在 test/apps/ 下建好 文件，并把 各种 标准 provide 得开发接口统一标准写好，甚至直接把接口 和 文件目录生成好，然后 ai 就可以 根据 dev 开始自动开发，可以做到不？

### 地址个性画像
输入一个地址后 根据 地址的资产，对各资产的检测后汇总，给出这个地址的投资风格，用于娱乐

### 虚拟钱包
可以启动一个浏览器，可以注入一个 钱包 provider ，用护打开 dapps 的 链接 后，web 可以发起交易，用户 在 cli 里输入 密码 确认，发送交易，相当于做一个 壳 可以使用各种 dapp

同时在提供 一套 对接 mcp 和 skills 的接口