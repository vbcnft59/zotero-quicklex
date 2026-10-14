"""Download public dictionary data and API references; never touches Zotero profiles."""
import hashlib
import argparse
import json
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache"
CACHE.mkdir(exist_ok=True)


def fetch(url, target):
    print(f"Downloading {target.name}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Zotero-QuickLex-build/0.1"})
    partial = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(req, timeout=180) as response, partial.open("wb") as output:
        shutil.copyfileobj(response, output)
    partial.replace(target)
    return hashlib.sha256(target.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--references-only", action="store_true")
    args = parser.parse_args()
    if args.references_only:
        fetch("https://raw.githubusercontent.com/zotero/zotero/10.0.6/chrome/content/zotero/xpcom/file.js", CACHE / "zotero-file-10.0.6.js")
        fetch("https://raw.githubusercontent.com/zotero/reader/master/src/common/components/view-popup/selection-popup.js", CACHE / "reader-selection-popup.js")
        return
    revision = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
    base = f"https://raw.githubusercontent.com/skywind3000/ECDICT/{revision}/"
    files = {}
    for name in ("ecdict.csv", "LICENSE", "README.md"):
        files[name] = fetch(base + name, CACHE / ("ecdict-" + name if name != "ecdict.csv" else name))
    metadata = {"repository": "https://github.com/skywind3000/ECDICT", "revision": revision, "sha256": files}
    (CACHE / "dictionary-source.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2), flush=True)


if __name__ == "__main__":
    main()
