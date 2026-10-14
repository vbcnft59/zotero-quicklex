"""Compile the pinned Chinese Wiktionary Russian data; no translation services."""
import hashlib
import json
import re
import shutil
import unicodedata
from collections import defaultdict

from build_dictionary import ROOT, CACHE, OUTPUT, shard_for, write_json

WORD = re.compile(r"[а-яё]+(?:-[а-яё]+)*\Z")
HAN = re.compile(r"[\u3400-\u9fff]")
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
            glosses = [g.strip() for g in sense.get("glosses", []) if g.strip()]
            if not glosses or not any(HAN.search(g) for g in glosses):
                continue
            labels = sense.get("raw_tags", []) + [TAG_LABELS[t] for t in sense.get("tags", []) if t in TAG_LABELS]
            label = "（" + "、".join(dict.fromkeys(labels)) + "）" if labels else ""
            meaning = label + "；".join(glosses)
            if meaning not in meanings:
                meanings.append(meaning)
        if meanings:
            block = item.get("pos_title", item.get("pos", "")) + "\n" + "\n".join(
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
    # Russian printing often omits the dots of ё. Preserve exact е meanings alongside ё candidates.
    for word in sorted(set(entries) | set(forms)):
        if "ё" not in word:
            continue
        alias = word.replace("ё", "е")
        bases = ({word} if word in entries else set()) | set(forms.get(word, []))
        forms[alias] = sorted((set(forms.get(alias, [])) | bases) - {alias})
    return entries, forms


def main():
    lock = json.loads((ROOT / "docs" / "russian-source.json").read_text(encoding="utf-8"))
    source = CACHE / "ru-zh-wiktionary.jsonl"
    if not source.exists() or hashlib.sha256(source.read_bytes()).hexdigest() != lock["sourceSha256"]:
        raise SystemExit("Russian source missing or checksum mismatch. Run: python scripts/download_sources.py")
    with source.open(encoding="utf-8") as stream:
        entries, forms = compile_records(json.loads(line) for line in stream if line.strip())
    target = OUTPUT / "ru"
    shards = [{"entries": {}, "forms": {}} for _ in range(256)]
    for word, entry in entries.items():
        shards[int(shard_for(word), 16)]["entries"][word] = entry
    for word in sorted(forms):
        shards[int(shard_for(word), 16)]["forms"][word] = forms[word]
    for i, shard in enumerate(shards):
        write_json(target / "shards" / f"{i:02x}.json", shard)
    # These shards are already small. A large preload competes with the first Russian lookup.
    (target / "hot.json").unlink(missing_ok=True)
    metadata = {**lock, "name": "Chinese Wiktionary Russian", "language": "ru", "targetLanguage": "zh",
                "format": 1, "entries": len(entries), "formKeys": len(forms), "hotEntries": 0, "shards": 256,
                "recordFields": ["word", "phonetic", "translation", "definition", "sourcePage"],
                "license": "CC-BY-SA-4.0", "attribution": "Chinese Wiktionary contributors; Kaikki.org / Wiktextract",
                "transformations": "Retain Cyrillic single/hyphenated words with Chinese glosses, merge senses/POS, normalize stress/case, index explicit inflections and ё/е variants, shard with FNV-1a. No AI translations; no audio."}
    write_json(target / "metadata.json", metadata)
    shutil.copyfile(ROOT / "docs/licenses/CC-BY-SA-4.0.txt", target / "LICENSE-CC-BY-SA-4.0.txt")
    print(json.dumps({key: metadata[key] for key in ("name", "entries", "formKeys", "hotEntries")}, ensure_ascii=True))


if __name__ == "__main__":
    main()
