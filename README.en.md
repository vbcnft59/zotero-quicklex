# QuickLex

[简体中文](README.md) | **English**

An offline **English–Chinese and Russian–Chinese** dictionary plugin for **Zotero 10.0**. **Windows and macOS use the same XPI.** Double-click an English or Russian word to see Chinese definitions in Zotero's native selection popup. Language detection is automatic. Both dictionaries are bundled, with no API key or network connection required for automatic lookup.

**Version 0.2.0 is a public preview.** It preserves English lookup, adds Russian → Chinese, and provides macOS installation instructions and cross-platform build/client checks. Report issues with your Zotero version, operating system, selected word, and reproduction steps.

## Installation: Windows / macOS

1. Download **`quicklex-0.2.0.xpi`** from **Assets** on the [v0.2.0 release](https://github.com/vbcnft59/zotero-quicklex/releases/tag/v0.2.0). Do not extract it. Intel Macs, Apple Silicon Macs, and Windows use the same file.
2. In **Zotero desktop**, open **Tools → Plugins** (or Add-ons), click the gear menu, and choose **Install from file**. On macOS, Tools is in the menu bar at the top of the screen.
3. Install the newer XPI over an existing QuickLex installation. Restart Zotero if updated features do not appear.
4. Open a PDF with selectable text and double-click `novel`, `наука`, or `исследования`. Selecting one word by dragging also works; no language switch is needed.
5. **Tools → QuickLex 速查 → 查一个单词…** (Look up a word…) accepts English and Russian. The same menu toggles automatic definitions.

Requires **Zotero 10.0.x**. Check its About window; other major versions are outside this compatibility range. GitHub **Source code (zip/tar.gz)** downloads are development source; choose **`.xpi`** to install. A `.sha256` file accompanies the package.

This preview is updated manually by installing a new XPI and disables its own background updates. The reserved `quicklex.invalid` update address is a placeholder, so manually checking for updates will fail. The 0.1.1 fix for the missing HTTPS update address in 0.1.0 is retained. If another translation plugin opens a popup, you can disable its automatic lookup. QuickLex can be disabled or removed through Zotero's plugin manager.

![QuickLex word lookup in the Zotero reader](展示图.png)

The screenshot shows English lookup. Russian uses the same card position, with Russian–Chinese source information and an attribution link.

## Features

| Feature | English → Chinese | Russian → Chinese |
| --- | --- | --- |
| Headwords with Chinese definitions | 399,213 | 17,383 |
| Source | [ECDICT](https://github.com/skywind3000/ECDICT) | [Chinese Wiktionary, extracted by Kaikki/Wiktextract](https://kaikki.org/zhwiktionary/%E4%BF%84%E8%AA%9E/index.html) |
| Form-index keys | 56,954 | 71,489, including recorded inflections and omitted-ё spellings |
| Loading | Asynchronous preload of 8,000 common words; other shards on demand | Small shards on demand; no bulk Russian preload on first lookup |
| Additional information | Expandable source English definitions | Original Chinese senses, parts of speech, usage labels, available IPA; some Chinese text is traditional |

- **Local lookup and caching:** 256 shards per language, with up to 2,048 cached results and 24 cached shards per language. Concurrent reads are shared. English-only use never reads Russian data.
- **Multiple meanings:** Preserves available source meanings and scrolls long entries. Russian `мир` includes peace and world; `учёный` includes adjective and noun senses.
- **Inflections:** English retains exact meanings alongside base forms, such as `found` / `find` and `leaves` / `leaf` / `leave`. Suffix guesses are explicitly marked as possible base forms. Russian uses only source-recorded relationships, such as `исследования` → `исследование`, `методы` → `метод`, and `идёт` → `идти`.
- **PDF normalization:** Handles case, some punctuation, soft hyphens, ligatures, and line breaks. Russian accepts stress marks such as `НАУ́КА`, preserves `ё` and `й`, and indexes omitted dots in recorded `ё` words. Mixed Latin/Cyrillic selections are rejected to avoid misleading matches.
- **Optional online lookup:** Only an explicit click on the online or source button opens a browser. English opens Youdao; Russian opens Chinese Wiktionary. Automatic lookup does not send words, PDF files, or surrounding text.

Russian glosses come directly from Chinese entries, without English-pivot or AI translation. Coverage is limited: some common words, technical terms, and inflections are absent. QuickLex does not choose senses from context, translate sentences/general multiword phrases, or provide OCR for scanned PDFs.

## Performance and validation

Version 0.2.0 was measured on Windows with Node.js 24 and a Ryzen 9 8945HS, using 20 English words and 10 Russian words:

| Scenario | Median | P95 |
| --- | ---: | ---: |
| English, empty plugin cache | 3.003 ms | 5.492 ms |
| English, first mixed queries after preload | 0.105 ms | 2.449 ms |
| Russian, empty plugin cache | 2.385 ms | 3.320 ms |
| English, cached results, 1,000 queries | 0.002 ms | 0.005 ms |
| Russian, cached results, 1,000 queries | 0.003 ms | 0.005 ms |

See the [0.2.0 benchmark](docs/benchmark-0.2.0.json). **These figures measure Node.js file access and lookup only; OS disk caches may be warm. They exclude XPI decompression, Zotero's popup delay, DOM rendering, and painting, and are not a comparison with another plugin.** The card timer starts at the plugin's selection callback, not at the user's double-click.

All 25 JavaScript tests and one Python extraction test pass. The new XPI was loaded in Windows Zotero 10.0.6 with an isolated profile and empty library, verifying activation, menus, and real-DOM rendering for English, Russian, an inflected word, and an omitted-ё spelling.

[GitHub Actions](https://github.com/vbcnft59/zotero-quicklex/actions) builds and tests on Windows, macOS Apple Silicon, macOS Intel, and Linux. Both macOS jobs also load the XPI in official Zotero 10.0.6 and check menus and the registered selection callback. Run status and native-client reports are available in the workflow and its artifacts. **Programmatically triggering this callback does not replace full testing of physical double-clicks in PDFs, different reader windows, or other plugins.** See [0.2.0 validation details](docs/validation-0.2.0.md), in Chinese; the [0.1.1 record](docs/validation.md) remains available.

## Development

Requires Python 3.10+ and Node.js 18+, with no npm dependencies. Use `python` on Windows, or typically `python3` on macOS/Linux:

```sh
python3 scripts/download_sources.py
python3 scripts/build_dictionary.py
npm test
python3 -m unittest discover -s tests -p "test_*.py"
node scripts/benchmark.cjs
python3 scripts/package.py
```

The first step downloads pinned sources and needs network access; later steps work offline. Both datasets have SHA-256 checks. Output is `dist/quicklex-0.2.0.xpi` and its checksum. Generated shards are not committed; release XPIs include both dictionaries. A checksum-pinned gzip snapshot of the Russian input is also redistributed so builds remain reproducible after upstream updates. See [source metadata](docs/russian-source.json).

Native checks create a separate workspace profile and empty library, without using your personal profile. For example, on macOS:

```sh
python3 scripts/native_smoke.py --executable /Applications/Zotero.app/Contents/MacOS/zotero
```

For the English/Russian browser preview, run `python3 -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/demo/`. Choose another port if needed; press `Ctrl+C` to stop. The preview shares plugin code and dictionaries but does not replace Zotero testing.

`addon/` contains plugin code; `scripts/` contains download, conversion, benchmark, native-check, and packaging tools. `tests/` covers definitions, inflections, caching, retries, lifecycle, and attribution. Optional `download_sources.py --references-only` downloads official API reference source.

## License

Plugin code and ECDICT use MIT. The Russian–Chinese dictionary and transformed data are separately distributed under **CC BY-SA 4.0**, attributed to Chinese Wiktionary contributors, with original page links and full license text. Conversion code is public and Chinese source text is preserved. See [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md), and [CC BY-SA 4.0](docs/licenses/CC-BY-SA-4.0.txt).
