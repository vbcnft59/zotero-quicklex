# QuickLex 速查

**简体中文** | [English](README.en.md)

面向 **Zotero 10.0** 的离线英汉 / 俄汉查词插件，**Windows 与 macOS 使用同一个 XPI**。双击英文或俄文单词，在 Zotero 原生选词弹窗中显示中文释义。自动识别语言，无需联网、无需 API Key。

**当前为 0.3.0 公开试用版。** 俄汉释义已从维基词典更换为 **БРуКС / BKRS.info**，包含 **122,937 个俄汉单词词条**、中文义项、拼音和例句；保留变格、变位查询。新增 **DSL 俄汉词典导入**，可优先使用自己的离线词典。英文查词继续使用 ECDICT。

## 安装：Windows / macOS

1. 在 [v0.3.0 Release](https://github.com/vbcnft59/zotero-quicklex/releases/tag/v0.3.0) 的 **Assets** 中下载 **`quicklex-0.3.0.xpi`**，无需解压。Intel Mac、Apple Silicon Mac 和 Windows 下载同一个文件。
2. 在 **Zotero 桌面客户端 → 工具 → 插件**（或“附加组件”），点击齿轮，选择 **从文件安装插件**，选中 XPI。macOS 的“工具”位于屏幕顶部菜单栏。
3. 已安装 QuickLex 时直接安装新版 XPI；若更新后功能未出现，重启 Zotero。
4. 打开可选中文字的 PDF，双击 `novel`、`наука` 或 `статистические`。也可拖选单个词。
5. **工具 → QuickLex 速查 → 查一个单词…** 支持英文或俄文；同一菜单可开关自动释义。

要求 **Zotero 10.0.x**。GitHub 的 **Source code (zip/tar.gz)** 是源码，安装请选择 `.xpi`。Release 附有 `.sha256` 校验文件和原始俄汉词库快照。

此试用版通过安装新 XPI 手动更新，启动时关闭本插件的后台更新。清单中的保留域名 `quicklex.invalid` 为占位地址，手动检查插件更新会失败。0.1.0 的安装问题已在 0.1.1 修复，后续版本保留修复。若旧翻译插件也自动弹窗，可关闭其自动查词。QuickLex 可通过 Zotero 插件管理器停用或卸载。

![QuickLex 阅读器选词查词效果](展示图.png)

上图为英文选词示例；俄语使用同一位置的卡片，并标明正在使用的词典名称。

## 导入其他俄汉词典

内置词库已可直接离线使用，无需导入。需要换成自己的词典时：

1. 准备**解压后的 `.dsl` 文本词典**，采用 **UTF-8** 或**带 BOM 的 UTF-16** 编码，文件不超过 **128 MiB**。本版暂不直接读取 MDX、LSD、StarDict、`.dsl.dz` 或 ZIP。
2. 打开 **工具 → QuickLex 速查 → 导入俄汉词典（DSL）…**，选择文件。转换完成后显示词典名称和导入词条数，无需安装 Python。
3. 后续查词**优先使用导入词典**，缺词时回到内置 БРуКС，卡片底部会显示实际来源。英文词库不受影响。
4. 需要撤回时点击 **恢复内置俄汉词典**，立即生效。再次导入会替换上一次导入的词典。

支持 DSL 中文义项、拼音、例句、多词头及参见条目；仅导入有中文释义的俄语单词和连字符词。排版标记转换为文本，不加载图片、音频或外部网页。**俄语变形复用内置索引已有的明确关系；新导入且不在内置索引中的词，需要用原形查询。** 不支持加密词典、整句翻译和一般多词短语取词。

导入数据以分片保存在当前 Zotero 配置目录的 `quicklex` 子目录，重启后自动恢复。导入失败会保留当前词典。原始文件不被修改，导入内容不上传、不由插件同步，也不会加入 GitHub 发布包；恢复内置时清理插件保存的导入分片。

## 查词功能

| 功能 | 英文 → 中文 | 俄文 → 中文 |
| --- | --- | --- |
| 内置单词词条 | 399,213 | 122,937 |
| 来源 | [ECDICT](https://github.com/skywind3000/ECDICT) | [БРуКС / BKRS.info](https://bkrs.info/p47)，2026-10-14 快照 |
| 词形索引键 | 56,954 | 1,505,408，含 OpenCorpora 明确变格、变位及省略 ё 的写法 |
| 额外信息 | 音标及可展开的英文释义 | 中文多义项、拼音、用法和例句；该词库不提供 IPA |
| 加载方式 | 异步预载 8,000 个常用词，其余按需读取 | 按需读取小分片，不批量预载俄语词库 |

- **速度优先**：英文分 256 片，内置俄文分 1,024 片，导入词典分 256 片；使用有界缓存并合并引擎内的并发读取。只查英文时不读取俄语释义分片。
- **多义项与例句**：保留源词库内容，长条目可滚动；俄语 `мир` 包括“和平”“世界”，`учёный` 包括“学者、科学家”等义项及搭配。
- **词形还原**：例如 `исследования` → `исследование`、`статистические` → `статистический`、`читает` → `читать`。俄语只使用明确的索引关系，不猜测词尾。英文的简单词尾推测仍标注“可能的原形”。
- **PDF 处理**：处理大小写、部分标点、软连字符、连字和换行断词；俄语支持 `НАУ́КА` 等重音写法，以及省略 `ё` 两点的写法。英俄字母混合的词不触发查询。
- **在线补查**：只有点击按钮才打开浏览器。英文打开有道，俄文打开 BKRS。自动查词和本地导入均不发送单词、PDF 或正文。

俄汉释义直接来自俄汉词典，没有英文中转或 AI 生成。词库仍可能存在错误和漏词；插件不根据上下文判定义项，不提供 OCR。新增词形索引在构建时生成，运行时无需 Python 或外部形态分析器。

## 速度与验证范围

0.3.0 在 Windows / Node.js 24 / Ryzen 9 8945HS 上测量内置词库，英文 20 词、俄文 13 词：

| 情况 | 中位数 | P95 |
| --- | ---: | ---: |
| 英文，插件缓存为空 | 1.754 ms | 4.422 ms |
| 英文，常用词预载后的首轮混合查询 | 0.089 ms | 4.348 ms |
| 俄文，插件缓存为空 | 3.337 ms | 6.041 ms |
| 英文，缓存结果，重复查询 1,000 次 | 0.002 ms | 0.004 ms |
| 俄文，缓存结果，重复查询 1,000 次 | 0.003 ms | 0.006 ms |

见 [0.3.0 基准数据](docs/benchmark-0.3.0.json)。**仅测量 Node.js 文件读取与查询，系统磁盘缓存可能已热；不含 XPI 解压、Zotero 弹窗等待、DOM 渲染和绘制，也不是与其他插件的速度对比。** 上表不代表自备词典的速度，卡片计时也不代表完整双击响应时间。

测试覆盖词库转换、全部分片及词形引用、来源署名、DSL 导入优先级、失败恢复、重启加载和缓存。原生检查在独立配置、空文献库中运行，不使用个人配置。[GitHub Actions](https://github.com/vbcnft59/zotero-quicklex/actions) 检查 Windows、macOS Apple Silicon、macOS Intel 和 Linux；两个 macOS 任务还使用官方 Zotero 10.0.6 加载 XPI，验证菜单、真实 DOM 释义和导入流程。详见 [0.3.0 验证记录](docs/validation-0.3.0.md)。**程序触发回调不能代替真实 PDF 双击、不同阅读器窗口和插件共存的完整体验测试。**

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

第一步下载固定版本词库，其他步骤可离线运行；数据以 SHA-256 校验。结果为 `dist/quicklex-0.3.0.xpi` 及校验文件。仓库不保存生成分片；XPI 已内置两份词库。БРуКС 原始 gzip 在本版 Release 保留，OpenCorpora 数据包和构建读取器下载到 `.cache`，无需全局安装。见 [俄汉来源](docs/russian-source.json) 和 [形态数据来源](docs/russian-morphology-source.json)。

原生验证（macOS 示例）：

```sh
python3 scripts/native_smoke.py --executable /Applications/Zotero.app/Contents/MacOS/zotero
```

浏览器预览：运行 `python3 -m http.server 8765 --bind 127.0.0.1`，打开 `http://127.0.0.1:8765/demo/`。预览共用内置词库和渲染代码；DSL 导入入口位于 Zotero 工具菜单。

## 许可证

插件代码与 ECDICT 使用 MIT。**БРуКС 释义依据 BKRS 官网的自由使用与分发声明分发**，保留署名及词条来源；该声明并非 MIT 或 Creative Commons 许可。OpenCorpora 原始形态数据采用 CC BY-SA 3.0，转换后的词形索引采用 CC BY-SA 4.0，两份许可全文均随 XPI 附带。自备词典适用各自条款。见 [LICENSE](LICENSE)、[第三方声明](THIRD_PARTY_NOTICES.md) 和 [BKRS 原文声明](docs/licenses/BKRS-PERMISSION.txt)。
