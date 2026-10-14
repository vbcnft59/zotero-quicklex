const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { MultilingualDictionary } = require('../addon/core.js');
const root = path.join(__dirname, '..');
let reads = 0;
const loadJSON = async file => { reads++; return JSON.parse(await fs.readFile(path.join(root, 'build/dictionary', file), 'utf8')); };
function summarize(samples) {
  const ordered = [...samples].sort((a, b) => a - b);
  return { n: ordered.length, medianMs: +ordered[Math.floor(ordered.length / 2)].toFixed(3), p95Ms: +ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * .95))].toFixed(3), maxMs: +ordered.at(-1).toFixed(3) };
}
async function measure(engine, words) {
  const samples = [];
  for (const word of words) {
    const start = performance.now();
    const result = await engine.lookup(word);
    if (!result.entries.length) throw Error('Missing benchmark word: ' + word);
    samples.push(performance.now() - start);
  }
  return summarize(samples);
}
(async () => {
  const words = ['novel', 'bank', 'set', 'analysis', 'heterogeneity', 'phosphorylation', 'epistemology', 'stoichiometry', 'running', 'children', 'analyses', 'leaves', 'found', 'binding', 'regression', 'endogeneity', 'multicollinearity', 'anisotropy', 'immunohistochemistry', 'polymerase'];
  const coldSamples = [];
  for (const word of words) {
    const engine = new MultilingualDictionary({ loadJSON });
    const start = performance.now();
    const result = await engine.lookup(word);
    if (!result.entries.length) throw Error('Missing benchmark word: ' + word);
    coldSamples.push(performance.now() - start);
    engine.dispose();
  }
  const engine = new MultilingualDictionary({ loadJSON });
  const warmStart = performance.now();
  await engine.warm();
  const preloadMs = +(performance.now() - warmStart).toFixed(3);
  const firstMixed = await measure(engine, words);
  const cached = await measure(engine, Array.from({ length: 1000 }, (_, i) => words[i % words.length]));
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'build/dictionary/metadata.json'), 'utf8'));
  const ruWords = ['наука', 'мир', 'исследование', 'исследования', 'метод', 'методы', 'учёный', 'ученый', 'идёт', 'данные',
    'статистические', 'читает', 'экономического'];
  const russianCold = [];
  for (const word of ruWords) {
    const ru = new MultilingualDictionary({ loadJSON });
    const start = performance.now();
    const result = await ru.lookup(word);
    if (!result.entries.length) throw Error('Missing Russian benchmark word: ' + word);
    russianCold.push(performance.now() - start);
    ru.dispose();
  }
  const ru = new MultilingualDictionary({ loadJSON });
  const russian = { words: ruWords, emptyPluginCache: summarize(russianCold),
    firstLookupWithSharedShardCache: await measure(ru, ruWords),
    cached: await measure(ru, Array.from({ length: 1000 }, (_, i) => ruWords[i % ruWords.length])) };
  ru.dispose();
  engine.dispose();
  const report = {
    measuredAt: new Date().toISOString(), environment: { node: process.version, platform: os.platform(), cpu: os.cpus()[0].model },
    entries: metadata.entries, preloadMs, emptyPluginCache: summarize(coldSamples), firstLookupAfterPreload: firstMixed, cached, russian, fileReads: reads,
    limits: 'Node.js filesystem + JSON parsing only, OS disk cache may be warm; excludes XPI decompression, Zotero native popup delay, DOM rendering, and display. No comparison with the user’s existing plugin has been measured.',
  };
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/benchmark.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
