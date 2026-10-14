# QuickLex

[简体中文](README.md) | **English**

> **This is the `russian` branch (English–Chinese + Russian–Chinese + DSL import).** For the regular English–Chinese edition, use [`main`](https://github.com/vbcnft59/zotero-quicklex/tree/main) and [v0.3.1](https://github.com/vbcnft59/zotero-quicklex/releases/tag/v0.3.1). The editions share an add-on ID; installing one switches editions.

An offline **English–Chinese and Russian–Chinese** dictionary plugin for **Zotero 10.0**. **Windows and macOS use the same XPI.** Double-click an English or Russian word to see Chinese definitions in Zotero’s native selection popup. Language detection is automatic; no network connection or API key is required.

**Version 0.3.0 is a public preview.** Russian definitions now come from **БРуКС / BKRS.info**, replacing Wiktionary. It includes **122,937 Russian single-word articles**, Chinese senses, pinyin, and examples, plus inflection lookup. You can also **import a local Russian–Chinese DSL dictionary**. English lookup still uses ECDICT.

## Installation: Windows / macOS

1. Download **`quicklex-0.3.0.xpi`** from **Assets** on the [v0.3.0 release](https://github.com/vbcnft59/zotero-quicklex/releases/tag/v0.3.0). Do not extract it. Intel Macs, Apple Silicon Macs, and Windows use the same file.
2. In **Zotero desktop → Tools → Plugins** (or Add-ons), click the gear menu and choose **Install from file**. On macOS, Tools is in the menu bar at the top of the screen.
3. Install the new XPI over an existing QuickLex installation. Restart Zotero if the updated features do not appear.
4. Open a PDF with selectable text and double-click `novel`, `наука`, or `статистические`. Selecting a single word by dragging also works.
5. **Tools → QuickLex 速查 → 查一个单词…** (Look up a word…) accepts English and Russian. The same menu toggles automatic lookup.

Requires **Zotero 10.0.x**. GitHub **Source code (zip/tar.gz)** downloads are development source; choose **`.xpi`** to install. The release includes a `.sha256` checksum and a snapshot of the Russian source dictionary.

This preview uses manual updates and disables its own background updates. The reserved `quicklex.invalid` update address is a placeholder; checking for updates manually will fail. The installation fix from version 0.1.1 is retained. If another translation plugin opens a popup, you can disable its automatic lookup. Disable or remove QuickLex through Zotero’s plugin manager.

![QuickLex word lookup in the Zotero reader](展示图.png)

The screenshot shows English lookup. Russian uses the same card position and identifies the dictionary in use.

## Import another Russian–Chinese dictionary

The bundled dictionary works offline immediately; importing is optional.

1. Prepare an **uncompressed `.dsl` text dictionary**, encoded as **UTF-8** or **UTF-16 with BOM**, up to **128 MiB**. Direct MDX, LSD, StarDict, `.dsl.dz`, and ZIP import are not supported in this version.
2. Choose **Tools → QuickLex 速查 → 导入俄汉词典（DSL）…** and select the file. After conversion, QuickLex shows its name and imported headword count. Python is not needed.
3. **Imported definitions take priority.** Missing words fall back to the bundled БРуКС dictionary. The card displays the actual source; English lookup is unaffected.
4. Choose **恢复内置俄汉词典** (Restore bundled Russian dictionary) to undo the import immediately. Importing another file replaces the previous imported dictionary.

The importer retains Chinese senses, pinyin, examples, multiple headwords, and resolvable reference articles for Cyrillic single/hyphenated words. DSL formatting becomes plain text; images, audio, and external resources are not loaded. **Inflections reuse explicit relationships already in the bundled index. Newly imported words absent from that index must be queried by their headword.** Encrypted dictionaries, sentence translation, and general multiword phrase lookup are not supported.

Converted shards are saved in the `quicklex` subdirectory of the current Zotero profile and restored after restart. A failed import preserves the active dictionary. Original files are unchanged; imported articles are not uploaded, synced by the plugin, or included in public releases. Restoring the bundled dictionary removes the plugin’s imported shards.

## Features

| Feature | English → Chinese | Russian → Chinese |
| --- | --- | --- |
| Bundled single-word headwords | 399,213 | 122,937 |
| Source | [ECDICT](https://github.com/skywind3000/ECDICT) | [БРуКС / BKRS.info](https://bkrs.info/p47), 2026-10-14 snapshot |
| Form-index keys | 56,954 | 1,505,408, including explicit OpenCorpora inflections and omitted-ё spellings |
| Additional information | IPA and expandable English definitions | Chinese senses, pinyin, usage notes, and examples; this source does not provide IPA |
| Loading | Asynchronous preload of 8,000 common words; other shards on demand | Small shards on demand; no bulk Russian preload |

- **Local lookup:** 256 English shards, 1,024 bundled Russian shards, and 256 imported dictionary shards, with bounded caches and shared concurrent reads within an engine. English queries do not read Russian definition shards.
- **Multiple meanings and examples:** Preserves source content; long entries scroll. Russian `мир` includes peace and world; `учёный` includes scholar/scientist senses and usage examples.
- **Inflections:** For example, `исследования` → `исследование`, `статистические` → `статистический`, and `читает` → `читать`. Russian uses explicit indexed relationships, without suffix guesses. English suffix guesses remain marked as possible base forms.
- **PDF normalization:** Handles case, some punctuation, soft hyphens, ligatures, and line breaks. Russian supports stress marks such as `НАУ́КА` and omitted dots in recorded `ё` words. Mixed Latin/Cyrillic words are rejected.
- **Optional online lookup:** Only clicking a button opens the browser. English opens Youdao; Russian opens BKRS. Automatic lookup and local import do not send words, PDFs, or surrounding text.

Russian articles come directly from a Russian–Chinese dictionary, without English-pivot or AI translation. Source errors and omissions may remain. QuickLex does not select senses from context or provide OCR. Morphology is compiled at build time; no Python or external analyzer is needed at runtime.

## Performance and validation

Version 0.3.0 was measured using the bundled dictionaries on Windows, Node.js 24, and a Ryzen 9 8945HS, with 20 English and 13 Russian words:

| Scenario | Median | P95 |
| --- | ---: | ---: |
| English, empty plugin cache | 1.754 ms | 4.422 ms |
| English, first mixed queries after preload | 0.089 ms | 4.348 ms |
| Russian, empty plugin cache | 3.337 ms | 6.041 ms |
| English, cached results, 1,000 queries | 0.002 ms | 0.004 ms |
| Russian, cached results, 1,000 queries | 0.003 ms | 0.006 ms |

See the [0.3.0 benchmark](docs/benchmark-0.3.0.json). **These figures measure Node.js file access and lookup only; OS disk caches may be warm. They exclude XPI decompression, Zotero’s popup delay, DOM rendering, and painting, and are not a comparison with another plugin.** They do not describe user-provided dictionaries. The card timer also excludes time before the plugin’s selection callback.

Tests cover dictionary extraction, every compiled shard and form reference, attribution, import priority, failed imports, restart persistence, and caching. Native checks use isolated profiles and empty libraries. [GitHub Actions](https://github.com/vbcnft59/zotero-quicklex/actions) builds/tests on Windows, macOS Apple Silicon, macOS Intel, and Linux. Both macOS jobs also load the XPI in official Zotero 10.0.6 and check menus, real-DOM lookup, and dictionary import. See the [0.3.0 validation record](docs/validation-0.3.0.md), in Chinese. **Programmatic selection callbacks do not replace full testing of physical PDF double-clicks, different reader windows, or other plugins.**

## Development

Requires Python 3.10+ and Node.js 18+, without npm dependencies. Use `python` on Windows, or typically `python3` on macOS/Linux:

```sh
python3 scripts/download_sources.py
python3 scripts/build_dictionary.py
npm test
python3 -m unittest discover -s tests -p "test_*.py"
node scripts/benchmark.cjs
python3 scripts/package.py
```

Only the first step needs network access. Sources are pinned by SHA-256. Output is `dist/quicklex-0.3.0.xpi` and its checksum. Generated shards are not committed; release XPIs include both dictionaries. The unchanged БРуКС gzip is retained in this release. OpenCorpora data and a build-only reader are downloaded into `.cache` without global installation. See [Russian source metadata](docs/russian-source.json) and [morphology metadata](docs/russian-morphology-source.json).

Native check, for example on macOS:

```sh
python3 scripts/native_smoke.py --executable /Applications/Zotero.app/Contents/MacOS/zotero
```

For the browser preview, run `python3 -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/demo/`. The preview shares bundled dictionaries and rendering code; DSL import is available in Zotero’s Tools menu.

## License

Plugin code and ECDICT use MIT. **БРуКС definitions are redistributed under BKRS’s own free-use and redistribution permission**, with attribution and entry links; that statement is not an MIT or Creative Commons license. Original OpenCorpora morphology uses CC BY-SA 3.0; its adapted form index uses CC BY-SA 4.0. Both full licenses are included in the XPI. Imported dictionaries retain their own terms. See [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md), and [BKRS’s original permission](docs/licenses/BKRS-PERMISSION.txt).
