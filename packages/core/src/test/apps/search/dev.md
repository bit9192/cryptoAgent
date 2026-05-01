# 需求
只是做各链接口的集合与参数分发。
流程实现不要大步推进，拆小切片，从最基础接口开始开发。

# 设计目标
统一对外提供 4 个入口：

1. engine.asset.byAddress
2. engine.balance.batch
3. engine.trade.search
4. engine.token.search

新增地址预检入口：

5. engine.addressCheck

addressCheck 只做本地识别与上下文输出，不查链上余额、不做资产发现。

# 接口边界
1. asset.byAddress
- 输入：chain, address, network?, limit?, timeoutMs?
- 职责：查一个地址的资产集合（发现 + 余额）

2. balance.batch
- 输入：rows[]，每行至少包含 chain, network, address, token
- 职责：批量余额刷新（只查余额，不做资产发现）

3. trade.search
- 输入：chain, query, network?, limit?, timeoutMs?
- 职责：查询交易对/市场信息

4. token.search
- 输入：chain, query, network?, limit?, timeoutMs?
- 职责：查询 token 信息

5. addressCheck
- 输入：query（地址文本）
- 职责：本地地址格式识别，返回 chain/addressType/normalizedAddress/networks/providerIds 等上下文
- 约束：不触发任何远程请求

# 架构约束
1. search 聚合层只做注册、路由、分发、统一输出。
2. 禁止在聚合层写死链名分支逻辑。
3. 链差异下沉到各链 provider 与 address-check 模块。
4. 新增链应通过注册接入，不改中心分支。

# 切片计划
S-1：接口骨架与参数校验
- 在 engine 中定义 asset.byAddress / balance.batch / trade.search / token.search / addressCheck 入口。
- 暂不接真实链路，仅做参数结构校验与错误语义统一。

S-2：addressCheck 分发
- 接入 btc/trx/evm 的 address context checker。
- 输出统一 address-context 结构。

S-3：token.search 分发
- 接入默认 token providers。
- 只实现单次 search，不扩展 batch。

S-4：asset.byAddress 分发
- 接入默认 address providers。
- 返回统一 candidates。

S-5：trade.search 分发
- 接入默认 trade providers。

S-6：balance.batch 分发
- 接入各链 batch-balance 入口。
- 按 chain 分组分发并合并结果。

# 当前实现顺序
先做 S-1（最小骨架），通过后再做 S-2。

