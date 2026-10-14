const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Dictionary } = require('../addon/core.js');
const { parseDSL, decode, Manager, PREF } = require('../addon/user-dictionary.js');

const fixture = '#NAME "我的俄汉词典"\nстатистический\n [m1]自备统计释义[/m][m2][ex]статистические данные - 统计材料[/ex][/m]\n\nучёный\n [m1]自备科学家释义[/m]\n\n';
function store() {
  const files = new Map(), values = new Map();
  const io = {
    async stat(file) { return { size: files.get(file).length }; },
    async read(file) { return files.get(file); },
    async readJSON(file) { if (!files.has(file)) throw Error('missing file'); return JSON.parse(files.get(file)); },
    async writeJSON(file, value) { files.set(file, JSON.stringify(value)); },
    async makeDirectory() {},
    async remove(folder) { for (const file of files.keys()) if (file.startsWith(folder + '/')) files.delete(file); },
  };
  const prefs = { getStringPref: (k, d) => values.get(k) ?? d, setStringPref: (k, v) => values.set(k, v) };
  const storage = { io, paths: { ...path.posix, filename: path.posix.basename }, root: '/profile/quicklex', Decoder: TextDecoder };
  return { files, io, prefs, values, getStorage: () => storage };
}
const bundled = () => new Dictionary({ language: 'ru', loadJSON: async file => JSON.parse(await fs.readFile(
  path.join(__dirname, '../build/dictionary/ru', file), 'utf8')) });

test('DSL import retains senses, pinyin, examples, references, aliases, and excludes mixed-script words', async () => {
  const data = await parseDSL(fixture + 'наука\n [m1][ref]учёный[/ref][/m]\n\nцикл\n [m1][ref]цикла[/ref][/m]\n\nцикла\n [m1][ref]цикл[/ref][/m]\n\nнaука\n [m1]不保留[/m]\n\n');
  assert.equal(data.metadata.entries, 3);
  const entries = Object.assign({}, ...data.shards.map(shard => shard.entries));
  const forms = Object.assign({}, ...data.shards.map(shard => shard.forms));
  assert.ok(entries.статистический[2].includes('例：статистические данные - 统计材料'));
  assert.ok(entries.наука[2].includes('参见：учёный\n自备科学家释义'));
  assert.deepEqual(forms.ученый, ['учёный']);
  await assert.rejects(parseDSL('word\n [m1]只有英语[/m]\n'), /未找到/);
});

test('UTF-8 and BOM UTF-16 decode; invalid encoding is rejected instead of corrupting definitions', () => {
  assert.equal(decode(Buffer.from(fixture, 'utf8'), TextDecoder), fixture);
  assert.equal(decode(Buffer.concat([Buffer.from([255, 254]), Buffer.from(fixture, 'utf16le')]), TextDecoder), fixture);
  assert.throws(() => decode(new Uint8Array([0xff, 0xff, 0xff]), TextDecoder), /编码/);
});

test('imported definitions take priority, explicit built-in inflections work, missing words fall back, and restart restores', async () => {
  const state = store(), base = bundled();
  state.files.set('/imports/test.dsl', Buffer.from(fixture));
  const manager = new Manager({ bundled: base, ...state });
  assert.equal((await manager.importFile('/imports/test.dsl')).entries, 2);
  assert.ok(state.values.get(PREF).startsWith('ru-'));
  for (const word of ['статистический', 'статистические', 'статистическими', 'ученый']) {
    const result = await manager.lookup(word);
    assert.ok(result.source.includes('我的俄汉词典'));
    assert.ok(result.entries[0].translation.includes('自备'));
    assert.equal(result.entries[0].sourceURL, ''); // Never misattribute imported content to BKRS.
    assert.equal(manager.peek(word), result);
  }
  assert.equal((await manager.lookup('наука')).source, 'БРуКС · 俄汉');
  manager.dispose();
  const restored = new Manager({ bundled: base, ...state });
  assert.ok((await restored.lookup('статистические')).entries[0].translation.includes('自备'));
  await restored.reset();
  assert.equal(state.values.get(PREF), '');
  assert.equal((await restored.lookup('статистические')).source, 'БРуКС · 俄汉');
  assert.ok(![...state.files.keys()].some(file => file.startsWith('/profile/quicklex/ru-')));
  restored.dispose(); base.dispose();
});

test('failed or interrupted imports preserve the active dictionary and remove partial generated data', async () => {
  const state = store(), base = bundled();
  state.files.set('/imports/test.dsl', Buffer.from(fixture));
  const manager = new Manager({ bundled: base, ...state });
  await manager.importFile('/imports/test.dsl');
  const first = state.values.get(PREF);
  const write = state.io.writeJSON;
  let writes = 0;
  state.io.writeJSON = async (...args) => { if (++writes === 7) throw Error('disk full'); return write(...args); };
  await assert.rejects(manager.importFile('/imports/test.dsl'), /disk full/);
  assert.equal(state.values.get(PREF), first);
  assert.ok((await manager.lookup('статистические')).source.includes('我的俄汉词典'));
  assert.ok([...state.files.keys()].filter(file => file.startsWith('/profile/quicklex/')).every(file => file.startsWith('/profile/quicklex/' + first + '/')));
  state.io.writeJSON = async (...args) => { manager.dispose(); return write(...args); };
  await assert.rejects(manager.importFile('/imports/test.dsl'), /停用/);
  assert.equal(state.values.get(PREF), first);
  base.dispose();
});

test('inflection lookup also uses imported headwords printed with е instead of ё', async () => {
  const state = store(), base = bundled();
  state.files.set('/imports/test.dsl', Buffer.from('#NAME "省略两点词典"\nученый\n [m1]自备学者义项[/m]\n\n'));
  const manager = new Manager({ bundled: base, ...state });
  await manager.importFile('/imports/test.dsl');
  for (const word of ['ученого', 'учёного', 'учёными']) {
    const result = await manager.lookup(word);
    assert.ok(result.source.includes('省略两点词典'));
    assert.ok(result.entries.some(entry => entry.translation.includes('自备学者义项')));
  }
  manager.dispose(); base.dispose();
});

test('invalid persisted generation cannot escape the plugin directory or trigger recursive deletion', async () => {
  const state = store(), errors = [], base = bundled();
  state.values.set(PREF, '../../library');
  state.io.remove = async () => { throw Error('must not delete'); };
  const manager = new Manager({ bundled: base, ...state, onError: error => errors.push(error) });
  assert.equal((await manager.lookup('наука')).source, 'БРуКС · 俄汉');
  assert.equal(errors.length, 1);
  await manager.reset();
  assert.equal(state.values.get(PREF), '');
  manager.dispose(); base.dispose();
});

test('JavaScript importer and Python compiler retain identical БРуКС headwords and sampled articles', async () => {
  const source = await fs.readFile(path.join(__dirname, '../.cache/dabruks_261014.dsl'), 'utf8');
  const imported = await parseDSL(source);
  const metadata = JSON.parse(await fs.readFile(path.join(__dirname, '../build/dictionary/ru/metadata.json'), 'utf8'));
  assert.equal(imported.metadata.entries, metadata.entries);
  const { shardFor } = require('../addon/core.js');
  for (const word of ['наука', 'учёный', 'статистический', 'церковный', 'экономический', 'читать']) {
    const built = JSON.parse(await fs.readFile(path.join(__dirname, '../build/dictionary/ru/shards', shardFor(word, 1024) + '.json'), 'utf8'));
    assert.equal(imported.shards[parseInt(shardFor(word), 16)].entries[word][2], built.entries[word][2]);
  }
});
