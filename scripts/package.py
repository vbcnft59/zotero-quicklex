"""Create an installable XPI with stdlib only; fail if the dictionary is missing."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    dictionary = ROOT / "build" / "dictionary"
    if not all((dictionary / part / "metadata.json").exists() for part in (".", "ru")):
        raise SystemExit("First run: python scripts/build_dictionary.py")
    manifest = json.loads((ROOT / "addon" / "manifest.json").read_text(encoding="utf-8"))
    app = manifest["applications"]["zotero"]
    for field in ("id", "update_url", "strict_min_version", "strict_max_version"):
        if not app.get(field):
            raise SystemExit(f"Missing Zotero installation manifest field: {field}")
    if not app["update_url"].startswith("https://"):
        raise SystemExit("Zotero disables add-ons without an HTTPS update_url.")
    version = manifest["version"]
    output = ROOT / "dist" / f"quicklex-{version}.xpi"
    output.parent.mkdir(exist_ok=True)
    sources = [(path, path.relative_to(ROOT / "addon").as_posix()) for path in (ROOT / "addon").rglob("*") if path.is_file()]
    sources += [(path, "data/" + path.relative_to(dictionary).as_posix()) for path in dictionary.rglob("*") if path.is_file()]
    sources += [(ROOT / name, name) for name in ["LICENSE", "THIRD_PARTY_NOTICES.md", "README.md", "README.en.md"]]
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path, name in sorted(sources, key=lambda source: source[1]):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    with zipfile.ZipFile(output) as archive:
        required = {"bootstrap.js", "manifest.json", "core.js", "card.js", "runtime.js", "user-dictionary.js", "data/hot.json", "data/LICENSE-ECDICT.txt",
                    "data/ru/metadata.json", "data/ru/LICENSE-BKRS.txt", "data/ru/LICENSE-CC-BY-SA-4.0.txt", "data/ru/LICENSE-CC-BY-SA-3.0.txt"}
        assert required.issubset(set(archive.namelist()))
        assert len([name for name in archive.namelist() if name.startswith("data/shards/")]) == 256
        assert len([name for name in archive.namelist() if name.startswith("data/ru/shards/")]) == 1024
        assert all("\\" not in name and not name.startswith("/") for name in archive.namelist())
        assert archive.testzip() is None
        assert json.loads(archive.read("manifest.json"))["applications"]["zotero"]["strict_max_version"] == "10.0.*"
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(".xpi.sha256").write_text(f"{digest}  {output.name}\n", encoding="utf-8")
    print(f"Created {output} ({output.stat().st_size / 1024**2:.2f} MiB)")
    print(f"SHA-256 {digest}")


if __name__ == "__main__":
    main()
