# QuickLex

[简体中文](README.md) | **English**

An offline English–Chinese dictionary plugin for **Zotero 10.0**, with activation and manual lookup verified on **10.0.6**. QuickLex aims to reduce the wait for definitions by looking up words locally instead of contacting an online translation service for every selection.

**Version 0.1.1 is a public preview.** Client activation and manual lookup have been verified, and the screenshot below shows the reader selection popup in use. Broader testing across operating systems and PDF types is still needed. Please report issues with your Zotero version, operating system, and steps to reproduce the problem.

Double-click an English word in Zotero's built-in reader to display Chinese definitions in the native selection popup. Selecting a single word by dragging also triggers lookup; sentences and multiword phrases do not. The dictionary is bundled with the XPI, so automatic lookup works offline and requires no API key.

## Installation

1. Open this repository's **Releases**, select **v0.1.1**, and download **`quicklex-0.1.1.xpi`** from **Assets**. Do not extract it. If version 0.1.0 failed to install, use this version instead.
2. In Zotero, open **Tools → Plugins** (or **Add-ons**), click the gear menu, and choose **Install from file**. Select the XPI.
3. Open an English PDF with selectable text and try double-clicking a word such as `novel` or `binding`.
4. Under **Tools → QuickLex 速查**, toggle automatic definitions or choose **查一个单词…** (Look up a word…) to check that the local dictionary is working.

If another translation plugin also opens a popup, you can turn off its automatic lookup to compare the behavior. QuickLex can be disabled or removed through Zotero's plugin manager.

Version 0.1.1 fixes an installation failure caused by the missing HTTPS `applications.zotero.update_url` field required by Zotero 10. In 0.1.0, the installer returned `ERROR_CORRUPT_FILE (-3)` and displayed a generic compatibility warning. This preview is updated manually by installing a newer XPI; it disables its own background updates at startup. The manifest uses the reserved domain `quicklex.invalid` as a placeholder, so there is no automatic update service and manually checking for plugin updates will fail.

Download the **`.xpi`** asset to install the plugin. GitHub's **Source code (zip/tar.gz)** archives contain development source and cannot be installed directly. A `.sha256` file is also provided to verify the download.

![QuickLex word lookup in the Zotero reader](展示图.png)

## Features

- **399,213 local entries:** Definitions, phonetic transcriptions, and English explanations from [ECDICT](https://github.com/skywind3000/ECDICT).
- **Common-word preload:** Loads 8,000 common entries asynchronously at startup. Other entries are distributed across 256 balanced shards and loaded as needed.
- **Lookup cache:** Keeps up to 2,048 query results and 24 dictionary shards in memory, while sharing concurrent reads for the same query or shard.
- **Multiple meanings:** Preserves the Chinese definitions and parts of speech available in the source dictionary. Long entries can be scrolled, and English definitions can be expanded.
- **Inflection lookup:** Uses 56,954 inflection-index keys derived from the source dictionary. Exact-word meanings are retained alongside base forms: for example, `found` includes its own meaning as well as `find`, and `leaves` can lead to both `leaf` and `leave`. Simple suffix rules are used as a fallback and explicitly labeled as possible base forms.
- **PDF text normalization:** Handles capitalization, some punctuation, soft hyphens, ligatures, and words split across lines with a hyphen.
- **Optional online lookup:** Only clicking **在线补查** (Look up online) opens Youdao Dictionary in your browser and sends the selected word.

## Performance and compatibility

The same lookup engine was benchmarked on October 14, 2026, using Node.js 24 on Windows with a Ryzen 9 8945HS. The sample included 20 common and academic words.

| Scenario | Median | P95 |
| --- | ---: | ---: |
| Empty plugin cache; read and parse dictionary shards | 2.338 ms | 5.115 ms |
| First mixed queries after common-word preload | 0.098 ms | 2.688 ms |
| Cached results; 1,000 repeated queries | 0.002 ms | 0.004 ms |

Preloading took 23.044 ms. The original benchmark is available in [docs/benchmark.json](docs/benchmark.json). Run `node scripts/benchmark.cjs` to produce a new local report at `artifacts/benchmark.json`.

**These figures measure only file access and lookup logic in Node.js. The operating system's disk cache may already have been warm. They exclude XPI decompression, Zotero's native selection-popup delay, DOM rendering, and screen painting. No measured comparison with another translation plugin has been made.** The time shown in a QuickLex popup starts when the plugin receives the selection event and ends when definitions are filled in; it is not the complete time from a double-click to visible text.

Development used the [Zotero 10 developer documentation](https://www.zotero.org/support/dev/zotero_10_for_developers) and the installed 10.0.6 interface source. Version 0.1.1 was loaded in a real Zotero 10.0.6 client using an isolated profile and an empty library. Package parsing, activation, menu registration, and local lookup were verified: the install error was `0`, `isCompatible=true`, `active=true`, and `appDisabled=false`. Looking up `novel` returned its noun and adjective meanings. All 19 automated tests passed.

The screenshot shows an actual reader popup for `augmentation`. Systematic testing across operating systems and a wider range of PDFs is still pending. See [docs/validation.md](docs/validation.md) for the earlier validation record, in Chinese. Appearance and timing may vary between clients.

QuickLex is a single-word dictionary lookup tool. Coverage, accuracy, and completeness depend on ECDICT, including its specialized and potentially dated definitions. It does not choose meanings based on the surrounding paper, translate full sentences or general multiword phrases, or perform OCR on scanned PDFs. The source data is not a complete authoritative dictionary.

## Development

Requires Python 3.10+ and Node.js 18+. No npm dependencies are needed.

```sh
python scripts/download_sources.py
python scripts/build_dictionary.py
node --test tests/core.test.cjs tests/runtime.test.cjs tests/manifest.test.cjs
node scripts/benchmark.cjs
python scripts/package.py
```

The first command downloads the public dictionary and its license and requires an internet connection. The remaining steps can run offline. The source revision and SHA-256 checksum are pinned in the scripts; dictionary compilation stops if the checksum does not match. Packaging produces `dist/quicklex-0.1.1.xpi` and its checksum file.

The repository does not include generated dictionary shards. The build scripts compile them from the pinned ECDICT revision, and the XPI on the release page already includes them. Users of a source archive need to run the build steps above. Optionally, `python scripts/download_sources.py --references-only` downloads official interface source for development; this is not required for a build.

To preview the card in a browser:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/demo/`. The preview shares `core.js`, `card.js`, and the compiled dictionary with the plugin, but is not a substitute for testing inside Zotero. If the port is occupied or reserved, choose another local port. Press `Ctrl+C` in the terminal to stop the server.

Source layout: `addon/` contains the plugin, `scripts/` contains download/build/benchmark/packaging tools, and `tests/` covers selection normalization, real dictionary entries, inflections, caching, retry behavior, rapid selection changes, and lifecycle cleanup.

## License

The plugin is licensed under MIT. ECDICT's MIT license and attribution are included in the installation package. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
