# modules/key 开发计划

目标：为 key 模块建立稳定的密钥文档解析、加密存储、备份恢复与导入流程。

## 1. 模块范围

1. 密钥文档解析（mnemonic / privateKey / 噪声清洗）
2. 加密存储与读取（storage/key, storage/backup）
3. 导入与批量导入（create/import/add/imports）
4. 备份与恢复（SSS 分片 + restore）
5. 开发联调基线（固定 key testdata 导入流程）

## 2. 测试样本与测试文件

1. 测试样本：src/test/modules/key/testdata.md
2. 地址导出样本：src/test/modules/key/testdata.addresses.json
3. 解析测试：src/test/modules/key/test.mjs
4. 加密测试：src/test/modules/key/encrypt.test.mjs
5. 存储测试：src/test/modules/key/store.test.mjs
6. 分片测试：src/test/modules/key/sss.test.mjs

## 3. 切片计划

### Slice S-1：密钥文档解析最小闭环

本次只做：

1. parseKeyFile / parseKeyFileFromPath 基础能力
2. 支持 mnemonic / privateKey 识别
3. 支持注释与噪声处理

验收标准：

1. test.mjs 基础解析用例通过
2. 无名称场景报错并阻断导入流程（名称必填）

### Slice S-2：加密与解密能力

本次只做：

1. 单文件和目录打包加密
2. 解密恢复文件结构与内容

验收标准：

1. encrypt.test.mjs 全通过

### Slice S-3：存储分层与密码校验

本次只做：

1. common/backup 分桶写入
2. 已存储文件读取与密码校验

验收标准：

1. store.test.mjs 全通过
2. 错误密码立即失败

### Slice S-4：SSS 备份恢复

本次只做：

1. 2/3, 3/5 分片生成与恢复
2. 分片不足报错路径

验收标准：

1. sss.test.mjs 全通过

### Slice S-5：key 联调基线固化

本次只做：

1. 固化 key testdata 导入命令与命名约定
2. 在 ex:lon 会话中复用同一 key 文件做 key 相关联调
3. 明确重置基线流程（删文件后重导）

本次不做：

1. wallet tree 业务逻辑开发（由 modules/wallet-tree 独立负责）
2. 跨模块 API 改造

验收标准：

1. 能稳定生成 storage/key/wallet-tree-dev.enc.json
2. key view 可用同一密码解密
3. key 相关后续切片均复用该基线

## 4. 当前进度 / 下一步

当前进度：

1. 已完成 S-1 ~ S-4（解析、加密、存储、SSS）
2. 已完成一次 testdata 导入基线：wallet-tree-dev

下一步：

1. 完成 S-5 后，仅维护 key 导入/存储基线
2. wallet tree 开发在 src/test/modules/wallet-tree 独立推进

## 5. 开发门禁（执行前检查）

1. 先读本文件，再读 testdata.md
2. 本次切片必须在本文件中可定位
3. 一次只做一个切片
4. 涉及 privateKey/mnemonic/password 的输出必须过滤