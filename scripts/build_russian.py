"""Compile the pinned БРуКС Russian-Chinese DSL; no translation services."""
import hashlib
import json
import re
import shutil
import unicodedata
from collections import defaultdict

from build_dictionary import ROOT, CACHE, OUTPUT, shard_for, write_json

WORD = re.compile(r"[а-яё]+(?:-[а-яё]+)*\Z")
HAN = re.compile(r"[\u3400-\u9fff]")
SHARDS = 1024
REFERENCES = re.compile(r"(?<!\\)\[ref\](.*?)\[/ref\]", re.S)


def normalize(word):
    word = unicodedata.normalize("NFKC", word).lower().strip()
    word = re.sub(r"([а-яё])[\u0300\u0301]", r"\1", word)
    word = word.replace("\u2010", "-").replace("\u2011", "-")
    return word if len(word) <= 80 and WORD.fullmatch(word) else None


def plain_text(value):
    """Convert DSL presentation markup to text; never interpret HTML or execute links."""
    value = re.sub(r"\{\{.*?\}\}", "", value, flags=re.S)
    value = REFERENCES.sub(lambda m: "→ " + m[1], value)
    value = re.sub(r"(?<!\\)\[m\d+\]", "\n", value)
    value = re.sub(r"(?<!\\)\[/m\]", "\n", value)
    value = re.sub(r"(?<!\\)\[ex\]", "例：", value)
    value = re.sub(r"(?<!\\)\[/?[^\]\n]+\]", "", value)
    value = re.sub(r"\\([\[\]{}~\\])", r"\1", value)
    return "\n".join(line.strip() for line in value.splitlines() if line.strip())


def reference_key(word):
    word = unicodedata.normalize("NFKC", plain_text(word)).lower().strip()
    return re.sub(r"([а-яё])[\u0300\u0301]", r"\1", word)


def dsl_records(lines):
    """Stream DSL entries, including multiple consecutive headwords for one article."""
    heads, body = [], []
    for line in lines:
        line = line.lstrip("\ufeff").rstrip("\r\n")
        if not line.strip():
            if body:
                yield heads, "\n".join(body)
                heads, body = [], []
            continue
        if line.startswith("#"):
            continue
        # A few upstream Chinese continuation lines have lost their indentation.
        if line[0].isspace() or (body and HAN.search(line)):
            if heads:
                body.append(line.strip())
        else:
            if body:
                yield heads, "\n".join(body)
                heads, body = [], []
            heads.append(line.strip())
    if body:
        yield heads, "\n".join(body)


def compile_dsl(lines):
    articles, pages, links = defaultdict(list), {}, defaultdict(list)
    for heads, body in dsl_records(lines):
        text = plain_text(body)
        refs = [reference_key(m) for m in REFERENCES.findall(body)]
        for head in heads:
            key = reference_key(head)
            if not key:
                continue
            pages.setdefault(key, head)
            if text and text not in articles[key]:
                articles[key].append(text)
            links[key].extend(ref for ref in refs if ref != key and ref not in links[key])

    def translated(key, seen):
        if key in seen or len(seen) >= 8:
            return ""
        text = "\n\n".join(articles.get(key, []))
        if HAN.search(text):
            return text
        resolved = []
        for ref in links.get(key, []):
            target = translated(ref, seen | {key})
            if target:
                resolved.append("参见：" + pages[ref] + "\n" + target)
        return "\n\n".join(resolved)

    entries = {}
    for key in sorted(articles):
        word = normalize(key)
        if not word:
            continue
        text = translated(key, set())
        if text:
            # No IPA is supplied by БРуКС. Pinyin and examples stay in the article.
            entries[word] = [pages[key], "", text, "", pages[key]]
    forms = {}
    add_yo_aliases(entries, forms)
    return entries, forms


def add_yo_aliases(entries, forms):
    # Russian printing often omits the dots of ё; preserve ambiguous е meanings too.
    for word in sorted(set(entries) | set(forms)):
        if "ё" not in word:
            continue
        alias = word.replace("ё", "е")
        bases = ({word} if word in entries else set()) | set(forms.get(word, []))
        targets = sorted((set(forms.get(alias, [])) | bases) - {alias})
        if targets:
            forms[alias] = targets
        else:
            forms.pop(alias, None)


def main():
    lock = json.loads((ROOT / "docs/russian-source.json").read_text(encoding="utf-8"))
    source = CACHE / lock["file"]
    if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != lock["sourceSha256"]:
        raise SystemExit("Russian source missing or checksum mismatch. Run: python scripts/download_sources.py")
    with source.open(encoding="utf-8-sig") as stream:
        entries, forms = compile_dsl(stream)
    from russian_morphology import expand
    morphology = expand(entries, forms, normalize)
    add_yo_aliases(entries, forms)
    target = OUTPUT / "ru"
    shards = [{"entries": {}, "forms": {}} for _ in range(SHARDS)]
    for word, entry in entries.items():
        shards[int(shard_for(word, SHARDS), 16)]["entries"][word] = entry
    for word in sorted(forms):
        shards[int(shard_for(word, SHARDS), 16)]["forms"][word] = forms[word]
    for i, shard in enumerate(shards):
        write_json(target / "shards" / f"{i:03x}.json", shard)
    for old in (target / "shards").glob("??.json"):
        if re.fullmatch(r"[0-9a-f]{2}\.json", old.name):
            old.unlink()
    (target / "hot.json").unlink(missing_ok=True)
    metadata = {**lock, "name": "БРуКС / BKRS.info", "language": "ru", "targetLanguage": "zh",
                "format": 3, "entries": len(entries), "formKeys": len(forms), "hotEntries": 0, "shards": SHARDS,
                "morphology": morphology,
                "recordFields": ["word", "phonetic", "translation", "definition", "sourcePage"],
                "attribution": "БРуКС / BKRS.info contributors; OpenCorpora contributors (form index)",
                "transformations": "Convert DSL markup to plain text, retain Chinese senses/pinyin/examples, resolve reference-only articles, select Cyrillic single/hyphenated words, normalize stress/case, index explicit OpenCorpora inflections and ё/е variants, shard with FNV-1a. No AI or English-pivot translations."}
    write_json(target / "metadata.json", metadata)
    for name in ("CC-BY-SA-4.0.txt", "CC-BY-SA-3.0.txt"):
        shutil.copyfile(ROOT / "docs/licenses" / name, target / ("LICENSE-" + name))
    shutil.copyfile(ROOT / "docs/licenses/BKRS-PERMISSION.txt", target / "LICENSE-BKRS.txt")
    print(json.dumps(morphology, ensure_ascii=True), flush=True)
    print(json.dumps({key: metadata[key] for key in ("name", "entries", "formKeys", "hotEntries")}, ensure_ascii=True))


if __name__ == "__main__":
    main()
