/* DOM-only view. Dictionary strings are always inserted as text, never HTML. */
var QuickLexCard = (() => {
  "use strict";
  const NS = "http://www.w3.org/1999/xhtml";
  const CSS = `
    .quicklex-card { box-sizing:border-box; width:330px; max-width:calc(100vw - 48px);
      min-width:240px; padding:13px 14px 10px; text-align:left; white-space:normal;
      color:var(--fill-primary, #20252e); background:var(--material-background, #fff);
      font:13px/1.65 system-ui, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; border-radius:7px;
      user-select:text; cursor:auto; color-scheme:light dark; }
    .quicklex-card * { box-sizing:border-box; }
    .quicklex-card .ql-header { display:flex; align-items:baseline; justify-content:space-between;
      gap:12px; padding-bottom:7px; border-bottom:1px solid rgba(128,128,128,.2); }
    .quicklex-card .ql-word { font-size:20px; font-weight:650; line-height:1.3;
      overflow-wrap:anywhere; color:inherit; }
    .quicklex-card .ql-badge { color:#197358; font-size:11px; flex-shrink:0; }
    .quicklex-card .ql-body { max-height:310px; overflow-y:auto; overscroll-behavior:contain;
      scrollbar-width:thin; padding:5px 0; }
    .quicklex-card .ql-entry + .ql-entry { margin-top:10px; border-top:1px solid rgba(128,128,128,.2);
      padding-top:9px; }
    .quicklex-card .ql-base { font-weight:600; margin:0 0 2px; }
    .quicklex-card .ql-phonetic { font-size:12px; opacity:.65; margin-bottom:5px; }
    .quicklex-card .ql-translation { white-space:pre-wrap; overflow-wrap:anywhere; margin:3px 0 7px; }
    .quicklex-card details { font-size:12px; margin-top:6px; }
    .quicklex-card summary { cursor:pointer; opacity:.7; }
    .quicklex-card .ql-english { white-space:pre-wrap; overflow-wrap:anywhere; opacity:.85; padding:5px 0; }
    .quicklex-card .ql-footer { display:flex; align-items:center; justify-content:space-between;
      gap:8px; padding-top:6px; border-top:1px solid rgba(128,128,128,.2); font-size:10px; }
    .quicklex-card .ql-time { opacity:.55; font-variant-numeric:tabular-nums; }
    .quicklex-card .ql-link { appearance:none; font:inherit; color:#3475bd; background:none;
      border:0; cursor:pointer; padding:1px 0; border-radius:2px; }
    .quicklex-card .ql-link:hover { text-decoration:underline; }
    .quicklex-card .ql-link:focus-visible { outline:2px solid #3475bd; outline-offset:2px; }
    .quicklex-card .ql-status { margin:8px 0; opacity:.7; }
    .quicklex-card .ql-notice { font-size:11px; opacity:.65; margin-bottom:6px; }
    @media(prefers-color-scheme:dark) {
      .quicklex-card { color:var(--fill-primary, #e6e8ec); background:var(--material-background, #292b30); }
      .quicklex-card .ql-badge { color:#77c9a8; }
      .quicklex-card .ql-link { color:#87b8f0; }
    }
  `;

  function node(doc, tag, className, text) {
    const element = doc.createElementNS(NS, tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function create(doc, query, { onOnline = () => {}, onSource = () => {} } = {}) {
    const russian = QuickLexCore.languageFor(query) === "ru";
    const root = node(doc, "section", "quicklex-card");
    root.setAttribute("aria-label", russian ? "QuickLex 俄汉速查" : "QuickLex 英汉速查");
    root.setAttribute("data-quicklex", "true");
    const style = node(doc, "style");
    style.textContent = CSS;
    const header = node(doc, "div", "ql-header");
    header.append(node(doc, "strong", "ql-word", query), node(doc, "span", "ql-badge", "速查 · 离线"));
    const body = node(doc, "div", "ql-body");
    body.setAttribute("aria-live", "polite");
    body.setAttribute("tabindex", "0");
    body.append(node(doc, "div", "ql-status", "正在读取本地词典…"));
    const footer = node(doc, "div", "ql-footer");
    const timing = node(doc, "span", "ql-time", russian ? "维基词典 · 俄汉" : "ECDICT 本地词典");
    const online = node(doc, "button", "ql-link", "在线补查 ↗");
    online.type = "button";
    online.title = russian ? "在浏览器打开中文维基词典，仅发送当前单词" : "在浏览器打开有道词典，仅发送当前单词";
    online.addEventListener("click", event => { event.preventDefault(); onOnline(query); });
    footer.append(timing, online);
    root.append(style, header, body, footer);
    // Keep interacting with definitions from clearing the PDF selection.
    root.addEventListener("pointerdown", event => event.stopPropagation());
    root.addEventListener("mousedown", event => event.stopPropagation());
    root.addEventListener("mouseup", event => event.stopPropagation());
    root.addEventListener("click", event => event.stopPropagation());
    root.addEventListener("dblclick", event => event.stopPropagation());
    root.addEventListener("wheel", event => event.stopPropagation());

    function render(result, elapsed = 0) {
      body.replaceChildren();
      if (result.inferred) {
        body.append(node(doc, "div", "ql-notice", "以下为可能的原形，请结合上下文确认。"));
      }
      if (!result.entries.length) {
        body.append(node(doc, "div", "ql-status", "本地词典暂未收录这个词，可点击“在线补查”。"));
      }
      for (const entry of result.entries) {
        const section = node(doc, "div", "ql-entry");
        if (entry.isBaseForm || result.entries.length > 1) {
          section.append(node(doc, "div", "ql-base", (entry.isBaseForm ? "原形 · " : "词条 · ") + entry.word));
        }
        if (entry.phonetic) section.append(node(doc, "div", "ql-phonetic", "/" + entry.phonetic.replace(/^\/|\/$/g, "") + "/"));
        section.append(node(doc, "div", "ql-translation", entry.translation));
        if (entry.sourceURL) {
          const credit = node(doc, "button", "ql-link", "维基词典贡献者 · CC BY-SA 4.0 ↗");
          credit.type = "button";
          credit.title = "查看原词条及贡献者历史；本地释义经筛选、合并和分片";
          credit.addEventListener("click", event => { event.preventDefault(); onSource(entry.sourceURL); });
          section.append(credit);
        }
        if (entry.definition) {
          const details = node(doc, "details");
          details.append(node(doc, "summary", "", "展开英文释义"), node(doc, "div", "ql-english", entry.definition));
          section.append(details);
        }
        body.append(section);
      }
      timing.textContent = `${result.source} · 本地查询 ${Math.max(0, elapsed).toFixed(1)} ms`;
      timing.title = "从插件收到选词事件到释义填入的耗时，不含 Zotero 原生选词弹窗等待和屏幕绘制。";
    }

    function error(onRetry) {
      body.replaceChildren(node(doc, "div", "ql-status", "本地词典读取失败。"));
      const retry = node(doc, "button", "ql-link", "重新读取");
      retry.type = "button";
      retry.addEventListener("click", () => {
        body.replaceChildren(node(doc, "div", "ql-status", "正在读取本地词典…"));
        onRetry();
      });
      body.append(retry);
    }
    return { root, render, error };
  }

  return { create, CSS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QuickLexCard;
