"""Download public dictionary data and API references; never touches Zotero profiles."""
import hashlib
import argparse
import gzip
import json
import shutil
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache"
CACHE.mkdir(exist_ok=True)


def fetch(url, target, expected=None):
    if expected and target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
        print(f"Verified cached {target.name}", flush=True)
        return expected
    print(f"Downloading {target.name}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Zotero-QuickLex-build/0.1"})
    partial = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(req, timeout=180) as response, partial.open("wb") as output:
        shutil.copyfileobj(response, output)
    digest = hashlib.sha256(partial.read_bytes()).hexdigest()
    if expected and digest != expected:
        raise SystemExit(f"Checksum mismatch for {target.name}; refusing to use changed upstream data.")
    partial.replace(target)
    return digest


def russian_source():
    lock = json.loads((ROOT / "docs/russian-source.json").read_text(encoding="utf-8"))
    target = CACHE / "ru-zh-wiktionary.jsonl"
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == lock["sourceSha256"]:
        print("Verified cached Russian source", flush=True)
        return
    packed = CACHE / "ru-zh-wiktionary.jsonl.gz"
    try:
        fetch(lock["snapshotURL"], packed, lock["snapshotSha256"])
        partial = target.with_suffix(".jsonl.part")
        with gzip.open(packed, "rb") as source, partial.open("wb") as output:
            shutil.copyfileobj(source, output)
        if hashlib.sha256(partial.read_bytes()).hexdigest() != lock["sourceSha256"]:
            raise SystemExit("Russian snapshot decompression checksum mismatch")
        partial.replace(target)
    except (urllib.error.URLError, TimeoutError):
        # Kaikki's URL changes over time; only accept the exact reviewed snapshot.
        fetch(lock["upstream"], target, lock["sourceSha256"])


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
        expected = "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf" if name == "ecdict.csv" else None
        files[name] = fetch(base + name, CACHE / ("ecdict-" + name if name != "ecdict.csv" else name), expected)
    metadata = {"repository": "https://github.com/skywind3000/ECDICT", "revision": revision, "sha256": files}
    (CACHE / "dictionary-source.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2), flush=True)
    russian_source()


if __name__ == "__main__":
    main()
