"""Compile ECDICT into balanced local JSON shards and a common-word preload."""
import csv
import hashlib
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache"
OUTPUT = ROOT / "build" / "dictionary"
WORD = re.compile(r"[a-z]+(?:['-][a-z]+)*\Z")
SOURCE_SHA256 = "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"


def valid(word):
    return len(word) <= 80 and WORD.fullmatch(word) is not None


def shard_for(word):
    value = 0x811C9DC5
    for char in word:
        value = ((value ^ ord(char)) * 0x01000193) & 0xFFFFFFFF
    return f"{value & 255:02x}"


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def text(value):
    return value.replace("\\n", "\n").replace("\r\n", "\n").strip()


def main():
    source = CACHE / "ecdict.csv"
    if not source.exists():
        raise SystemExit("First run: python scripts/download_sources.py")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit("Dictionary checksum mismatch; review the new source before changing SOURCE_SHA256.")
    metadata = json.loads((CACHE / "dictionary-source.json").read_text(encoding="utf-8"))
    entries, ranks, priority, exchanges = {}, {}, {}, []
    with source.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            original = row["word"].strip()
            key = original.lower()
            translation = text(row["translation"])
            if not valid(key) or not translation:
                continue
            # ECDICT is case insensitive. Prefer a lowercase headword over a capitalized duplicate.
            score = int(original == key)
            if key not in entries or score > priority[key]:
                entries[key] = [original, text(row["phonetic"]), translation, text(row["definition"])]
                priority[key] = score
            numbers = [int(row[field]) for field in ("bnc", "frq") if row[field].isdigit() and int(row[field]) > 0]
            ranks[key] = min(ranks.get(key, 10**9), min(numbers, default=10**9))
            exchanges.append((key, row["exchange"]))

    forms = defaultdict(set)
    for key, exchange in exchanges:
        for pair in exchange.split("/"):
            kind, separator, value = pair.partition(":")
            if not separator:
                continue
            for term in value.lower().split("/"):
                if not valid(term) or term == key:
                    continue
                if kind == "0" and term in entries:
                    forms[key].add(term)
                elif kind in {"d", "p", "i", "3", "s", "r", "t"}:
                    forms[term].add(key)
    forms = {word: sorted(bases) for word, bases in forms.items()}

    shards = [{"entries": {}, "forms": {}} for _ in range(256)]
    for word in sorted(entries):
        shards[int(shard_for(word), 16)]["entries"][word] = entries[word]
    for word in sorted(forms):
        shards[int(shard_for(word), 16)]["forms"][word] = forms[word]
    for number, shard in enumerate(shards):
        write_json(OUTPUT / "shards" / f"{number:02x}.json", shard)

    hot_keys = set(sorted(entries, key=lambda key: (ranks[key], key))[:8000])
    hot_forms = {word: bases for word, bases in forms.items() if word in hot_keys or any(base in hot_keys for base in bases)}
    write_json(OUTPUT / "hot.json", {"entries": {key: entries[key] for key in sorted(hot_keys)}, "forms": hot_forms})
    metadata.update({
        "name": "ECDICT", "format": 1, "entries": len(entries), "formKeys": len(forms),
        "hotEntries": len(hot_keys), "shards": 256, "sourceSha256": digest,
        "scope": "ASCII single words, hyphenated words, and apostrophes; nonempty translations only",
        "recordFields": ["word", "phonetic", "translation", "definition"],
    })
    write_json(OUTPUT / "metadata.json", metadata)
    shutil.copyfile(CACHE / "ecdict-LICENSE", OUTPUT / "LICENSE-ECDICT.txt")
    print(json.dumps({key: metadata[key] for key in ["entries", "formKeys", "hotEntries", "revision"]}, indent=2))
    print(f"Dictionary: {sum(path.stat().st_size for path in OUTPUT.rglob('*') if path.is_file()) / 1024**2:.1f} MiB uncompressed")


if __name__ == "__main__":
    main()
