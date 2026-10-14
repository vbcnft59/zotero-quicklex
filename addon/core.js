/* Pure lookup engine, shared by Zotero, the preview, and the benchmarks. */
var QuickLexCore = (() => {
  "use strict";

  function normalizeSelection(input) {
    if (typeof input !== "string" || input.length > 240) return null;
    const word = input.normalize("NFKC")
      .replace(/[\u00ad\u200b-\u200d\ufeff]/g, "")
      .replace(/([a-zа-яё])-\s*\r?\n\s*([a-zа-яё])/gi, "$1$2")
      .replace(/([а-яё])[\u0300\u0301]/gi, "$1")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u2010\u2011]/g, "-")
      .trim()
      .replace(/^[\s"'“”‘’«»([{<.,;:!?]+|[\s"'“”‘’«»)\]}>.,;:!?]+$/g, "")
      .toLowerCase();
    return word.length <= 80 && (/^[a-z]+(?:['-][a-z]+)*$/.test(word)
      || /^[а-яё]+(?:-[а-яё]+)*$/.test(word)) ? word : null;
  }

  function languageFor(word) { return /^[а-яё]/.test(word) ? "ru" : "en"; }

  function onlineURL(word) {
    return languageFor(word) === "ru"
      ? "https://zh.wiktionary.org/wiki/" + encodeURIComponent(word)
      : "https://dict.youdao.com/result?word=" + encodeURIComponent(word) + "&lang=en";
  }

  // Identical FNV-1a hash in scripts/build_dictionary.py; supported letters are in the BMP.
  function shardFor(word) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < word.length; i++) {
      hash = Math.imul(hash ^ word.charCodeAt(i), 0x01000193) >>> 0;
    }
    return (hash & 255).toString(16).padStart(2, "0");
  }

  class LRU {
    constructor(limit) {
      this.limit = Math.max(1, limit);
      this.values = new Map();
    }
    get(key) {
      if (!this.values.has(key)) return undefined;
      const value = this.values.get(key);
      this.values.delete(key);
      this.values.set(key, value);
      return value;
    }
    set(key, value) {
      this.values.delete(key);
      this.values.set(key, value);
      if (this.values.size > this.limit) this.values.delete(this.values.keys().next().value);
      return value;
    }
    clear() { this.values.clear(); }
    get size() { return this.values.size; }
  }

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function unpack(record, query) {
    return Object.freeze({
      word: record[0], phonetic: record[1], translation: record[2], definition: record[3],
      isBaseForm: normalizeSelection(record[0]) !== query,
      sourceURL: record[4] ? "https://zh.wiktionary.org/wiki/" + encodeURIComponent(record[4]) : "",
    });
  }

  function resultFor(query, records, inferred = false, language = "en") {
    return Object.freeze({
      query, source: language === "ru" ? "维基词典 · 俄汉" : "ECDICT", language,
      license: language === "ru" ? "CC BY-SA 4.0" : "MIT", inferred,
      entries: Object.freeze(records.map(record => unpack(record, query))),
    });
  }

  // Only a last resort for words absent from both the dictionary and its form index.
  function fallbackForms(word) {
    const forms = [];
    if (word.endsWith("'s")) forms.push(word.slice(0, -2));
    if (word.endsWith("ies")) forms.push(word.slice(0, -3) + "y");
    if (word.endsWith("s") && !word.endsWith("ss")) forms.push(word.slice(0, -1));
    if (word.endsWith("es")) forms.push(word.slice(0, -2));
    for (const suffix of ["ing", "ed"]) {
      if (!word.endsWith(suffix) || word.length <= suffix.length + 2) continue;
      const stem = word.slice(0, -suffix.length);
      forms.push(stem, stem + "e");
      if (/([b-df-hj-np-tv-z])\1$/.test(stem)) forms.push(stem.slice(0, -1));
      if (suffix === "ed" && stem.endsWith("i")) forms.push(stem.slice(0, -1) + "y");
    }
    return [...new Set(forms)].filter(term => term.length >= 2);
  }

  class Dictionary {
    constructor({ loadJSON, shardLimit = 24, resultLimit = 2048, language = "en" }) {
      this.loadJSON = loadJSON;
      this.language = language;
      this.shards = new LRU(shardLimit);
      this.results = new LRU(resultLimit);
      this.pendingShards = new Map();
      this.pendingWords = new Map();
      this.hot = null;
      this.warmPromise = null;
      this.disposed = false;
    }

    warm() {
      if (!this.warmPromise) {
        this.warmPromise = this.loadJSON("hot.json").then(data => {
          this.validate(data);
          if (!this.disposed) this.hot = data;
        }).catch(() => {
          // A failed preload must never prevent loading individual local shards.
          this.warmPromise = null;
        });
      }
      return this.warmPromise;
    }

    validate(data) {
      if (!data || typeof data.entries !== "object" || !data.entries
          || typeof data.forms !== "object" || !data.forms) {
        throw new Error("Invalid QuickLex dictionary data");
      }
    }

    peek(input) {
      const query = normalizeSelection(input);
      if (!query || languageFor(query) !== this.language || this.disposed) return undefined;
      const cached = this.results.get(query);
      if (cached) return cached;
      if (!this.hot) return undefined;
      const direct = has(this.hot.entries, query) ? this.hot.entries[query] : null;
      const bases = has(this.hot.forms, query) ? this.hot.forms[query] : [];
      if (!direct && !bases.length) return undefined;
      if (bases.some(base => !has(this.hot.entries, base))) return undefined;
      const records = direct ? [direct] : [];
      for (const base of bases) {
        if (base !== query) records.push(this.hot.entries[base]);
      }
      return this.results.set(query, resultFor(query, records, false, this.language));
    }

    async shard(word) {
      if (this.disposed) throw new Error("Dictionary is closed");
      const key = shardFor(word);
      const cached = this.shards.get(key);
      if (cached) return cached;
      if (this.pendingShards.has(key)) return this.pendingShards.get(key);
      const pending = (async () => {
        const data = await this.loadJSON(`shards/${key}.json`);
        this.validate(data);
        if (!this.disposed) this.shards.set(key, data);
        return data;
      })();
      this.pendingShards.set(key, pending);
      try { return await pending; }
      finally { this.pendingShards.delete(key); }
    }

    async entry(word) {
      if (this.hot && has(this.hot.entries, word)) return this.hot.entries[word];
      const data = await this.shard(word);
      return has(data.entries, word) ? data.entries[word] : null;
    }

    async lookup(input) {
      if (this.disposed) throw new Error("Dictionary is closed");
      const query = normalizeSelection(input);
      if (!query || languageFor(query) !== this.language) return resultFor("", [], false, this.language);
      const immediate = this.peek(query);
      if (immediate) return immediate;
      if (this.pendingWords.has(query)) return this.pendingWords.get(query);
      const pending = this.resolve(query);
      this.pendingWords.set(query, pending);
      try {
        const result = await pending;
        if (!this.disposed) this.results.set(query, result);
        return result;
      }
      finally { this.pendingWords.delete(query); }
    }

    async resolve(query) {
      const data = await this.shard(query);
      const direct = has(data.entries, query) ? data.entries[query] : null;
      const bases = has(data.forms, query) ? data.forms[query] : [];
      const records = direct ? [direct] : [];
      const baseRecords = await Promise.all(bases.filter(base => base !== query).map(base => this.entry(base)));
      records.push(...baseRecords.filter(Boolean));
      if (records.length) return resultFor(query, records, false, this.language);
      // Russian declensions/conjugations use only the source's explicit form index.
      const guesses = this.language === "en"
        ? await Promise.all(fallbackForms(query).map(base => this.entry(base))) : [];
      return resultFor(query, guesses.filter(Boolean), guesses.some(Boolean), this.language);
    }

    dispose() {
      this.disposed = true;
      this.hot = null;
      this.shards.clear();
      this.results.clear();
      this.pendingShards.clear();
      this.pendingWords.clear();
    }
  }

  class MultilingualDictionary {
    constructor({ loadJSON, ...options }) {
      this.disposed = false;
      this.dictionaries = {
        en: new Dictionary({ ...options, loadJSON }),
        ru: new Dictionary({ ...options, language: "ru", loadJSON: file => loadJSON("ru/" + file) }),
      };
    }
    warm() {
      // Do not preload the second language until used; keep English startup costs unchanged.
      if (this.disposed) return Promise.resolve();
      return this.dictionaries.en.warm();
    }
    peek(input) {
      const query = normalizeSelection(input);
      return query ? this.dictionaries[languageFor(query)].peek(query) : undefined;
    }
    lookup(input) {
      if (this.disposed) return Promise.reject(new Error("Dictionary is closed"));
      const query = normalizeSelection(input);
      const engine = this.dictionaries[query ? languageFor(query) : "en"];
      return engine.lookup(input);
    }
    dispose() {
      this.disposed = true;
      for (const engine of Object.values(this.dictionaries)) engine.dispose();
    }
  }

  return { normalizeSelection, languageFor, onlineURL, shardFor, LRU, Dictionary, MultilingualDictionary, fallbackForms };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QuickLexCore;
