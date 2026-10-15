# QuickLex 速查

**简体中文** | [English](README.en.md)

面向 **Zotero 10.0** 的离线英汉查词插件。双击英文单词，在 Zotero 原生选词弹窗中显示中文释义；支持音标、多义项、词形还原和可展开的英文释义。**Windows、Intel Mac 和 Apple Silicon Mac 使用同一个 XPI。** 自动查词无需联网、无需 API Key。

**当前 `main` 为常规英汉版 0.3.1，仅内置 ECDICT。** 俄汉查词及 DSL 导入保留在独立的 [`russian` 分支](https://github.com/vbcnft59/zotero-quicklex/tree/russian)。

| 版本 | 功能 | 安装包 |
| --- | --- | --- |
| 常规版 `main`（默认） | 英文 → 中文，离线查词 | [v0.3.1](https://github.com/vbcnft59/zotero-quicklex/releases/tag/v0.3.1) · `quicklex-0.3.1.xpi` |
| 俄语分支 `russian` | 英汉 + 俄汉，支持自备 DSL 词典 | [v0.3.0](https://github.com/vbcnft59/zotero-quicklex/releases/tag/v0.3.0) · `quicklex-0.3.0.xpi` |

两版使用同一插件 ID，安装另一版会切换版本。

## 安装：Windows / macOS

1. 在 [常规版 v0.3.1 Release](https://github.com/vbcnft59/zotero-quicklex/releases/tag/v0.3.1) 的 **Assets** 下载 **`quicklex-0.3.1.xpi`**，无需解压。
2. 在 **Zotero 桌面客户端 → 工具 → 插件**（或“附加组件”），点击齿轮，选择 **从文件安装插件**。macOS 的“工具”位于屏幕顶部菜单栏。
3. 选中 XPI。已有旧版或俄语版可直接安装常规版；若功能未刷新，重启 Zotero。
4. 打开可选中文字的 PDF，双击 `novel`、`analyses` 等英文单词。也可拖选单个词。
5. **工具 → QuickLex 速查 → 查一个单词…** 可手动查询；同一菜单可开关自动释义。

要求 **Zotero 10.0.x**。GitHub 的 **Source code (zip/tar.gz)** 是源码，安装请选择 `.xpi`。Release 附有 `.sha256` 校验文件。

通过安装新 XPI 手动更新，插件关闭自身后台更新。清单中的保留域名 `quicklex.invalid` 是占位地址，手动检查插件更新会失败。0.1.0 的安装问题已在 0.1.1 修复，后续版本保留修复。若旧翻译插件也自动弹窗，可关闭其自动查词。QuickLex 可通过 Zotero 插件管理器停用或卸载。

![QuickLex 阅读器选词查词效果](展示图.png)

## 查词功能

- **英汉离线词库**：[ECDICT](https://github.com/skywind3000/ECDICT)，399,213 个词条，56,954 个词形索引键。保留词库已有的音标、中文多义项和英文释义。
- **快速加载**：异步预载 8,000 个常用词，其余数据按需读取 256 个分片；最多缓存 2,048 个结果、24 个分片，合并并发读取。
- **词形还原**：保留原词与索引原形，例如 `found` / `find`、`leaves` / `leaf` / `leave`；简单词尾推测标注“可能的原形”。
- **PDF 处理**：处理大小写、部分标点、软连字符、连字及换行断词。长释义可滚动，英文释义按需展开。
- **在线补查**：只有点击按钮才打开有道词典；自动查词不发送单词、PDF 或正文。

常规版不加载俄语词库，不提供俄汉查词或 DSL 导入菜单；切换分支后本地残留的俄语构建文件也不会打入常规 XPI。旧俄语版保存的自备词典数据不会被常规版读取或删除，便于切回俄语分支继续使用。

词库可能有错误和漏词；插件不根据上下文判定义项，不提供整句翻译、一般短语翻译或 OCR。

## 速度与验证范围

[0.3.1 基准数据](docs/benchmark-0.3.1.json)：Windows / Node.js 24 / Ryzen 9 8945HS，20 个英文样本，空插件缓存查询中位数 **2.347 ms**、P95 **5.405 ms**；常用词预载后的混合首轮中位数 **0.085 ms**，缓存命中中位数 **0.001 ms**。

**仅统计 Node.js 文件读取与查询，系统磁盘缓存可能已热；不含 XPI 解压、Zotero 原生弹窗等待、DOM 渲染和绘制，也不是与其他插件的速度对比。** 卡片计时不代表完整双击响应时间。

自动测试覆盖词库、词形、缓存、重试、停用清理、macOS 路径和常规版打包边界。[GitHub Actions](https://github.com/vbcnft59/zotero-quicklex/actions) 检查 Windows、Linux、macOS Apple Silicon 和 macOS Intel；两个 Mac 任务还使用官方 Zotero 10.0.6 加载 XPI，在独立配置和空文献库中验证真实 DOM 查词及英汉菜单。见 [0.3.1 验证记录](docs/validation-0.3.1.md)。程序触发回调不能代替真实 PDF 双击、不同窗口和其他插件共存的完整体验测试。

## 本地开发

需要 Python 3.10+、Node.js 18+，无需 npm 依赖。Windows 使用 `python`，macOS / Linux 通常使用 `python3`：

```sh
python3 scripts/download_sources.py
python3 scripts/build_dictionary.py
npm test
node scripts/benchmark.cjs
python3 scripts/package.py
python3 -m unittest discover -s tests -p "test_*.py"
```

第一步仅下载固定版本的 ECDICT，数据通过 SHA-256 校验；其他步骤可离线运行。结果为 `dist/quicklex-0.3.1.xpi` 和校验文件。仓库不保存生成词库，安装包已内置英汉词库。切换到 `russian` 分支时，按该分支的 README 构建。

原生检查创建独立配置和空文献库，不使用个人配置。macOS 示例：

```sh
python3 scripts/native_smoke.py --executable /Applications/Zotero.app/Contents/MacOS/zotero
```

浏览器预览：运行 `python3 -m http.server 8765 --bind 127.0.0.1`，打开 `http://127.0.0.1:8765/demo/`。预览与插件共用英汉词库和卡片代码。

## 许可证

插件代码与内置 ECDICT 使用 MIT 许可。见 [LICENSE](LICENSE) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。俄语版的词库来源和许可见 [`russian` 分支](https://github.com/vbcnft59/zotero-quicklex/tree/russian)。
