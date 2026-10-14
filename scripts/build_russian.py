"""Compile the pinned Chinese Wiktionary Russian data; no translation services."""
import hashlib
import json
import re
import shutil
import unicodedata
from collections import defaultdict
from contextlib import ExitStack

from build_dictionary import ROOT, CACHE, OUTPUT, shard_for, write_json

WORD = re.compile(r"[а-яё]+(?:-[а-яё]+)*\Z")
HAN = re.compile(r"[\u3400-\u9fff]")
SHARDS = 1024
POS_LABELS = {"noun": "名词", "verb": "动词", "adj": "形容词", "adv": "副词", "pron": "代词",
              "prep": "介词", "conj": "连词", "intj": "叹词", "name": "专有名词", "num": "数词"}
INFLECTION = {
    "nominative", "genitive", "dative", "accusative", "instrumental", "prepositional",
    "locative", "vocative", "partitive", "plural", "singular", "past", "present",
    "future", "imperative", "indicative", "conditional", "participle", "gerund",
    "first-person", "second-person", "third-person", "comparative", "superlative", "short-form",
}
TAG_LABELS = {
    "figuratively": "比喻", "archaic": "古旧", "obsolete": "废弃", "colloquial": "口语",
    "slang": "俚语", "vulgar": "粗俗", "offensive": "冒犯", "derogatory": "贬义",
    "informal": "非正式", "literary": "书面", "rare": "罕见", "dated": "旧用",
    "transitive": "及物", "intransitive": "不及物", "reflexive": "反身",
}


def normalize(word):
    word = unicodedata.normalize("NFKC", word).lower().strip()
    word = re.sub(r"([а-яё])[\u0300\u0301]", r"\1", word)
    word = word.replace("\u2010", "-").replace("\u2011", "-")
    return word if len(word) <= 80 and WORD.fullmatch(word) else None


def compile_records(records):
    """Keep genuine glosses; form-only entries are resolved to their translated lemmas."""
    blocks, phonetics, pages = defaultdict(list), defaultdict(list), {}
    links = defaultdict(set)
    for item in records:
        if item.get("lang_code") != "ru":
            continue
        page = item.get("word", "")
        word = normalize(page)
        if not word:
            continue
        pages.setdefault(word, page)
        meanings = []
        for sense in item.get("senses", []):
            for base in sense.get("form_of", []):
                key = normalize(base.get("word", ""))
                if key and key != word:
                    links[word].add(key)
            if sense.get("form_of") or "form-of" in sense.get("tags", []):
                continue
            glosses = [re.sub(r"(?m)^#+[:*]*\s*", "", g.strip()) for g in sense.get("glosses", []) if g.strip()]
            if not glosses or not any(HAN.search(g) for g in glosses):
                continue
            labels = sense.get("raw_tags", []) + [TAG_LABELS[t] for t in sense.get("tags", []) if t in TAG_LABELS]
            label = "（" + "、".join(dict.fromkeys(labels)) + "）" if labels else ""
            meaning = label + "；".join(glosses)
            if meaning not in meanings:
                meanings.append(meaning)
        if meanings:
            title = item.get("pos_title") or POS_LABELS.get(item.get("pos"), "")
            block = (title + "\n" if title else "") + "\n".join(
                f"{i}. {meaning}" for i, meaning in enumerate(meanings, 1))
            if block not in blocks[word]:
                blocks[word].append(block)
            for sound in item.get("sounds", []):
                ipa = sound.get("ipa", "").strip().strip("/[]")
                if ipa and ipa not in phonetics[word]:
                    phonetics[word].append(ipa)
        for form in item.get("forms", []):
            tags = set(form.get("tags", []))
            # Headword forms can also contain derivations and aspect partners: do not lemmatize those.
            if not tags.intersection(INFLECTION) or tags.intersection({"relational", "diminutive", "alternative"}):
                continue
            key = normalize(form.get("form", ""))
            if key and key != word:
                links[key].add(word)

    entries = {word: [pages[word], " · ".join(phonetics[word]), "\n\n".join(blocks[word]), "", pages[word]]
               for word in sorted(blocks)}

    def lemmas(word, seen):
        if word in seen or len(seen) > 16:
            return set()
        found = {word} if word in entries else set()
        for base in sorted(links.get(word, [])):
            found.update(lemmas(base, seen | {word}))
        return found

    forms = {}
    for word in sorted(links):
        bases = lemmas(word, set()) - {word}
        if bases:
            forms[word] = sorted(bases)
    add_yo_aliases(entries, forms)
    return entries, forms


def add_yo_aliases(entries, forms):
    # Russian printing often omits the dots of ё. Preserve exact е meanings alongside ё candidates.
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
    lock = json.loads((ROOT / "docs" / "russian-source.json").read_text(encoding="utf-8"))
    with ExitStack() as stack:
        streams = []
        for spec in lock["sources"]:
            source = CACHE / spec["file"]
            if not source.exists() or hashlib.sha256(source.read_bytes()).hexdigest() != spec["sourceSha256"]:
                raise SystemExit(f"Russian source missing or checksum mismatch: {source.name}. Run: python scripts/download_sources.py")
            streams.append(stack.enter_context(source.open(encoding="utf-8")))
        entries, forms = compile_records(json.loads(line) for stream in streams for line in stream if line.strip())
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
    # Remove only the old, exactly named 256-shard layout; never recursively clear a directory.
    for old in (target / "shards").glob("??.json"):
        if re.fullmatch(r"[0-9a-f]{2}\.json", old.name):
            old.unlink()
    # These shards are already small. A large preload competes with the first Russian lookup.
    (target / "hot.json").unlink(missing_ok=True)
    metadata = {**lock, "name": "Chinese Wiktionary Russian", "language": "ru", "targetLanguage": "zh",
                "format": 2, "entries": len(entries), "formKeys": len(forms), "hotEntries": 0, "shards": SHARDS,
                "morphology": morphology,
                "recordFields": ["word", "phonetic", "translation", "definition", "sourcePage"],
                "license": "CC-BY-SA-4.0", "attribution": "Chinese Wiktionary contributors; Kaikki.org / Wiktextract; OpenCorpora contributors",
                "transformations": "Merge both ru language-name partitions, retain Chinese glosses, merge senses/POS, normalize stress/case, index explicit Wiktionary and OpenCorpora inflections plus ё/е variants, shard with FNV-1a. No AI translations; no audio."}
    write_json(target / "metadata.json", metadata)
    shutil.copyfile(ROOT / "docs/licenses/CC-BY-SA-4.0.txt", target / "LICENSE-CC-BY-SA-4.0.txt")
    shutil.copyfile(ROOT / "docs/licenses/CC-BY-SA-3.0.txt", target / "LICENSE-CC-BY-SA-3.0.txt")
    print(json.dumps(morphology, ensure_ascii=True), flush=True)
    print(json.dumps({key: metadata[key] for key in ("name", "entries", "formKeys", "hotEntries")}, ensure_ascii=True))


if __name__ == "__main__":
    main()
