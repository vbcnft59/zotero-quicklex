# 0.2.0 验证范围

日期：2026-10-14。本地客户端为 Windows Zotero 10.0.6。

## 本地检查

- 25 项 JavaScript 测试通过，覆盖英俄文选择、重音、ё / й、混合文字拒绝、真实多义项、词形、缓存、并发合并、重试、卸载及来源署名。
- 1 项 Python 数据转换测试通过，检查派生词不会误当变形、纯词形条目能回溯到中文释义原形，以及循环处理。
- 遍历 512 个分片，核对 JavaScript / Python 散列路由、词形引用、俄汉中文释义及原页面标题。
- 两份词库输入固定 SHA-256。俄语 17,383 个词条 / 71,489 个词形索引键，英文 399,213 / 56,954。
- XPI 检查确认两份词库、许可证、脚本及清单齐全；条目使用相对 POSIX 路径，无平台专用二进制。

复现：构建词库后运行 `npm test`、`python3 -m unittest discover -s tests -p "test_*.py"` 和 `python3 scripts/package.py`。

## 原生客户端检查

`scripts/native_smoke.py` 启动 Zotero，以工作区内新建的独立配置和空文献库加载**未修改的发布 XPI**。另一个仅供测试的伴随插件调用 QuickLex 实际注册的选词处理器，使用真实 DOM 验证 `novel`、`НАУ́КА`、`исследования`、`ученый`。检查版本、启用状态、兼容状态、工具菜单和释义，写报告后退出。未修改个人配置或文献库。

Windows 已通过：`version=10.0.6`、`active=true`、`compatible=true`、`appDisabled=false`，四个查询返回预期中文释义。

[CI](../.github/workflows/ci.yml) 在 Windows、macOS ARM64、macOS Intel 和 Linux 构建并运行代码测试。两个 macOS 任务还下载官方 Zotero 10.0.6 DMG，在含空格、中文的独立配置路径运行同一原生检查。**macOS 实际通过情况以 [Actions 对应提交](https://github.com/vbcnft59/zotero-quicklex/actions) 和附件 `report.json` 为准。** 构建与原生加载是不同检查。

程序触发回调没有模拟实际 PDF 上的物理双击，也未穷尽文档类型、独立阅读器和其他插件共存的情况。OCR、整句翻译不属于插件功能。

## 性能

[基准报告](benchmark-0.2.0.json) 使用实际多语言入口，英文预载常用词，俄语按需读取小分片，缓存独立。它不包含 XPI 解压、Zotero 原生弹窗、DOM 和屏幕绘制，不代表完整双击延迟或插件间比较。开发时发现俄语批量预载会拖慢首次查询，最终实现已取消这一步。
