# QuickLex 速查

**简体中文** | [English](README.en.md)

面向 **Zotero 10.0** 的离线英汉 / 俄汉查词插件，**Windows 与 macOS 使用同一个 XPI**。双击英文或俄文单词，自动识别语言，在 Zotero 原生选词弹窗中显示中文释义。词库随插件安装，自动查词无需联网、无需 API Key。

**当前为 0.2.1 公开试用版。** 俄汉词库从 17,383 扩充到 95,604 个词条，词形索引从 71,489 扩充到 1,373,925 个键，修复 `статистические` 等大量变形查不到的问题。英文查词和 Windows / macOS 支持继续保留。请在 Issues 中附上 Zotero 版本、操作系统、问题单词和复现步骤。

## 安装：Windows / macOS

1. 在 [v0.2.1 Release](https://github.com/vbcnft59/zotero-quicklex/releases/tag/v0.2.1) 的 **Assets** 中下载 **`quicklex-0.2.1.xpi`**，无需解压。Intel Mac、Apple Silicon Mac 和 Windows 下载同一个文件。
2. 在 **Zotero 桌面客户端** 中打开 **工具 → 插件**（或“附加组件”），点击右上角齿轮，选择 **从文件安装插件**，选中这个 XPI。macOS 的“工具”位于屏幕顶部菜单栏。
3. 若已安装 QuickLex，直接安装新版 XPI；若更新后功能未出现，重启 Zotero。
4. 打开可选中文字的 PDF，双击 `novel`、`наука` 或 `исследования`。也可拖选单个词，无需切换语言。
5. **工具 → QuickLex 速查 → 查一个单词…** 支持输入英文或俄文；同一菜单可开关自动释义。

要求 **Zotero 10.0.x**。请在“关于”窗口核对版本，其他大版本不在兼容范围内。GitHub 的 **Source code (zip/tar.gz)** 是开发源码，安装请选择 `.xpi`；Release 附有 `.sha256` 校验文件。

此试用版通过安装新 XPI 手动更新，启动时关闭本插件的后台更新。清单中的保留域名 `quicklex.invalid` 为占位地址，手动检查插件更新会失败。0.1.0 缺少 HTTPS 更新地址导致安装失败的问题已在 0.1.1 修复，后续版本保留修复。若旧翻译插件也自动弹窗，可关闭其自动查词。QuickLex 可通过 Zotero 插件管理器停用或卸载。

![QuickLex 阅读器选词查词效果](展示图.png)

上图为英文选词示例；俄语使用同一位置的卡片，显示俄汉来源和可点击的词条署名。

## 查词功能

| 功能 | 英文 → 中文 | 俄文 → 中文 |
| --- | --- | --- |
| 本地词条 | 399,213 | 95,604 |
| 来源 | [ECDICT](https://github.com/skywind3000/ECDICT) | [中文维基词典，经 Kaikki/Wiktextract 提取](https://kaikki.org/zhwiktionary/%E4%BF%84%E8%AA%9E/index.html) |
| 词形索引键 | 56,954 | 1,373,925，含维基词典和 OpenCorpora 收录的变格、变位及省略 ё 的写法 |
| 加载方式 | 异步预载 8,000 个常用词，其余按需读取 | 按需读取小分片，首次查词不批量预载俄语词库 |
| 额外信息 | 可展开词库已有的英文释义 | 保留源中文义项、词性、用法标签及可用音标，部分为繁体 |

- **速度优先**：英文分为 256 个分片，俄文分为 1,024 个分片，各缓存最多 2,048 个结果和 24 个分片，合并并发读取。只查英文时不读取俄语数据。
- **多义项**：保留源词库已有的中文义项，长内容可滚动。俄语 `мир` 包括“和平”“世界”，`учёный` 包括形容词和名词义项。
- **词形还原**：英文保留原词与原形，例如 `found` / `find`、`leaves` / `leaf` / `leave`；简单词尾推测标注“可能的原形”。俄语合并维基词典与 OpenCorpora 的明确词形关系，例如 `исследования` → `исследование`、`методы` → `метод`、`идёт` → `идти`。
- **PDF 选词处理**：处理大小写、部分标点、软连字符、连字和换行断词；俄语支持 `НАУ́КА` 等带重音写法，保留 `ё` 和 `й`，索引词库中含 `ё` 单词省略两点的写法。英俄文字母混合的词不触发，避免混淆字符误查。
- **手动在线补查**：只有点击“在线补查”或俄语词条来源才打开浏览器。英文使用有道，俄语使用中文维基词典；自动查词不发送单词、PDF 或正文。

俄语数据同时导入上游“俄语”和“俄語”两份分区，以 `lang_code=ru` 合并，避免漏收简繁语言名下的词条。形态数据在构建时编译，插件运行时无需 Python 或其他外部程序。俄语中文释义未经英文中转或 AI 生成。词库覆盖有限，不保证每个常见词、专业术语或所有变形都已收录。插件不会根据上下文判定义项，也不提供整句、一般多词短语翻译或扫描 PDF 的 OCR。

## 速度与验证范围

0.2.1 在 Windows / Node.js 24 / Ryzen 9 8945HS 上测量同一引擎，英文样本 20 词、俄文样本 13 词：

| 情况 | 中位数 | P95 |
| --- | ---: | ---: |
| 英文，插件缓存为空 | 2.015 ms | 4.977 ms |
| 英文，常用词预载后的首轮混合查询 | 0.217 ms | 4.968 ms |
| 俄文，插件缓存为空 | 3.487 ms | 5.594 ms |
| 英文，缓存结果，重复查询 1,000 次 | 0.002 ms | 0.004 ms |
| 俄文，缓存结果，重复查询 1,000 次 | 0.003 ms | 0.005 ms |

见 [0.2.1 基准数据](docs/benchmark-0.2.1.json)。**这些是 Node.js 文件读取与查询耗时，系统磁盘缓存可能已热；不含 XPI 解压、Zotero 原生弹窗等待、DOM 渲染和绘制，也不是与其他插件的速度对比。** 卡片计时从本插件收到选词事件开始，不代表完整双击响应时间。

27 项 JavaScript 测试和 5 项 Python 数据转换测试通过。新版 XPI 已在 Windows Zotero 10.0.6 独立配置与空文献库中验证启用、菜单及真实 DOM 释义渲染，包括英文、俄文、变格和省略 ё 的查询。

[GitHub Actions](https://github.com/vbcnft59/zotero-quicklex/actions) 检查 Windows、macOS Apple Silicon、macOS Intel 和 Linux 的构建与测试；两个 macOS 任务还使用官方 Zotero 10.0.6 加载 XPI，验证菜单和注册的选词回调。运行状态及原生报告见任务和附件。**程序触发回调不能代替真实 PDF 双击、不同阅读器窗口及插件共存的完整体验测试。** 详见 [0.2.1 验证说明](docs/validation-0.2.1.md)，[0.1.1 记录](docs/validation.md) 保留供参考。

## 本地开发

需要 Python 3.10+、Node.js 18+，无需 npm 依赖。Windows 使用 `python`，macOS / Linux 通常使用 `python3`：

```sh
python3 scripts/download_sources.py
python3 scripts/build_dictionary.py
npm test
python3 -m unittest discover -s tests -p "test_*.py"
node scripts/benchmark.cjs
python3 scripts/package.py
```

第一步联网下载固定版本词库，其他步骤可离线运行；两份词库都做 SHA-256 校验。结果为 `dist/quicklex-0.2.1.xpi` 及校验文件。仓库不保存生成分片，Release XPI 已内置两份词库。俄语两份原始输入以固定哈希的 gzip 快照分别在 0.2.0 / 0.2.1 Release 分发；构建脚本还下载固定版本的 OpenCorpora 数据包及纯 Python 读取器到 `.cache`，无需全局安装，见 [来源元数据](docs/russian-source.json)。

原生检查创建工作区内独立配置和空文献库，不使用个人配置。macOS 示例：

```sh
python3 scripts/native_smoke.py --executable /Applications/Zotero.app/Contents/MacOS/zotero
```

浏览器预览：运行 `python3 -m http.server 8765 --bind 127.0.0.1`，打开 `http://127.0.0.1:8765/demo/`，可试查英俄文。端口占用时换端口，停止服务按 `Ctrl+C`。预览与插件共用代码和词库，不能代替 Zotero 验证。

`addon/` 为插件，`scripts/` 为下载、词库转换、基准、原生验证与打包工具，`tests/` 覆盖选词、多义项、词形、缓存、重试、生命周期和来源署名。可选的 `download_sources.py --references-only` 下载官方接口参考源码。

## 许可证

插件代码与 ECDICT 使用 MIT 许可。俄汉词库及转换数据独立采用 **CC BY-SA 4.0**，署名中文维基词典及 OpenCorpora 贡献者，保留词条来源和许可全文。OpenCorpora 原始数据采用 CC BY-SA 3.0，转换后的组合数据采用 4.0；两份许可均随 XPI 附带。转换脚本公开，中文释义保留源文本。见 [LICENSE](LICENSE)、[第三方声明](THIRD_PARTY_NOTICES.md) 和 [CC BY-SA 4.0 全文](docs/licenses/CC-BY-SA-4.0.txt)。
