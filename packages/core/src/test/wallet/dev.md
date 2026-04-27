# wallet 模块开发切片计划

## 当前进度
- 已完成: 基础 key 管理、unlock/lock、provider 注册与 signer 能力。
- 当前切片: S-1 为 wallet 暴露直接 tree 读取接口，避免调用方手动拼装 listKeys/getSessionState。
- 下一切片: S-2 为 `wallet.getTree({ chains })` 按请求补齐缺失地址，并回写到 wallet tree 数据源缓存，避免重复结算。
- 下一切片: S-3 为 wallet/index 文件拆分（工具函数与 address-config 解析函数模块化），不改变行为。
- 下一切片: S-4 为 provider 与 tree-cache 逻辑继续外提模块化，进一步收敛 index.mjs。
- 下一切片: S-5 为 key catalog 逻辑外提（load/list/meta/dev/record lookup）。

## S-1 需求理解
- 输入:
  - 调用 `wallet.getTree()`。
- 输出:
  - 返回与内部 tree 快照一致的对象，结构为 `{ ok, action, tree, counts, warnings }`。
- 边界:
  - 无已解锁 key 时应返回空树结构，不抛错。
- 失败路径:
  - 派生地址失败不抛错，进入 warnings。

## 切片与测试映射
- S-1.1 wallet 暴露 `getTree` 公共接口
  - 覆盖: `src/test/wallet/core.test.mjs`。
- S-1.2 run 脚本优先使用 `wallet.getTree`
  - 覆盖: 手动运行 `src/run/test.mjs`（调试脚本，不纳入单测）。

## 设计决策
- `getTree` 直接复用既有 `buildWalletTreeSnapshot()`，不新增第二套 tree 构建逻辑。
- `run/test.mjs` 优先调用 `getTree`，兼容回退老路径（listKeys + getSessionState）。

## 验收标准
- `wallet.getTree()` 可直接返回 tree 快照。
- 已有 `unlock` 相关行为无回归。
- 受影响测试通过。

## S-2 需求理解
- 输入:
  - 调用 `wallet.getTree({ chains })`，其中 `chains` 支持字符串数组与 `{ chain, addressTypes }`。
- 输出:
  - 返回 tree 快照；若某 key 缺少指定 chain 地址，则按 chain 请求调用 signer 生成。
  - 生成结果写入会话缓存（`session._configuredAddresses`），后续再次调用应复用缓存。
- 边界:
  - 无 provider 或单个 chain 生成失败不抛错，进入 warnings。
  - 已有地址不重复生成。
- 失败路径:
  - signer/getAddress 失败仅记录 warnings，不中断其它 key/chain。

## S-2 切片与测试映射
- S-2.1 getTree 支持 `chains` 请求并在缺失时生成地址
  - 覆盖: `src/test/wallet/core.test.mjs` 新增用例。
- S-2.2 生成地址回写缓存并在第二次调用复用
  - 覆盖: 同一用例内校验 provider getAddress 调用次数不增长。

## S-3 需求理解
- 输入:
  - 无新增业务输入，属于内部结构重构。
- 输出:
  - 将 `wallet/index.mjs` 中纯工具与 address-config 解析函数拆分到独立文件。
- 边界:
  - 不改公开 API，不改既有行为。
- 失败路径:
  - 若拆分导致导入错误或行为变化，应回归测试拦截。

## S-3 切片与测试映射
- S-3.1 提取纯工具函数到 `apps/wallet/utils.mjs`
- S-3.2 提取 address-config 解析函数到 `apps/wallet/address-config.mjs`
- 覆盖: 运行 `src/test/wallet/core.test.mjs` 与受影响回归。

## S-4 需求理解
- 输入:
  - 无新增业务输入，继续内部结构重构。
- 输出:
  - 提取 provider 注册/查询能力到独立模块。
  - 提取 tree 地址缓存辅助逻辑到独立模块。
- 边界:
  - 不改外部 API，不改错误语义。
- 失败路径:
  - 导入依赖错位导致行为变化应由回归测试拦截。

## S-4 切片与测试映射
- S-4.1 外提 provider 逻辑到 `apps/wallet/provider-ops.mjs`
- S-4.2 外提 tree 缓存逻辑到 `apps/wallet/tree-cache.mjs`
- 覆盖: `src/test/wallet/core.test.mjs` + 钱包会话与 unlock 受影响回归测试。

## S-5 需求理解
- 输入:
  - 无新增业务输入，继续内部重构。
- 输出:
  - 将 key catalog 相关逻辑模块化，包含 `getRecordOrThrow/findSecretByKeyId/loadKeyFile/listKeys/getKeyMeta/loadDevKeys`。
- 边界:
  - 不改外部 API，不改 keyId、tags、sourceFile 等行为。
- 失败路径:
  - 文件扫描/读取异常与原错误语义保持一致。

## S-5 切片与测试映射
- S-5.1 新增 `apps/wallet/catalog-ops.mjs`
- S-5.2 `apps/wallet/index.mjs` 改为组合调用 catalog 模块
- 覆盖: `src/test/wallet/core.test.mjs` + 受影响回归测试。
