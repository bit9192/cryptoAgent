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


# 1.0 可用标准
可以用 测试 keys 完成 导入 备份 恢复 余额查看 转账