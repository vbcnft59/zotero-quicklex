const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { MultilingualDictionary, Dictionary, normalizeSelection, languageFor, onlineURL, shardFor } = require('../addon/core.js');
const loadJSON = async file => JSON.parse(await fs.readFile(path.join(__dirname, '../build/dictionary', file), 'utf8'));

test('Russian selection handles accents, ё, й, guillemets, PDF wrapping, and rejects mixed scripts', () => {
  for (const [input, expected] of [
    ['«НАУ́КА,»', 'наука'], ['исследо-\nвание', 'исследование'], ['е\u0308лка', 'ёлка'],
    ['ЙОГУРТ', 'йогурт'], ['по‑русски', 'по-русски'], ['два слова', null], ['нaука', null],
    ['cлово', null], ['Україна', null], ['русский-English', null], ['наука123', null],
  ]) assert.equal(normalizeSelection(input), expected, input);
  assert.equal(languageFor('наука'), 'ru');
  assert.equal(languageFor('science'), 'en');
  assert.equal(onlineURL('мир'), 'https://zh.wiktionary.org/wiki/' + encodeURIComponent('мир'));
});

test('real Russian dictionary retains Chinese senses, pronunciation, attribution, and indexed forms', async () => {
  const engine = new MultilingualDictionary({ loadJSON });
  for (const [word, base, meaning] of [
    ['НАУ́КА', 'наука', '科學'], ['мира', 'мир', '和平'], ['исследования', 'исследование', '研究'],
    ['методы', 'метод', '方法'], ['идёт', 'идти', '走'],
  ]) {
    const result = await engine.lookup(word);
    const entry = result.entries.find(entry => entry.word === base);
    assert.ok(entry, `${word} -> ${base}`);
    assert.ok(entry.translation.includes(meaning), entry.translation);
    assert.equal(result.language, 'ru');
    assert.equal(result.license, 'CC BY-SA 4.0');
    assert.equal(result.inferred, false);
    assert.ok(entry.sourceURL.startsWith('https://zh.wiktionary.org/wiki/'));
  }
  const world = await engine.lookup('мир');
  assert.ok(world.entries[0].translation.includes('世界'));
  assert.ok(world.entries[0].phonetic);
  assert.ok((await engine.lookup('novel')).entries[0].translation.includes('小说'));
  assert.deepEqual((await engine.lookup('ъъъъъъ')).entries, []);
  engine.dispose();
  await assert.rejects(engine.lookup('наука'), /closed/);
});

test('English-only startup never reads Russian data, then Russian repeated queries are cached', async () => {
  const reads = [];
  const engine = new MultilingualDictionary({ loadJSON: async file => { reads.push(file); return loadJSON(file); } });
  await engine.warm();
  await engine.lookup('novel');
  assert.ok(!reads.some(file => file.startsWith('ru/')));
  const first = await engine.lookup('исследования');
  assert.ok(reads.filter(file => file.startsWith('ru/')).every(file => file.startsWith('ru/shards/')));
  const count = reads.length;
  assert.equal(await engine.lookup('ИССЛЕ́ДОВАНИЯ'), first);
  assert.equal(engine.peek('исследования'), first);
  assert.equal(reads.length, count);
  engine.dispose();
});

test('Russian compiled Unicode shards and every base reference are consistent', async () => {
  const metadata = await loadJSON('ru/metadata.json');
  const keys = new Set(), references = [];
  for (let i = 0; i < metadata.shards; i++) {
    const key = i.toString(16).padStart(3, '0');
    const data = await loadJSON(`ru/shards/${key}.json`);
    for (const [word, entry] of Object.entries(data.entries)) {
      assert.equal(shardFor(word, metadata.shards), key);
      assert.equal(normalizeSelection(word), word);
      assert.ok(/[\u3400-\u9fff]/.test(entry[2]));
      assert.ok(entry[4]);
      keys.add(word);
    }
    for (const [word, bases] of Object.entries(data.forms)) {
      assert.equal(shardFor(word, metadata.shards), key);
      assert.ok(bases.length);
      references.push(...bases);
    }
  }
  assert.equal(keys.size, metadata.entries);
  assert.ok(keys.size > 90000, 'both Russian language-name partitions must be included');
  assert.ok(metadata.formKeys > 1000000, 'explicit OpenCorpora paradigms must be included');
  for (const base of references) assert.ok(keys.has(base), base);
  const engine = new Dictionary({ loadJSON: file => loadJSON('ru/' + file), language: 'ru' });
  const withDots = await engine.lookup('учёный');
  const omittedDots = await engine.lookup('ученый');
  assert.ok(withDots.entries.length);
  assert.ok(omittedDots.entries.some(entry => entry.word.includes('ё')));
});

test('coverage regression: screenshot word and common adjective, noun, and verb forms resolve offline', async () => {
  const engine = new MultilingualDictionary({ loadJSON });
  for (const [query, base, meaning] of [
    ['статистические', 'статистический', '统计'],
    ['статистическими', 'статистический', '统计'],
    ['экономического', 'экономический', '经济'],
    ['церковной', 'церковный', '教会'],
    ['официальные', 'официальный', '官方'],
    ['читает', 'читать', '讀'], ['читают', 'читать', '讀'],
    ['содержали', 'содержать', '含有'], ['которые', 'который', '那個'],
    ['сведения', 'сведение', '信息'], ['словами', 'слово', '詞'],
  ]) {
    const result = await engine.lookup(query);
    const entry = result.entries.find(item => item.word === base);
    assert.ok(entry, `${query} -> ${base}`);
    assert.ok(entry.translation.includes(meaning), `${query}: ${entry.translation}`);
    assert.equal(result.inferred, false);
    assert.ok(entry.sourceURL);
  }
  engine.dispose();
});

test('Russian homographs keep multiple indexed headwords', async () => {
  const engine = new MultilingualDictionary({ loadJSON });
  const result = await engine.lookup('стали');
  for (const word of ['сталь', 'стать']) assert.ok(result.entries.some(entry => entry.word === word), word);
  engine.dispose();
});
