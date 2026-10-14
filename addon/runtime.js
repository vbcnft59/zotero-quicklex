var QuickLexRuntime = (() => {
  "use strict";
  function create({ Zotero, Services, rootURI, id, version }) {
    let active = false;
    const windows = new Map();
    const cards = new Set();
    const engine = new QuickLexCore.MultilingualDictionary({
      // Zotero's resource reader handles jar: URLs containing '@' in installed plugin filenames.
      loadJSON: async path => JSON.parse(await Zotero.File.getResourceAsync(rootURI + "data/" + path)),
    });
    const enabled = () => Services.prefs.getBoolPref("extensions.quicklex.enabled", true);
    const online = word => Zotero.launchURL(QuickLexCore.onlineURL(word));
    const source = url => Zotero.launchURL(url);
    const logError = error => Zotero.logError(error);
    const now = () => Date.now();

    function removeCards() {
      for (const ref of cards) {
        try { ref.deref()?.remove(); } catch (_) { /* A reader window may have closed. */ }
      }
      cards.clear();
    }

    function handleSelection({ doc, params, append }) {
      try {
        if (!active || !enabled()) return;
        const query = QuickLexCore.normalizeSelection(params?.annotation?.text);
        if (!query) return;
        let started = now();
        const view = QuickLexCard.create(doc, query, { onOnline: online, onSource: source });
        for (const ref of cards) {
          const card = ref.deref();
          if (!card || !card.isConnected) cards.delete(ref);
        }
        cards.add(new WeakRef(view.root));
        const immediate = engine.peek(query);
        if (immediate) view.render(immediate, now() - started);
        append(view.root);
        if (immediate) return;
        const lookup = async () => {
          try {
            const result = await engine.lookup(query);
            // Each popup owns its own node, so an older result cannot overwrite a new selection.
            if (active) view.render(result, now() - started);
          }
          catch (error) {
            if (!active) return;
            logError(error);
            view.error(() => { started = now(); void lookup(); });
          }
        };
        void lookup();
      }
      catch (error) { logError(error); }
    }

    async function manualLookup(win) {
      const input = { value: "" };
      if (!Services.prompt.prompt(win, "QuickLex 英汉 / 俄汉速查", "输入一个英文或俄文单词：", input, null, {})) return;
      const query = QuickLexCore.normalizeSelection(input.value);
      if (!query) {
        Services.prompt.alert(win, "QuickLex", "请输入一个英文或俄文单词；支持连字符和词库收录的词形变化。");
        return;
      }
      try {
        const started = now();
        const result = await engine.lookup(query);
        if (!active || win.closed) return;
        const definitions = result.entries.map(entry => `${entry.word}${entry.phonetic ? " /" + entry.phonetic + "/" : ""}\n${entry.translation}`).join("\n\n");
        Services.prompt.alert(win, "QuickLex · " + query,
          (definitions || "本地词典暂未收录这个词。") + `\n\n${result.source} · 本地查询 ${now() - started} ms`
          + (result.language === "ru" ? "\n中文维基词典贡献者 · CC BY-SA 4.0\n来源：https://zh.wiktionary.org/wiki/" + encodeURIComponent(result.entries[0]?.word || query) : ""));
      }
      catch (error) {
        logError(error);
        if (active && !win.closed) Services.prompt.alert(win, "QuickLex", "本地词典读取失败，请重新启用插件后重试。");
      }
    }

    function addWindow(win) {
      if (!active || windows.has(win)) return;
      const doc = win.document;
      const tools = doc.getElementById("menu_ToolsPopup");
      if (!tools) return;
      const menu = doc.createXULElement("menu");
      menu.id = "quicklex-tools-menu";
      menu.setAttribute("label", "QuickLex 速查");
      const popup = doc.createXULElement("menupopup");
      const toggle = doc.createXULElement("menuitem");
      toggle.setAttribute("label", "选中单词后自动显示释义");
      toggle.setAttribute("type", "checkbox");
      toggle.setAttribute("checked", String(enabled()));
      toggle.addEventListener("command", () => {
        const value = !enabled();
        Services.prefs.setBoolPref("extensions.quicklex.enabled", value);
        for (const state of windows.values()) state.toggle.setAttribute("checked", String(value));
        if (!value) removeCards();
      });
      const lookup = doc.createXULElement("menuitem");
      lookup.setAttribute("label", "查一个单词…");
      lookup.addEventListener("command", () => { void manualLookup(win); });
      const about = doc.createXULElement("menuitem");
      about.setAttribute("label", "使用说明…");
      about.addEventListener("command", () => {
        Services.prompt.alert(win, `QuickLex ${version}`,
          "在 Zotero 内置阅读器中双击英文或俄文单词，自动识别语言并显示中文释义。Windows 与 macOS 使用同一 XPI，无需 API Key，查词无需联网。\n\n英文来自 ECDICT；俄汉释义来自中文维基词典贡献者，经 Kaikki/Wiktextract 提取，以 CC BY-SA 4.0 分发。词形索引合并维基词典与 OpenCorpora（原始许可 CC BY-SA 3.0，转换后采用 4.0），已扩充形容词、动词和名词变形。保留中文原文，部分为繁体。支持音标、多义项及词库收录的词形变化。\n\n只有点击“在线补查”或词条来源才打开浏览器。英文补查打开有道，俄文打开中文维基词典。\n若旧翻译插件也自动弹窗，可关闭旧插件的自动查词。\n\n弹窗耗时仅统计本插件处理，不包含 Zotero 原生弹窗及屏幕绘制。\n当前版本面向 Zotero 10.0；专业术语和语境释义受词库覆盖限制。");
      });
      popup.append(toggle, lookup, about);
      menu.append(popup);
      tools.append(menu);
      windows.set(win, { menu, toggle });
    }

    function removeWindow(win) {
      const state = windows.get(win);
      state?.menu.remove();
      windows.delete(win);
    }

    return {
      start() {
        active = true;
        Zotero.Reader.registerEventListener("renderTextSelectionPopup", handleSelection, id);
        for (const win of Zotero.getMainWindows()) addWindow(win);
        void engine.warm();
      },
      stop() {
        active = false;
        Zotero.Reader.unregisterEventListener("renderTextSelectionPopup", handleSelection);
        removeCards();
        for (const win of [...windows.keys()]) removeWindow(win);
        engine.dispose();
      },
      addWindow, removeWindow,
    };
  }
  return { create };
})();
