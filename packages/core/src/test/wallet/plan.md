# wallet 模块

wallet 模块主要负责从 本地的 key 里面读取文件 解密，然后组层密钥列表存在内部
同时提供一个注册接口，可以让外界程序挂载到wallet ，然后使用 签名 或各种操作时
可以读取 密钥

这里要怎么设计 才能保证安全，不泄漏

## 结论

wallet 不应该把私钥直接暴露给外界程序。

更安全的做法是：

1. wallet 只负责托管 key、解密 key、调度 key 使用
2. 各链自己提供 getAddress / sign / signTransaction 等能力
3. 各链把 provider 注入 wallet
4. 外界程序只能调用 wallet 的能力接口，不能拿到私钥明文

一句话：

不是 wallet 把 privateKey 给链模块，
而是 wallet 持有 privateKey，在内部调用链 provider 完成地址生成和签名。

---

## 为什么不应该把私钥直接给链模块

如果 wallet 对外暴露 privateKey 或 mnemonic，会有这些风险：

1. 外部模块可能打印日志
2. 外部模块可能缓存 secret
3. 外部模块异常时可能把 secret 带进 error
4. 外部模块可能被后续插件化，边界失控
5. secret 一旦离开 wallet，就很难保证不泄漏

所以 wallet 的安全边界必须是：

1. 私钥默认不可导出
2. 外部模块只能请求动作，不能请求 secret

---

## 推荐分层

### 1. modules/key

职责：

1. 读取加密 key 文件
2. 解密与解析
3. create / import / add / view / backup / restore
4. 不处理不同链的地址规则

它只负责 key 文件和 secret 的存取能力。

### 2. apps/wallet

职责：

1. 加载本地 key 文件
2. 维护内部 key 元信息列表
3. 注册不同链 provider
4. 对外暴露统一调用接口
5. 做权限、审计、确认、解锁策略

wallet 是受控密钥宿主，不是链实现。

### 3. apps/evm / apps/btc / apps/trx

职责：

1. 各自实现地址生成规则
2. 各自实现签名逻辑
3. 各自导出 wallet provider

也就是说：

1. EVM provider 知道怎么从 secret 生成 EVM address
2. BTC provider 知道怎么从 secret 生成 BTC address
3. TRX provider 知道怎么从 secret 生成 TRX address

wallet 不需要知道这些细节。

### 4. apps/index.js

这里作为装配层：

1. 创建 wallet 实例
2. 注入已实现链的 provider
3. 导出一个已装配好的 wallet/app 容器

规则是：

1. 提供了 provider 的链，可用
2. 未提供 provider 的链，不可用
3. provider 存在但未实现某操作，则该操作不可用

---

## 推荐接口模型

### 设计原则

这一版接口约束明确改成：

1. wallet 只负责管理 key、session、provider registry
2. wallet 对外只提供 signer，不提供链业务能力
3. getAddress / signMessage / signTransaction 不作为 wallet 公共接口暴露
4. 这些动作应由各链 signer 或各链 app 自己实现

也就是说：

1. wallet 是 signer 工厂
2. 各链 provider 是 signer 实现工厂
3. contract app 只依赖 signer，不依赖私钥

### wallet 公共接口

#### 1. loadKeyFile(input)

用途：

1. 从本地加密 key 文件加载 key 元信息到 wallet
2. 只建立 key catalog，不长期缓存 secret 明文

参数：

```ts
type LoadKeyFileInput = {
	file: string
	password?: string
	reload?: boolean
	tags?: string[]
}
```

返回：

```ts
type LoadKeyFileResult = {
	ok: true
	file: string
	loaded: number
	addedKeyIds: string[]
	skippedKeyIds: string[]
}
```

说明：

1. password 用于首次读取文件和解析 key metadata
2. reload 为 true 时允许重新同步文件内容
3. addedKeyIds 是新加入 catalog 的 key
4. skippedKeyIds 是重复或被过滤掉的 key

#### 2. listKeys(filter?)

用途：

1. 查看当前 wallet 已登记的 key 元信息
2. 不返回任何 secret 内容

参数：

```ts
type ListKeysInput = {
	type?: string
	tags?: string[]
	enabled?: boolean
	sourceFile?: string
}
```

返回：

```ts
type KeyMeta = {
	keyId: string
	name: string
	type: string
	sourceFile: string
	tags: string[]
	enabled: boolean
	status: 'loaded' | 'locked' | 'unlocked' | 'disabled'
	createdAt?: string
	updatedAt?: string
}

type ListKeysResult = {
	ok: true
	items: KeyMeta[]
	total: number
}
```

#### 3. getKeyMeta(input)

用途：

1. 获取单个 key 的元信息

参数：

```ts
type GetKeyMetaInput = {
	keyId: string
}
```

返回：

```ts
type GetKeyMetaResult = {
	ok: true
	item: KeyMeta
}
```

#### 4. unlock(input)

用途：

1. 为某个 key 建立一个短时 unlock session
2. 后续 signer 调用在 session 有效期内可以使用该 key

参数：

```ts
type UnlockInput = {
	keyId: string
	password: string
	ttlMs?: number
	reason?: string
	scope?: {
		chain?: string
		address?: string
		contracts?: string[]
		selectors?: string[]
	}
}
```

返回：

```ts
type UnlockResult = {
	ok: true
	keyId: string
	unlockedAt: string
	expiresAt: string
	scope: {
		chain?: string
		address?: string
		contracts?: string[]
		selectors?: string[]
	}
}
```

说明：

1. password 只用于校验，不应写入日志或返回值
2. ttlMs 默认建议较短，例如 5 分钟到 15 分钟
3. scope 用来限制 session 能做哪些动作

#### 5. lock(input)

用途：

1. 主动关闭某个 key 的 unlock session

参数：

```ts
type LockInput = {
	keyId: string
}
```

返回：

```ts
type LockResult = {
	ok: true
	keyId: string
	locked: true
}
```

#### 6. lockAll()

用途：

1. 一次性关闭所有 session

返回：

```ts
type LockAllResult = {
	ok: true
	count: number
}
```

#### 7. getSessionState(input)

用途：

1. 查看某个 key 当前是否可用
2. 仅返回 session 状态，不返回 secret

参数：

```ts
type GetSessionStateInput = {
	keyId: string
}
```

返回：

```ts
type GetSessionStateResult = {
	ok: true
	keyId: string
	unlocked: boolean
	unlockedAt?: string
	expiresAt?: string
	scope?: {
		chain?: string
		address?: string
		contracts?: string[]
		selectors?: string[]
	}
}
```

#### 8. listChains()

用途：

1. 返回当前已注册 provider 的链列表

返回：

```ts
type ListChainsResult = {
	ok: true
	items: Array<{
		chain: string
		operations: string[]
	}>
}
```

#### 9. supports(input)

用途：

1. 判断某条链是否支持某个 signer 能力

参数：

```ts
type SupportsInput = {
	chain: string
	operation: string
}
```

返回：

```ts
type SupportsResult = {
	ok: true
	chain: string
	operation: string
	supported: boolean
}
```

#### 10. getSigner(input)

用途：

1. 返回某条链的 signer 实例
2. 该 signer 内部回调 wallet 完成受控签名
3. 对业务层来说，这是 wallet 最重要的导出接口

参数：

```ts
type GetSignerInput = {
	chain: string
	keyId: string
	rpc?: unknown
	options?: Record<string, unknown>
}
```

返回：

```ts
type WalletSigner = {
	chain: string
	keyId: string
	getAddress: (options?: Record<string, unknown>) => Promise<string>
	signMessage?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
	signTransaction?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
	sendTransaction?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
}

type GetSignerResult = {
	ok: true
	signer: WalletSigner
}
```

说明：

1. signer 是链相关对象，不是通用原始对象
2. 不同链返回的 signer 可以有不同的 payload 结构
3. 但基础能力名应尽量统一

### wallet 禁止暴露的接口

1. getSecret(keyId)
2. exportPrivateKey(keyId)
3. exportMnemonic(keyId)
4. exportUnlockedSecrets()
5. 任何能直接拿到明文 secret 的对象引用

### wallet 内部接口

这一层不对业务代码开放，只给 wallet core 和 provider 使用。

#### 1. registerProvider(input)

用途：

1. 注册链 provider
2. 一般只在 apps/index.js 装配阶段调用

参数：

```ts
type RegisterProviderInput = {
	provider: WalletChainProvider
	allowOverride?: boolean
}
```

返回：

```ts
type RegisterProviderResult = {
	ok: true
	chain: string
	replaced: boolean
}
```

#### 2. withUnlockedSecret(input, executor)

用途：

1. 在受控作用域内临时解密 secret
2. 执行完成后立即清理 secret 引用

参数：

```ts
type WithUnlockedSecretInput = {
	keyId: string
	chain: string
	operation: string
	reason?: string
}
```

返回：

```ts
type WithUnlockedSecretExecutor<T> = (secret: {
	type: string
	value: string
	name?: string
}) => Promise<T>
```

说明：

1. 这是 wallet 的核心安全边界
2. secret 只能存在于 executor 作用域内
3. executor 结束后必须清理引用

#### 3. requireCapability(input)

用途：

1. 校验 key、session、chain、operation 是否允许执行

参数：

```ts
type RequireCapabilityInput = {
	keyId: string
	chain: string
	operation: string
	target?: {
		address?: string
		contract?: string
		selector?: string
		amount?: string
	}
}
```

返回：

```ts
type RequireCapabilityResult = {
	ok: true
	allowed: true
}
```

#### 4. audit(event)

用途：

1. 记录签名和能力调用审计日志
2. 日志必须脱敏

参数：

```ts
type AuditEvent = {
	at: string
	keyId: string
	chain: string
	operation: string
	status: 'ok' | 'error' | 'rejected'
	target?: {
		address?: string
		contract?: string
		selector?: string
	}
	message?: string
}
```

### chain provider 接口

provider 负责各链逻辑，wallet 不参与链协议细节。

#### provider 职责边界

provider 只负责这些事情：

1. 声明自己对应哪条链
2. 声明自己支持哪些 signer 能力
3. 根据 wallet 提供的受控能力创建 signer
4. 定义本链 signer 的 payload 结构和执行规则

provider 不负责这些事情：

1. 不负责读取本地 key 文件
2. 不负责保存或缓存 secret
3. 不负责管理 unlock session
4. 不负责业务合约封装
5. 不负责替 wallet 做审计记录

#### provider 必选字段

```ts
type WalletProviderOperation =
	| 'getAddress'
	| 'signMessage'
	| 'signTransaction'
	| 'sendTransaction'
	| 'signTypedData'
	| 'signPsbt'
	| 'broadcastTransaction'

type WalletProviderContext = {
	withUnlockedSecret: <T>(
		input: {
			keyId: string
			chain: string
			operation: string
			reason?: string
		},
		executor: (secret: {
			type: string
			value: string
			name?: string
		}) => Promise<T>
	) => Promise<T>
	requireCapability: (input: {
		keyId: string
		chain: string
		operation: string
		target?: {
			address?: string
			contract?: string
			selector?: string
			amount?: string
		}
	}) => Promise<{ ok: true; allowed: true }>
	audit: (event: {
		at: string
		keyId: string
		chain: string
		operation: string
		status: 'ok' | 'error' | 'rejected'
		target?: {
			address?: string
			contract?: string
			selector?: string
		}
		message?: string
	}) => Promise<void> | void
	getKeyMeta: (input: { keyId: string }) => Promise<GetKeyMetaResult>
}

type CreateSignerInput = {
	wallet: WalletProviderContext
	keyId: string
	rpc?: unknown
	options?: Record<string, unknown>
}

type WalletChainProvider = {
	chain: string
	version: string
	operations: WalletProviderOperation[]
	supports: (operation: WalletProviderOperation | string) => boolean
	createSigner: (input: CreateSignerInput) => Promise<WalletSigner> | WalletSigner
}
```

字段说明：

1. chain 是 provider 的唯一链标识，例如 evm、btc、trx
2. version 用于后续 provider 协议升级和兼容性判断
3. operations 是 provider 显式声明支持的 signer 能力
4. supports(operation) 必须与 operations 一致，不允许返回漂移结果
5. createSigner 是 provider 的核心入口

#### provider 可选字段

```ts
type WalletChainProvider = {
	chain: string
	version: string
	operations: WalletProviderOperation[]
	supports: (operation: WalletProviderOperation | string) => boolean
	createSigner: (input: CreateSignerInput) => Promise<WalletSigner> | WalletSigner
	validateOptions?: (options?: Record<string, unknown>) => void | Promise<void>
	getCapabilities?: () => Array<{
		operation: string
		description?: string
	}>
	destroySigner?: (signer: WalletSigner) => Promise<void> | void
}
```

说明：

1. validateOptions 用于校验 rpc、chainId、network 等链特有参数
2. getCapabilities 用于诊断和调试，不参与签名主流程
3. destroySigner 用于释放长连接、事件监听器或临时资源

#### provider 注册规则

1. 同一个 chain 默认只能注册一个 provider
2. 如果 chain 重复注册，必须显式 allowOverride
3. provider 注册成功后，wallet.listChains() 才能看到该链
4. provider 未注册时，wallet.getSigner({ chain }) 必须直接报错
5. provider 已注册但 operation 不支持时，supports() 必须返回 false

#### provider 错误约束

provider 抛出的错误必须满足这些约束：

1. 不能包含 secret、password、mnemonic
2. 不能包含原始交易明文中的敏感字段快照
3. 错误 message 只描述失败原因，不附带敏感上下文
4. 建议包含稳定 code，便于 wallet 和业务层识别

建议错误码：

```ts
type WalletProviderErrorCode =
	| 'PROVIDER_INVALID_OPTIONS'
	| 'PROVIDER_OPERATION_NOT_SUPPORTED'
	| 'PROVIDER_SIGNER_CREATE_FAILED'
	| 'PROVIDER_ADDRESS_DERIVE_FAILED'
	| 'PROVIDER_SIGN_FAILED'
	| 'PROVIDER_BROADCAST_FAILED'
```

### chain signer 接口

各链 signer 至少应实现一组最小能力。具体 payload 由各链自己定义。

```ts
type WalletSigner = {
	chain: string
	keyId: string
	providerVersion?: string
	capabilities?: string[]
	getAddress: (options?: Record<string, unknown>) => Promise<string>
	signMessage?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
	signTransaction?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
	sendTransaction?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
}
```

#### signer 约束

1. signer 可以被业务层持有，但不应持有明文 secret 副本
2. signer 的每次签名动作都应回调 wallet.withUnlockedSecret
3. signer 不应在实例字段上缓存 password 或解密结果
4. signer 可以缓存非敏感信息，例如 address、chainId、provider 引用

#### signer 推荐可选能力

```ts
type WalletSigner = {
	chain: string
	keyId: string
	providerVersion?: string
	capabilities?: string[]
	getAddress: (options?: Record<string, unknown>) => Promise<string>
	signMessage?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
	signTransaction?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
	sendTransaction?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
	signTypedData?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
	signPsbt?: (payload: unknown, options?: Record<string, unknown>) => Promise<unknown>
	destroy?: () => Promise<void> | void
}
```

#### signer 返回约束

建议 signer 的能力返回值遵循“结果对象优先”的风格，而不是直接裸字符串：

```ts
type SignResult<T = unknown> = {
	ok: true
	chain: string
	keyId: string
	operation: string
	result: T
	meta?: Record<string, unknown>
}
```

例如：

1. getAddress 返回 address 字符串即可
2. signMessage 返回 { ok, chain, keyId, operation, result, meta }
3. signTransaction 返回 { ok, chain, keyId, operation, result, meta }
4. sendTransaction 返回 { ok, chain, keyId, operation, result, meta }

#### provider 与 signer 的调用关系

推荐调用链：

1. wallet.getSigner({ chain, keyId, rpc, options })
2. wallet 查找 provider
3. wallet 调用 provider.createSigner(...)
4. provider 返回链相关 signer
5. 业务层调用 signer.getAddress 或 signer.signTransaction
6. signer 内部回调 wallet.requireCapability 和 wallet.withUnlockedSecret
7. 签名完成后由 wallet.audit 记录结果

说明：

1. EVM signer 可以额外实现 signTypedData
2. BTC signer 可以提供 psbt 相关方法
3. TRX signer 可以提供 trx transaction 签名方法
4. 这些都属于链实现，不属于 wallet core

---

## 推荐内部数据结构

### 1. Key Metadata

只保存非敏感元信息：

1. keyId
2. name
3. type
4. sourceFile
5. tags
6. enabled
7. status

不要把 privateKey 或 mnemonic 常驻挂在这个结构里。

### 2. Unlock Session

只记录解锁状态，不长期存储明文：

1. keyId
2. unlockedAt
3. expiresAt
4. reason
5. scope

### 3. Provider Registry

保存已注册 provider：

1. chain -> provider
2. 不允许重复覆盖，除非显式 allowOverride

---

## 推荐执行流程

### getSigner

1. 校验 chain provider 是否存在
2. 校验 keyId 是否存在且 enabled
3. 调用 provider.createSigner({ wallet, keyId, rpc, options })
4. 返回 signer 给业务层

注意：

1. 此时不一定需要立即解密 secret
2. 只有 signer 真正执行签名或地址推导时，才通过 wallet 内部接口临时解密

### signer.getAddress

1. signer 调用 wallet.requireCapability
2. signer 调用 wallet.withUnlockedSecret
3. 在受控作用域中用 secret 推导地址
4. 立即清理 secret 引用
5. 返回 address

### signer.signMessage / signer.signTransaction

1. signer 调用 wallet.requireCapability
2. 如有需要，走用户确认
3. signer 调用 wallet.withUnlockedSecret
4. 在受控作用域中完成签名
5. wallet.audit 记录结果
6. 清理 secret 引用
7. 返回签名结果

---

## 安全要求

### 1. 最小暴露原则

1. secret 不出 wallet 边界
2. 外界程序只拿结果，不拿私钥

### 2. 最小驻留时间

1. 不在启动时全量解密全部 key
2. 只在需要操作时临时解密
3. 用完立即释放引用

### 3. 日志脱敏

任何日志、错误、trace 里都不能出现：

1. privateKey
2. mnemonic
3. password
4. passphrase

### 4. 显式能力检查

对于未注册链或未实现动作，必须显式报错：

1. chain provider not registered
2. operation not supported

不要静默返回空值。

### 5. 不提供导出接口

默认不允许外部模块请求 raw secret。

如果未来一定要支持导出，也必须是：

1. 显式配置开启
2. 有独立确认流程
3. 有审计记录

---

## apps/index.js 装配建议

可以在 apps/index.js 中完成 provider 注入。

例如：

1. 创建 wallet 实例
2. 注册 evm provider
3. 注册 btc provider
4. 注册 trx provider
5. 导出 wallet

这样做的好处：

1. 链能力是否可用是显式的
2. 增加新链只需新增 provider 并注册
3. wallet 核心不需要修改

建议保证：

1. 注册成功的链才显示在 listChains() 中
2. 未注册链调用时立刻报错

建议导出的对象结构：

```ts
type AppContainer = {
	wallet: {
		loadKeyFile: Function
		listKeys: Function
		getKeyMeta: Function
		unlock: Function
		lock: Function
		lockAll: Function
		getSessionState: Function
		listChains: Function
		supports: Function
		getSigner: Function
	}
}
```

也就是说：

1. apps/index.js 导出 wallet
2. wallet 导出 signer 工厂
3. 业务模块自己拿 signer 去创建 contract 或 client
4. 合约业务不要继续塞回 wallet

---

## 最终建议

最终方案建议采用：

1. wallet 不处理多链 address 规则
2. wallet 不处理 contract 业务逻辑
3. 不同链把 provider 注入 wallet
4. wallet 只导出 key 管理接口和 getSigner
5. signer 内部再调用 wallet 完成受控签名
6. 外部模块不直接获得 privateKey

这是在“多链可扩展”和“密钥不泄漏”之间最平衡的设计。

---

## 后续实现建议

下一步实现顺序建议：

1. 先定义 wallet provider 接口契约
2. 再实现 wallet core 的 registerProvider / listChains / supports
3. 再给 evm 做第一版 provider
4. 最后在 apps/index.js 做装配导出

