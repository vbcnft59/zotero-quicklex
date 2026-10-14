const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Dictionary, normalizeSelection, shardFor, LRU } = require('../addon/core.js');
const dictionaryPath = path.join(__dirname, '../build/dictionary');
const loadJSON = async file => JSON.parse(await fs.readFile(path.join(dictionaryPath, file), 'utf8'));
const record = (word, text = '中文释义') => [word, '', text, 'English definition'];
function fixture(entries, forms = {}) {
  const buckets = {};
  for (let i = 0; i < 256; i++) buckets[i.toString(16).padStart(2, '0')] = { entries: {}, forms: {} };
  for (const [word, data] of Object.entries(entries)) buckets[shardFor(word)].entries[word] = data;
  for (const [word, bases] of Object.entries(forms)) buckets[shardFor(word)].forms[word] = bases;
  return file => file === 'hot.json' ? { entries: {}, forms: {} } : buckets[file.slice(7, 9)];
}

test('normalizes PDF artifacts, punctuation, ligatures, and case; rejects phrases', () => {
  for (const [input, expected] of [
    ['“Novel,”', 'novel'], ['hetero-\ngeneity', 'heterogeneity'], ['ﬁnd', 'find'],
    ['BINDING\u00ad', 'binding'], ['student’s', "student's"], ['well‑being', 'well-being'],
    ['(analyses).', 'analyses'], ["'novel'", 'novel'], ['word\u200b', 'word'],
    ['two words', null], ['123', null], ['中文', null], ['', null], [null, null],
    ['x'.repeat(81), null], ['<script>alert(1)</script>', null],
  ]) assert.equal(normalizeSelection(input), expected, String(input));
});

test('LRU reads refresh recency and eviction is bounded', () => {
  const cache = new LRU(2);
  cache.set('a', 1); cache.set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.size, 2);
});

test('real dictionary preserves Chinese multiple meanings and English definitions', async () => {
  const engine = new Dictionary({ loadJSON });
  for (const [word, meanings] of [['novel', ['小说', '新奇']], ['bank', ['银行', '岸']], ['set', ['集合', '设定']], ['heterogeneity', ['异质']]]) {
    const result = await engine.lookup(word);
    assert.equal(result.entries[0].word.toLowerCase(), word);
    for (const meaning of meanings) assert.ok(result.entries[0].translation.includes(meaning), `${word}: ${meaning}`);
    assert.ok(result.entries[0].definition);
    assert.equal(result.inferred, false);
  }
  assert.ok((await engine.lookup('set')).entries[0].translation.includes('\n'));
});

test('real dictionary retains both exact meanings and indexed base forms', async () => {
  const engine = new Dictionary({ loadJSON });
  for (const [word, bases] of [['children', ['child']], ['analyses', ['analysis', 'analyse']], ['running', ['run']], ['found', ['find']], ['leaves', ['leave', 'leaf']]]) {
    const result = await engine.lookup(word);
    for (const base of bases) assert.ok(result.entries.some(entry => entry.word.toLowerCase() === base), `${word} -> ${base}`);
  }
  const found = await engine.lookup('found');
  assert.equal(found.entries[0].word, 'found');
  assert.ok(found.entries[0].translation.includes('建立'));
});

test('hot common words render synchronously and use no additional file reads', async () => {
  const reads = [];
  const engine = new Dictionary({ loadJSON: async file => { reads.push(file); return loadJSON(file); } });
  await engine.warm();
  const result = engine.peek('novel');
  assert.ok(result?.entries.length);
  assert.equal((await engine.lookup('Novel')), result);
  assert.deepEqual(reads, ['hot.json']);
});

test('incomplete preloaded base forms fall back to shards without losing meanings', async () => {
  const store = fixture({ running: record('running'), run: record('run') }, { running: ['run'] });
  const engine = new Dictionary({ loadJSON: async file => file === 'hot.json'
    ? { entries: { running: record('running') }, forms: { running: ['run'] } } : store(file) });
  await engine.warm();
  assert.equal(engine.peek('running'), undefined);
  assert.deepEqual((await engine.lookup('running')).entries.map(e => e.word), ['running', 'run']);
});

test('same-word concurrent requests share disk IO and return the same result', async () => {
  let reads = 0;
  const store = fixture({ novel: record('novel') });
  const engine = new Dictionary({ loadJSON: async file => { reads++; await new Promise(resolve => setImmediate(resolve)); return store(file); } });
  const results = await Promise.all(Array.from({ length: 20 }, () => engine.lookup('novel')));
  assert.equal(reads, 1);
  assert.ok(results.every(result => result === results[0]));
});

test('different words in the same shard share an in-flight disk read', async () => {
  let other;
  for (let i = 0; !other; i++) {
    const key = 'term' + String.fromCharCode(97 + i % 26) + String.fromCharCode(97 + Math.floor(i / 26));
    if (shardFor(key) === shardFor('novel')) other = key;
  }
  const store = fixture({ novel: record('novel'), [other]: record(other) });
  let reads = 0;
  const engine = new Dictionary({ loadJSON: async file => { reads++; await new Promise(resolve => setImmediate(resolve)); return store(file); } });
  const results = await Promise.all([engine.lookup('novel'), engine.lookup(other)]);
  assert.ok(results.every(result => result.entries.length === 1));
  assert.equal(reads, 1);
});

test('failed shard reads can be retried; failed preload does not block lookup', async () => {
  const store = fixture({ novel: record('novel') });
  let fail = true;
  const engine = new Dictionary({ loadJSON: async file => {
    if (file === 'hot.json') throw Error('preload failure');
    if (fail) { fail = false; throw Error('disk failure'); }
    return store(file);
  } });
  await engine.warm();
  await assert.rejects(engine.lookup('novel'), /disk failure/);
  assert.equal((await engine.lookup('novel')).entries[0].word, 'novel');
  assert.equal(engine.pendingShards.size, 0);
  assert.equal(engine.pendingWords.size, 0);
});

test('misses and invalid input are explicit; guessed forms are marked', async () => {
  const store = fixture({ test: record('test') });
  const engine = new Dictionary({ loadJSON: async file => store(file) });
  assert.equal((await engine.lookup('tests')).inferred, true);
  assert.deepEqual((await engine.lookup('zzqvxx')).entries, []);
  assert.deepEqual((await engine.lookup('this is a sentence')).entries, []);
});

test('both cache types stay bounded', async () => {
  const entries = Object.fromEntries(['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map(word => [word, record(word)]));
  const store = fixture(entries);
  const engine = new Dictionary({ loadJSON: async file => store(file), shardLimit: 2, resultLimit: 3 });
  for (const word of Object.keys(entries)) await engine.lookup(word);
  assert.equal(engine.shards.size, 2);
  assert.equal(engine.results.size, 3);
});

test('disposing while IO is pending prevents cache resurrection', async () => {
  let resolve;
  const engine = new Dictionary({ loadJSON: () => new Promise(done => { resolve = done; }) });
  const pending = engine.lookup('novel');
  engine.dispose();
  resolve({ entries: { novel: record('novel') }, forms: {} });
  await pending;
  assert.equal(engine.shards.size, 0);
  assert.equal(engine.results.size, 0);
  await assert.rejects(engine.lookup('novel'), /closed/);
});

test('compiled shard hash and all inflection references are consistent', async () => {
  const keys = new Set();
  const references = [];
  for (let i = 0; i < 256; i++) {
    const key = i.toString(16).padStart(2, '0');
    const data = await loadJSON(`shards/${key}.json`);
    for (const word of Object.keys(data.entries)) { assert.equal(shardFor(word), key); keys.add(word); }
    for (const [word, bases] of Object.entries(data.forms)) {
      assert.equal(shardFor(word), key);
      references.push(...bases);
    }
  }
  const metadata = await loadJSON('metadata.json');
  assert.equal(keys.size, metadata.entries);
  for (const base of references) assert.ok(keys.has(base), `Missing base ${base}`);
});
