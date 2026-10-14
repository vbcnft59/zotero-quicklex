const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const tick = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor(doc, tag) { this.ownerDocument = doc; this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.parent = null; this.text = ''; }
  append(...items) { for (const child of items) { this.children.push(child); child.parent = this; } }
  replaceChildren(...items) { for (const item of this.children) item.parent = null; this.children = []; this.text = ''; this.append(...items); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key]; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  fire(type) { this.listeners[type]?.({ preventDefault() {}, stopPropagation() {} }); }
  set textContent(text) { this.text = text; this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  get isConnected() { return this === this.ownerDocument.body || Boolean(this.parent?.isConnected); }
  find(predicate) { return this.children.flatMap(child => [ ...(predicate(child) ? [child] : []), ...child.find(predicate) ]); }
}

async function harness(loader, { rootURI = 'jar:file:///extensions/quicklex@translatezotero.local.xpi!/', isMac = false } = {}) {
  const document = {
    createElementNS(ns, tag) { return new Element(this, tag); },
    createXULElement(tag) { return new Element(this, tag); },
    getElementById(id) { return this.body.find(node => node.id === id)[0]; },
  };
  document.body = new Element(document, 'body');
  const tools = document.createXULElement('menupopup'); tools.id = 'menu_ToolsPopup'; document.body.append(tools);
  const win = { document, closed: false };
  const listeners = new Map(), prefs = new Map(), launched = [], errors = [];
  const Zotero = {
    isMac,
    initializationPromise: Promise.resolve(),
    Reader: { registerEventListener(type, fn) { listeners.set(type, fn); }, unregisterEventListener(type, fn) { assert.equal(listeners.get(type), fn); listeners.delete(type); } },
    getMainWindows: () => [win],
    File: { getResourceAsync: async uri => {
      assert.ok(uri.startsWith(rootURI + 'data/'), 'dictionary reads must stay inside bundled data');
      return JSON.stringify(await loader(uri.slice((rootURI + 'data/').length)));
    } },
    launchURL: url => launched.push(url), logError: error => errors.push(error),
  };
  const Services = {
    prefs: { getBoolPref: (key, fallback) => prefs.get(key) ?? fallback, setBoolPref: (key, value) => prefs.set(key, value),
      getStringPref: (key, fallback) => prefs.get(key) ?? fallback, setStringPref: (key, value) => prefs.set(key, value) },
    prompt: { alert() {}, prompt() { return false; } },
    scriptloader: { loadSubScript(uri, scope) {
      const name = uri.slice(rootURI.length);
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../addon', name), 'utf8'), vm.isContext(scope) ? scope : vm.createContext(scope), { filename: name });
    } },
  };
  const addon = { applyBackgroundUpdates: 1 };
  const AddonManager = { AUTOUPDATE_DISABLE: 0, getAddonByID: async () => addon };
  const ChromeUtils = { importESModule: uri => {
    assert.equal(uri, 'resource://gre/modules/AddonManager.sys.mjs');
    return { AddonManager };
  } };
  const scope = vm.createContext({ Zotero, Services, ChromeUtils });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../addon/bootstrap.js'), 'utf8'), scope);
  await scope.startup({ id: 'quicklex@test', version: '0.2.0', rootURI });
  function select(text) {
    let card;
    listeners.get('renderTextSelectionPopup')?.({ doc: document, params: { annotation: { text } }, append(element) { card = element; document.body.append(element); } });
    return card;
  }
  return { scope, document, listeners, prefs, launched, errors, select, addon, Services, win };
}

test('bootstrap loads scripts; reader selection renders definitions safely; shutdown cleans up', async () => {
  const data = { entries: { novel: ['novel', '', '<img onerror=alert(1)> 小说；新奇的', 'English'] }, forms: {} };
  const app = await harness(async () => data);
  await tick();
  assert.equal(app.addon.applyBackgroundUpdates, 0, 'local builds must disable background update requests');
  const card = app.select('Novel');
  assert.ok(card.textContent.includes('小说；新奇的'));
  assert.equal(card.find(node => node.tagName === 'img').length, 0);
  assert.equal(app.select('two words'), undefined);
  assert.equal(app.launched.length, 0);
  card.find(node => node.className === 'ql-link')[0].fire('click');
  assert.equal(app.launched[0], 'https://dict.youdao.com/result?word=novel&lang=en');
  app.scope.shutdown();
  assert.equal(app.listeners.size, 0);
  assert.equal(card.isConnected, false);
  assert.equal(app.document.getElementById('quicklex-tools-menu'), undefined);
  assert.equal(app.errors.length, 0);
});

test('disabling automatic lookup removes existing cards and stops new automatic lookups', async () => {
  const app = await harness(async () => ({ entries: { novel: ['novel', '', '小说', ''] }, forms: {} }));
  await tick();
  const card = app.select('novel');
  const toggle = app.document.body.find(node => node.getAttribute('type') === 'checkbox')[0];
  toggle.fire('command');
  assert.equal(card.isConnected, false);
  assert.equal(app.select('novel'), undefined);
  toggle.fire('command');
  assert.ok(app.select('novel'));
  app.scope.shutdown();
});

test('rapid selection changes and disable during IO cannot overwrite current popup', async () => {
  let resolveSlow;
  const app = await harness(async file => {
    if (file === 'hot.json') return { entries: { bank: ['bank', '', '银行', ''] }, forms: {} };
    return new Promise(resolve => { resolveSlow = resolve; });
  });
  await tick();
  const old = app.select('novel');
  old.remove();
  const current = app.select('bank');
  resolveSlow({ entries: { novel: ['novel', '', '小说', ''] }, forms: {} });
  await tick();
  assert.ok(current.textContent.includes('银行'));
  assert.ok(!current.textContent.includes('小说'));
  const pending = app.select('heterogeneity');
  app.scope.shutdown();
  resolveSlow({ entries: { heterogeneity: ['heterogeneity', '', '异质性', ''] }, forms: {} });
  await tick();
  assert.ok(!pending.textContent.includes('异质性'));
  assert.equal(app.errors.length, 0);
});

test('read error displays a retry action and successful retry updates the card', async () => {
  let fail = true;
  const app = await harness(async file => {
    if (file === 'hot.json') return { entries: {}, forms: {} };
    if (fail) throw new Error('temporary read failure');
    return { entries: { novel: ['novel', '', '小说', ''] }, forms: {} };
  });
  await tick();
  const card = app.select('novel');
  await tick();
  assert.ok(card.textContent.includes('读取失败'));
  fail = false;
  card.find(node => node.textContent === '重新读取')[0].fire('click');
  await tick();
  assert.ok(card.textContent.includes('小说'));
  assert.equal(app.errors.length, 1);
  app.scope.shutdown();
});

test('Russian reader cards show Chinese senses and source links; online lookup is explicit', async () => {
  const reads = [];
  const app = await harness(async file => {
    reads.push(file);
    return file.startsWith('ru/')
      ? { entries: { наука: ['наука', 'nɐˈukə', '科學；課程', '', 'наука'] }, forms: {} }
      : { entries: {}, forms: {} };
  });
  await tick();
  assert.deepEqual(reads, ['hot.json']);
  const card = app.select('«НАУ́КА»');
  await tick();
  assert.ok(card.textContent.includes('科學；課程'));
  assert.ok(card.textContent.includes('БРуКС'));
  assert.ok(!card.textContent.includes('维基词典'));
  assert.equal(card.getAttribute('aria-label'), 'QuickLex 俄汉速查');
  assert.equal(card.find(node => node.tagName === 'summary').length, 0);
  assert.equal(app.launched.length, 0);
  card.find(node => node.textContent === '在线补查 ↗')[0].fire('click');
  assert.equal(app.launched[0], 'https://bkrs.info/slovo.php?ch=' + encodeURIComponent('наука'));
  card.find(node => node.textContent === 'БРуКС / BKRS.info ↗')[0].fire('click');
  assert.equal(app.launched[1], 'https://bkrs.info/slovo.php?ch=' + encodeURIComponent('наука'));
  app.scope.shutdown();
});

test('macOS-style installed paths with spaces/Unicode load data, register menus, and support manual Russian lookup', async () => {
  const data = { entries: { наука: ['наука', '', '科學', '', 'наука'] }, forms: {} };
  const app = await harness(async () => data, {
    isMac: true,
    rootURI: 'jar:file:///Users/reader/Library/Application%20Support/Zotero/Profiles/%E6%B5%8B%E8%AF%95/extensions/quicklex@translatezotero.local.xpi!/',
  });
  await tick();
  const alerts = [];
  app.Services.prompt.prompt = (win, title, text, input) => { input.value = 'НАУ́КА'; return true; };
  app.Services.prompt.alert = (win, title, text) => alerts.push(text);
  app.document.body.find(node => node.getAttribute('label') === '查一个单词…')[0].fire('command');
  await tick();
  assert.ok(alerts[0].includes('科學'));
  assert.ok(alerts[0].includes('BKRS 自由使用声明'));
  app.scope.shutdown();
  assert.equal(app.document.getElementById('quicklex-tools-menu'), undefined);
  assert.equal(app.errors.length, 0);
});
