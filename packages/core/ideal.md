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



# 开发计划

当前已忘成了 密钥导入的粗陋功能
接下来完成 wallet 的使用

# 期望实现

在 ex:lon 模式下 可以 导入 key 到 wallet 里，根据 wallet name 选择 key 在对应的网络上操作，同时可以用 key 里的配置像 快速导入 配置的 地址到 keytree 上，方便用 name 或 直接的 地址 去 查询余额 转账

还有可以用 现有的 key 增加新的 path 配置 name 以便快速使用新地址

## 期望的操作

1. 查看 keys list
2. 导入钱包：将 key name 放到缓存列表中
3. 导入配置钱包：用 key 里的配置创建地址列表，放到缓存中
4. 查看 key 和 name 和 address 的列表
5. 移除钱包：可以 按 name 或 钱包名 移除缓存中的 key

上述操作可以在 ex 的缓存中 给到其他 接口使用，比如 可以先 生成 地址，然后根据 name 查询对应的 账户资产
