# 多机迁移执行清单（旧机 -> 新机）

目标：在不泄露敏感数据的前提下，将项目迁移到另一台电脑，并确保功能、开发环境、AI上下文可继续使用。

## A. 旧机收尾（必须先完成）

- [x] A1. 工作区干净（无未提交变更）
- [x] A2. 当前分支与远端同步
- [x] A3. 全部分支与标签已推送
- [x] A4. 仓库中无敏感文件被跟踪
- [x] A5. 记录当前基线（commit、Node、pnpm 版本）

执行命令：

```bash
git status --short
git branch -vv
git push --all
git push --tags
git -C "$REPO_ROOT" ls-files | grep -Ei '(^|/)(storage|backup|restore|cache)(/|$)|(^|/)\.env($|\.)|\.pem$|\.key$|\.p12$|\.jks$|\.kdbx$|\.enc\.json$'
git rev-parse HEAD
node -v
pnpm -v
```

通过标准：
- `git status --short` 无输出。
- `git branch -vv` 显示当前分支已追踪且不落后。
- `git push --all` 与 `git push --tags` 无错误。
- 敏感文件检查命令无输出。

当前执行结果（2026-04-23）：
- A2: main -> origin/main 同步。
- A3: `git push --all` 已将 `feature/key-core-standalone` 推送到远端；`git push --tags` 无更新。
- A4: 精准规则检查无输出。
- A5:
	- commit: `ac495f811b8f68c833b8b84b318bbef39996c4ef`
	- node: `v24.13.0`
	- pnpm: `10.33.0`

## B. AI上下文迁移（建议完成）

- [x] B1. 将长期有效的决策/规范写入仓库文档（并提交）
- [x] B2. 将本地仅有的重要提示词或规则导出备份
- [ ] B3. 启用 VS Code Settings Sync

建议沉淀位置：
- `packages/core/plan/`
- `DEV_STANDARDS.md`
- `IMPORTADDRESS_TEST_GUIDE.md`

当前执行结果（2026-04-23）：
- B1: 已新增 `packages/core/plan/ai-context-handoff.md`。
- B2: 本机未发现独立 prompts 目录，已导出 VS Code 关键配置备份：
	- `~/Desktop/migration-backup-YYYY-MM-DD/vscode-user-config.tar.gz`

## C. 新机落地（clone后执行）

- [ ] C1. 安装与旧机一致的大版本 Node
- [ ] C2. 安装 pnpm
- [ ] C3. clone 仓库并切到主分支
- [ ] C4. 安装依赖（冻结锁文件）
- [ ] C5. 运行关键命令验证（CLI、测试、page-import）
- [ ] C6. 启用仓库 pre-commit 脱敏钩子

执行命令：

```bash
git clone <repo-url>
cd contractHelper
git switch main
git pull --ff-only
git config core.hooksPath .githooks
pnpm install --frozen-lockfile

# 建议验证
pnpm --filter @ch/core test
cd packages/core && pnpm key --help
cd packages/core && pnpm key page-import
```

通过标准：
- 依赖安装无报错。
- `@ch/core` 测试通过。
- `pnpm key --help` 正常输出。
- `pnpm key page-import` 可打开页面并完成提交。

## D. 敏感数据补齐（手动）

- [ ] D1. 在新机按需补 `.env`（不要提交）
- [ ] D2. 按需导入密钥材料（不要提交）
- [ ] D3. 再次执行敏感文件被跟踪检查

## E. 回归签收

- [ ] E1. 执行一遍完整关键流程
- [ ] E2. 新机进行一次 commit + push 验证协作链路
- [ ] E3. 记录迁移日期与结果

迁移记录：
- 日期：2026-04-23
- 旧机基线 commit：3450f19（main）
- 新机验证结果：
- 遗留问题：
