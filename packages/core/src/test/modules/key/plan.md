# keys 开发

modules/key 模块只负责做文件加密 解密工作，功能参照了 legacy 的 key:dr:setup 命令


## 接口

文件预处理 - 将 testdata.md 中的格式转成 一个 名称和密钥 的列队，一遍可以给后面的函数使用

文件加密 - 可以将制定的 文件 或 文件夹里的所有文件 打包加密，加密方法分类参考 legacy 的

SSS 加密模块

加密存储 和 读取 - 分为两种分类:
    * 常用，文件加密存在 key 下面，给系统调用解密 获得 密钥列队
    * 备份，将文件存在 backup 下
<!-- 创建 key.json
参数： -->

已完成

create import add backup recory 基本操作

## 本地开发测试基线

后续 wallet / asset / search 联调，统一先使用 `src/test/modules/key/testdata.md` 导入测试钱包。

建议固定流程：

1. `pnpm key import --input ./src/test/modules/key/testdata.md --name key-dev-baseline --password <dev-password>`
2. 导入成功后，使用生成的 `storage/key/*.enc.json` 作为后续 `ex:lon` 与任务联调输入。
3. 如需重置测试基线，删除对应 `storage/key/<name>.enc.json` 后重新导入。