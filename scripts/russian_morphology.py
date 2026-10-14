"""Expand translated headwords using explicit OpenCorpora dictionary paradigms.

This is a build-time operation. Neither Python nor a morphological analyzer is
shipped in the XPI. The format is documented by pymorphy3's dictionary wrapper.
"""
import hashlib
import io
import json
import struct
import sys
import zipfile
from collections import defaultdict

from build_dictionary import ROOT, CACHE


def checked_file(spec):
    path = CACHE / spec["file"]
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != spec["sha256"]:
        raise SystemExit(f"Missing or changed {path.name}; run python scripts/download_sources.py")
    return path


class Morphology:
    def __init__(self):
        self.lock = json.loads((ROOT / "docs/russian-morphology-source.json").read_text(encoding="utf-8"))
        package = checked_file(self.lock["dataPackage"])
        reader = checked_file(self.lock["readerPackage"])
        sys.path.insert(0, str(reader))
        from dawg_python import RecordDAWG
        with zipfile.ZipFile(package) as archive:
            prefix = "pymorphy3_dicts_ru/data/"
            self.meta = dict(json.loads(archive.read(prefix + "meta.json")))
            assert self.meta["format_version"] == "2.4"
            assert self.meta["source_revision"] == self.lock["sourceRevision"]
            self.prefixes = self.meta["compile_options"]["paradigm_prefixes"]
            self.suffixes = json.loads(archive.read(prefix + "suffixes.json"))
            self.paradigms = []
            stream = io.BytesIO(archive.read(prefix + "paradigms.array"))
            count, = struct.unpack("<H", stream.read(2))
            for _ in range(count):
                length, = struct.unpack("<H", stream.read(2))
                self.paradigms.append(struct.unpack(f"<{length}H", stream.read(length * 2)))
            data = archive.read(prefix + "words.dawg")
        # Read fixed archive members only. Do not extract arbitrary paths or import dictionary package code.
        target = CACHE / "opencorpora-words.dawg"
        target.write_bytes(data)
        self.words = RecordDAWG(">HH").load(str(target))
        self.replaces = self.words.compile_replaces({"е": "ё"})

    def forms_for(self, headword):
        for spelling, parses in self.words.similar_items(headword, self.replaces):
            for paradigm_id, index in parses:
                paradigm = self.paradigms[paradigm_id]
                size = len(paradigm) // 3
                prefix = self.prefixes[paradigm[size * 2 + index]]
                suffix = self.suffixes[paradigm[index]]
                stem = spelling[len(prefix):-len(suffix)] if suffix else spelling[len(prefix):]
                normal = self.prefixes[paradigm[size * 2]] + stem + self.suffixes[paradigm[0]]
                if normal.replace("ё", "е") != headword.replace("ё", "е"):
                    continue
                for i in range(size):
                    yield self.prefixes[paradigm[size * 2 + i]] + stem + self.suffixes[paradigm[i]]


def expand(entries, forms, normalize):
    morphology = Morphology()
    additions = defaultdict(set)
    matched = 0
    for base in sorted(entries):
        found = False
        for form in morphology.forms_for(base):
            form = normalize(form)
            if form and form != base:
                additions[form].add(base)
                found = True
        matched += int(found)
    for form, bases in additions.items():
        forms[form] = sorted(set(forms.get(form, [])) | bases)
    return {"source": "OpenCorpora", "sourceRevision": morphology.lock["sourceRevision"],
            "matchedHeadwords": matched, "formKeys": len(additions), "license": "CC-BY-SA-3.0",
            "adapterLicense": "CC-BY-SA-4.0", "dataPackage": morphology.lock["dataPackage"],
            "note": "Explicit source paradigms only; no guessed forms or new glosses."}
