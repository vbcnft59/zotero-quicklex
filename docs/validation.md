# 0.1.1 验证范围

验证日期：2026-10-14。客户端：Windows 上的 Zotero 10.0.6。测试使用独立配置和空文献库。

## 实际客户端验证

- 复现 0.1.0 的安装失败，安装器错误码为 `-3`，详细错误为 `applications.zotero.update_url not provided`。
- 修复后的 0.1.1 通过安装器解析：`error=0`，`isCompatible=true`，`appDisabled=false`。
- 在独立配置中实际加载：`active=true`，`userDisabled=false`，后台自动更新为关闭。
- 工具菜单正常注册，使用“QuickLex 速查 → 查一个单词…”查询 `novel`，能返回“小说”“新奇的”等中文释义。
- 正常关闭测试实例时完成插件窗口卸载和 shutdown。

实际查词截图见 [zotero-lookup.jpg](images/zotero-lookup.jpg)。

## 自动化检查

19 项测试通过，覆盖：

- PDF 选词规范化与多词选择过滤。
- 真实词库的多义项、原词与多个原形的保留。
- 常用词预加载、结果和分片缓存上限、并发读取合并。
- 词库读取失败重试，以及异步读取期间的插件卸载。
- 插件生命周期、菜单开关、查询结果过期处理与文本安全插入。
- Zotero 10 必需清单字段、HTTPS 更新地址和试用版的手动更新策略。
- 全部词典分片的散列路由及词形索引引用完整性。

复现：完成词库构建后，运行 `node --test tests/core.test.cjs tests/runtime.test.cjs tests/manifest.test.cjs`。

## 尚待验证

PDF 阅读器中完整的双击选词与弹窗交互、macOS/Linux 客户端、其他 Zotero 版本，以及与其他翻译插件同时启用时的行为，尚未完成实机验证。自动化宿主测试和浏览器卡片预览不能代替这些验证。

## 基准测试

[benchmark.json](benchmark.json) 来自同一查词引擎的 Node.js 文件读取测试，不代表从双击到屏幕显示的完整耗时；其中不包含 XPI 解压、Zotero 原生弹窗等待或界面绘制，操作系统磁盘缓存也可能已热。尚未与其他翻译插件做实测对比。
