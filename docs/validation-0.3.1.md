# QuickLex 0.3.1 常规英汉版验证

日期：2026-10-15。

## 版本边界

- 默认 `main` 分支仅支持英文 → 中文；俄汉及 DSL 导入完整保留在 [`russian`](https://github.com/vbcnft59/zotero-quicklex/tree/russian)。旧发行版与 Git 历史保留。
- 常规版仅下载、编译和打包 ECDICT：399,213 个词条、56,954 个词形索引键，预载 8,000 个常用词。
- 安装包从明确的文件清单构建，排除切换分支后残留在 `build/dictionary/ru/` 的数据；不包含俄语模块、词库、形态数据或许可文件。
- 不读取或清理旧俄语版保存的自备词典；切回俄语版时可以继续使用。

## 自动验证

`npm test`：21 项通过。覆盖完整英文分片、词形引用、多义项、并发读取、缓存、读取失败重试、停用清理、macOS 空格 / Unicode 配置路径；另验证俄文选词不生成查词卡片，工具菜单仅提供英汉功能。

`python -m unittest discover -s tests -p "test_*.py"`：1 项实际发行包检查通过。逐项校验 ZIP 文件清单仅含英汉运行文件、ECDICT 数据及通用文档，并核对包内版本、CRC 与 SHA-256。该检查在本地仍有俄语构建缓存时执行。

## Windows 原生 Zotero

Windows Zotero 10.0.6 / x86_64-msvc，工作区独立配置及空文献库：

- 安装包启用且兼容，版本为 0.3.1，工具菜单注册成功。
- 实际阅读器回调与真实 DOM 显示 `novel`、`bank`、`heterogeneity`、`found` 和 `analyses`。
- `found` 保留原词与 `find` 的含义；`analyses` 保留索引原形。
- 俄文选词不生成 QuickLex 卡片，菜单中没有俄汉和 DSL 控件。
- 检查完成后关闭隔离客户端，不使用或修改个人 Zotero 配置。

报告：`.cache/native-smoke-Windows-AMD64-1792030476486518300/report.json`。

最终 XPI 大小约 20.96 MiB，SHA-256：`4e8f4f03add676ee773948b6144e46b7a28ee134a786e39cca9500354744a398`。

## 持续集成与性能

[GitHub Actions](https://github.com/vbcnft59/zotero-quicklex/actions) 在 Windows、Linux、macOS Apple Silicon 与 macOS Intel 构建、测试和检查英汉发行包。两个 Mac 任务还使用官方 Zotero 10.0.6，验证上述原生功能，报告保存在任务附件中。独立俄语分支也启用相应的构建和原生检查。

[0.3.1 Node 基准](benchmark-0.3.1.json)：20 个英文样本，空插件缓存中位数 2.347 ms、P95 5.405 ms；预载后的混合查询中位数 0.085 ms，缓存结果中位数 0.001 ms。仅测 Node 文件读取和查询，磁盘缓存可能已热；不包含 XPI 解压、原生弹窗等待或 DOM 绘制，不能视为完整双击响应或其他插件对比。

程序调用阅读器回调不能代替不同 PDF、阅读器窗口和其他插件共存的完整体验测试。词库覆盖及语境判断限制继续存在。
