# AI 上下文交接（迁移到新电脑）

更新时间：2026-04-23
适用仓库：moneyOS / contractHelper

## 1) 当前稳定基线

- 主分支基线（执行本文件时）：`544c55d`
- Node：`v24.13.0`
- pnpm：`10.33.0`

## 2) 近期关键修复（新机必须具备）

- page-import 前端 400 问题修复：
  - 先补齐依赖：`@noble/hashes`、`@noble/ciphers`
  - 再修复 vendor 路径解析：不能写死相对 `node_modules` 路径
  - 最终方案：在 `key-page-import-server.mjs` 中用包主入口解析并向上定位 package root

- 依赖完整性修复：
  - `@ch/core` 明确声明 `dotenv`
  - lockfile 已同步

- 仓库清理：
  - `storage`、`legacy` 已从 Git 跟踪移除
  - `.gitignore` 已更新为更稳妥规则

## 3) 已知高风险点（避免再次踩坑）

- 使用 `git filter-repo` 前，必须先提交或 stash 未提交改动。
- 不要假设 pnpm 的包物理路径固定在某一层 `node_modules`。
- 敏感数据仅保留本地：`.env`、`storage`、密钥材料等。

## 4) 新机拉起后最小验证路径

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter @ch/core test
cd packages/core && pnpm key --help
cd packages/core && pnpm key page-import
```

通过标准：

- 依赖安装完成，无缺包报错。
- `@ch/core` 测试通过。
- `key page-import` 能生成页面并完成提交。

## 5) AI 工作连续性建议

- 将长期有效规则优先沉淀在仓库内文件（plan/ 与标准文档），不要只保留在聊天历史。
- 新机首次接手时，先阅读：
  - `DEV_STANDARDS.md`
  - `packages/core/plan/migration-checklist.md`
  - `packages/core/plan/ai-context-handoff.md`
- 若有个人 VS Code 偏好，使用本地备份包恢复（settings/snippets）。

## 6) 本地备份产物（旧机）

- 已导出 VS Code 用户配置备份压缩包（settings/snippets）。
- 备份文件请保存在你自定义的安全目录，不在仓库文档中记录本机具体路径。
