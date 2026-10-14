"""Prepare an isolated Zotero profile and library inside this workspace for smoke tests."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SMOKE = ROOT / ".cache" / "zotero-smoke"
PROFILE = SMOKE / "profile"
DATA = SMOKE / "data"

def main():
    manifest = json.loads((ROOT / "addon" / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    package = ROOT / "dist" / f"quicklex-{version}.xpi"
    PROFILE.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    (PROFILE / "extensions").mkdir(exist_ok=True)
    prefs = {
        "extensions.zotero.dataDir": str(DATA),
        "extensions.zotero.useDataDir": True,
        "extensions.zotero.firstRun": False,
        "extensions.zotero.automaticScraperUpdates": False,
        "extensions.zotero.translators.bundledVersion": "99999999",
        "extensions.zotero.reportTranslationFailure": False,
        "extensions.autoDisableScopes": 0,
        "extensions.enabledScopes": 15,
        "browser.shell.checkDefaultBrowser": False,
    }
    (PROFILE / "user.js").write_text("\n".join(f"user_pref({json.dumps(key)}, {json.dumps(value)});" for key, value in prefs.items()) + "\n", encoding="utf-8")
    shutil.copyfile(package, PROFILE / "extensions" / (manifest["applications"]["zotero"]["id"] + ".xpi"))
    print(PROFILE)

if __name__ == "__main__":
    main()
