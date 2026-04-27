# wallet-session 开发切片计划

## 当前进度
- 已完成: S-0 基线行为（wallet.unlock / wallet.deriveConfigured / wallet.tree）
- 当前切片: S-1 `unlock 后挂载 session.tree，task 直接读取 session.tree`

## S-1 需求理解
- 输入:
  - wallet app: `unlock(input)`
  - task: `wallet.tree`
- 输出:
  - `unlock` 结果包含 `tree`
  - 对应会话 `session.tree` 挂载同一份 tree
  - task `wallet.tree` 不再二次构建，直接返回 `session.tree`
- 边界:
  - `session.tree` 缺失时，`wallet.tree` 返回空树与 warning
- 失败路径:
  - 派生地址失败时，tree 仍返回（仅 warning）

## 切片与测试映射
- S-1.1 wallet unlock 挂载 `session.tree`
  - 覆盖: `src/test/wallet/core.test.mjs`
- S-1.2 task `wallet.tree` 读取 `session.tree`
  - 覆盖: `src/test/tasks/wallet.session.task.test.mjs`

## 设计决策
- 保持单字段模型: 统一使用 `tree`
- tree 构建统一走 `buildWalletTree`，避免多处结构漂移
- task 层不再重建 tree，避免与 wallet 层不一致

## 验收标准
- `unlock` 后 `getSessionState` 可读到 `tree`
- task `wallet.tree` 与 session.tree 一致
- `session.tree` 缺失时返回空树和明确 warning
- 该切片测试通过，受影响测试通过
