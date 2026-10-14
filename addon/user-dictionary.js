/* User-owned DSL dictionaries: local text only, sharded storage, no executable markup. */
var QuickLexUserDictionary = (() => {
  "use strict";
  const Core = typeof module !== "undefined" && module.exports ? require("./core.js") : QuickLexCore;
  const HAN = /[\u3400-\u9fff]/;
  const GENERATION = /^ru-\d+-[0-9a-f]{8}$/;
  const PREF = "extensions.quicklex.userDictionary";
  const MAX_BYTES = 128 * 1024 * 1024;

  function text(value) {
    return value.replace(/\{\{[\s\S]*?\}\}/g, "")
      .replace(/(?<!\\)\[ref\]([\s\S]*?)\[\/ref\]/g, (_, word) => "→ " + word)
      .replace(/(?<!\\)\[m\d+\]|(?<!\\)\[\/m\]/g, "\n")
      .replace(/(?<!\\)\[ex\]/g, "例：")
      .replace(/(?<!\\)\[\/?[^\]\n]+\]/g, "")
      .replace(/\\([\[\]{}~\\])/g, "$1")
      .split(/\r?\n/).map(line => line.trim()).filter(Boolean).join("\n");
  }
  function key(value) {
    return text(value).normalize("NFKC").toLowerCase().replace(/([а-яё])[\u0300\u0301]/g, "$1").trim();
  }

  async function parseDSL(input, fallbackName = "俄汉词典", yieldTask = async () => {}) {
    if (input.length > MAX_BYTES) throw Error("词典过大，请使用不超过 128 MiB 的 DSL 文件。");
    const articles = new Map(), links = new Map(), pages = new Map();
    let heads = [], body = [], name = fallbackName;
    function flush() {
      if (!heads.length || !body.length) return;
      const raw = body.join("\n"), article = text(raw);
      const refs = [...raw.matchAll(/(?<!\\)\[ref\]([\s\S]*?)\[\/ref\]/g)].map(m => key(m[1]));
      for (const head of heads) {
        const word = key(head);
        if (!word) continue;
        if (!pages.has(word)) pages.set(word, head);
        const values = articles.get(word) || [];
        if (article && !values.includes(article)) values.push(article);
        articles.set(word, values);
        links.set(word, [...new Set([...(links.get(word) || []), ...refs.filter(ref => ref !== word)])]);
      }
    }
    let n = 0;
    for (let line of input.split(/\r?\n/)) {
      if (++n % 2048 === 0) await yieldTask();
      line = line.replace(/^\ufeff/, "");
      if (!line.trim()) {
        if (body.length) { flush(); heads = []; body = []; }
        continue;
      }
      if (line.startsWith("#")) {
        const title = line.match(/^#NAME\s+"(.*)"\s*$/);
        if (title) name = title[1];
        continue;
      }
      if (/^\s/.test(line) || (body.length && HAN.test(line))) {
        if (heads.length) body.push(line.trim());
      }
      else {
        if (body.length) { flush(); heads = []; body = []; }
        heads.push(line.trim());
      }
    }
    flush();
    function translated(word, seen = new Set()) {
      if (seen.has(word) || seen.size >= 8) return "";
      const article = (articles.get(word) || []).join("\n\n");
      if (HAN.test(article)) return article;
      const next = new Set([...seen, word]);
      return (links.get(word) || []).map(ref => {
        const target = translated(ref, next);
        return target ? "参见：" + pages.get(ref) + "\n" + target : "";
      }).filter(Boolean).join("\n\n");
    }
    const shards = Array.from({ length: 256 }, () => ({ entries: {}, forms: {} }));
    let count = 0;
    for (const word of [...articles.keys()].sort()) {
      if (++n % 2048 === 0) await yieldTask();
      const query = word.replace(/[\u2010\u2011]/g, "-");
      if (query.length > 80 || !/^[а-яё]+(?:-[а-яё]+)*$/.test(query)) continue;
      const article = translated(word);
      if (!article) continue;
      shards[parseInt(Core.shardFor(query), 16)].entries[query] = [pages.get(word), "", article, ""];
      count++;
      if (query.includes("ё")) {
        const alias = query.replace(/ё/g, "е"), forms = shards[parseInt(Core.shardFor(alias), 16)].forms;
        forms[alias] = [...new Set([...(forms[alias] || []), query])];
      }
    }
    if (!count) throw Error("未找到带中文释义的俄语词条。请选择俄汉 DSL 文本词典，检查文件编码。");
    name = name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 100) || "俄汉词典";
    return { shards, metadata: { format: 1, name, entries: count, shards: 256 } };
  }

  function decode(bytes, Decoder) {
    if (bytes.length > MAX_BYTES) throw Error("词典过大，请使用不超过 128 MiB 的 DSL 文件。");
    const encoding = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le"
      : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
    try { return new Decoder(encoding, { fatal: true }).decode(bytes); }
    catch (_) { throw Error("词典编码无法识别，请使用 UTF-8 或带 BOM 的 UTF-16 DSL 文件。"); }
  }

  class Manager {
    constructor({ bundled, prefs, getStorage, yieldTask, onError = () => {} }) {
      Object.assign(this, { bundled, prefs, getStorage, yieldTask, onError });
      this.custom = null;
      this.cache = new Core.LRU(2048);
      this.closed = false;
      this.busy = false;
      this.generation = prefs.getStringPref(PREF, "");
      this.ready = this.generation ? this.restore().catch(onError) : Promise.resolve();
    }
    path(generation) {
      if (!GENERATION.test(generation)) throw Error("Invalid QuickLex dictionary identifier");
      const { paths, root } = this.getStorage();
      return paths.join(root, generation);
    }
    async open(generation) {
      const { io, paths } = this.getStorage(), folder = this.path(generation);
      const metadata = await io.readJSON(paths.join(folder, "metadata.json"));
      if (metadata.format !== 1 || metadata.shards !== 256 || !(metadata.entries > 0)
          || typeof metadata.name !== "string") throw Error("Invalid imported dictionary metadata");
      return new Core.Dictionary({ language: "ru", shardCount: 256,
        sourceInfo: { name: "导入 · " + metadata.name, attribution: metadata.name, license: "用户自备词典", urlPrefix: "" },
        loadJSON: file => {
          if (!/^shards\/[0-9a-f]{2}\.json$/.test(file)) throw Error("Invalid dictionary shard path");
          return io.readJSON(paths.join(folder, ...file.split("/")));
        } });
    }
    async restore() {
      const dict = await this.open(this.generation);
      if (this.closed) dict.dispose();
      else this.custom = dict;
    }
    peek(input) {
      const query = Core.normalizeSelection(input);
      return !this.generation ? this.bundled.peek(input)
        : query && Core.languageFor(query) === "ru" ? this.cache.get(query) : undefined;
    }
    async lookup(input) {
      if (this.closed) throw Error("Dictionary is closed");
      const query = Core.normalizeSelection(input);
      if (!query || Core.languageFor(query) !== "ru") return this.bundled.lookup(input);
      await this.ready;
      const custom = this.custom;
      if (!custom) return this.bundled.lookup(query);
      const cached = this.cache.get(query);
      if (cached) return cached;
      let result = await custom.lookup(query);
      if (!result.entries.length) {
        // Reuse only explicit bundled form relationships, then read the user's definitions.
        const shard = await this.bundled.shard(query);
        const records = await Promise.all((shard.forms[query] || []).map(base => custom.entry(base)));
        if (records.some(Boolean)) result = custom.result(query, records.filter(Boolean));
        else result = await this.bundled.lookup(query);
      }
      if (!this.closed && custom === this.custom) this.cache.set(query, result);
      return result;
    }
    async importFile(file) {
      if (this.busy || this.closed) throw Error("词典正在导入或插件已停用。");
      this.busy = true;
      let generation;
      try {
        await this.ready;
        const { io, paths, root, Decoder } = this.getStorage();
        if (!/\.dsl$/i.test(file)) throw Error("请选择解压后的 .dsl 文件；暂不支持 MDX、LSD、StarDict 或压缩包。");
        const stat = await io.stat(file);
        if (stat.size > MAX_BYTES) throw Error("词典过大，请使用不超过 128 MiB 的 DSL 文件。");
        const parsed = await parseDSL(decode(await io.read(file), Decoder), paths.filename(file).replace(/\.dsl$/i, ""), this.yieldTask);
        if (this.closed) throw Error("插件已停用，导入已取消。");
        generation = "ru-" + Date.now() + "-" + Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
        const folder = this.path(generation);
        await io.makeDirectory(root, { ignoreExisting: true, permissions: 0o700 });
        await io.makeDirectory(folder, { permissions: 0o700 });
        await io.makeDirectory(paths.join(folder, "shards"));
        for (let i = 0; i < 256; i++) {
          if (this.closed) throw Error("插件已停用，导入已取消。");
          const target = paths.join(folder, "shards", i.toString(16).padStart(2, "0") + ".json");
          await io.writeJSON(target, parsed.shards[i]);
        }
        await io.writeJSON(paths.join(folder, "metadata.json"), parsed.metadata);
        const dict = await this.open(generation);
        if (this.closed) { dict.dispose(); throw Error("插件已停用，导入已取消。"); }
        const old = this.generation;
        this.prefs.setStringPref(PREF, generation); // Activate only after every file is complete.
        this.custom?.dispose();
        this.custom = dict;
        this.generation = generation;
        this.cache.clear();
        generation = null;
        if (GENERATION.test(old)) await this.remove(old).catch(this.onError);
        return parsed.metadata;
      }
      finally {
        if (generation) await this.remove(generation).catch(this.onError);
        this.busy = false;
      }
    }
    async remove(generation) {
      // Only a validated, generated child of this plugin's own profile directory is removable.
      await this.getStorage().io.remove(this.path(generation), { recursive: true, ignoreAbsent: true });
    }
    async reset() {
      if (this.busy || this.closed) throw Error("请等待词典导入完成。");
      this.busy = true;
      try {
        await this.ready;
        const old = this.generation;
        this.prefs.setStringPref(PREF, "");
        this.generation = "";
        this.custom?.dispose();
        this.custom = null;
        this.cache.clear();
        if (GENERATION.test(old)) await this.remove(old).catch(this.onError);
      }
      finally { this.busy = false; }
    }
    dispose() { this.closed = true; this.custom?.dispose(); this.cache.clear(); }
  }
  return { parseDSL, text, decode, Manager, PREF };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QuickLexUserDictionary;
