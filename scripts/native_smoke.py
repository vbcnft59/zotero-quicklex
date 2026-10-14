"""Load the release XPI in a real Zotero using an isolated profile/library only.

The small companion test add-on calls QuickLex's registered selection handler in
a real DOM. It does not simulate a physical PDF double-click or alter a user profile.
"""
import argparse
import json
import platform
import subprocess
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from prepare_smoke_profile import main as prepare_profile
import prepare_smoke_profile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", required=True, type=Path)
    args = parser.parse_args()
    if not args.executable.is_file():
        raise SystemExit(f"Zotero executable not found: {args.executable}")
    folder = ROOT / ".cache" / f"native-smoke-{platform.system()}-{platform.machine() or 'native'}-{time.time_ns()}"
    profile = folder / ("test-profile" if sys.platform == "win32" else "测试 profile")
    data = folder / "data"
    report_path = folder / "report.json"
    report_path.unlink(missing_ok=True)
    prepare_smoke_profile.PROFILE = profile
    prepare_smoke_profile.DATA = data
    prepare_profile()
    marker = data / "quicklex-smoke-marker"
    marker.write_text("Isolated QuickLex integration test\n", encoding="utf-8")
    manifest = json.loads((ROOT / "addon/manifest.json").read_text(encoding="utf-8"))
    plugin_id = manifest["applications"]["zotero"]["id"]
    probe_manifest = {**manifest, "name": "QuickLex isolated test companion",
                      "applications": {"zotero": {**manifest["applications"]["zotero"], "id": "quicklex-smoke@test.invalid"}}}
    script = r"""
function startup() { void run(); }
function shutdown() {}
function install() {}
function uninstall() {}
async function run() {
  const output = OUTPUT;
  const report = { version: Services.appinfo.version, os: Services.appinfo.OS,
    abi: Services.appinfo.XPCOMABI, checks: [] };
  try {
    await Zotero.initializationPromise;
    if (Zotero.DataDirectory.dir !== DATA || !(await IOUtils.exists(MARKER))) {
      throw new Error('Refusing to run outside the isolated test library');
    }
    await Zotero.uiReadyPromise;
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const plugin = await AddonManager.getAddonByID(PLUGIN_ID);
    if (!plugin?.isActive || !plugin.isCompatible || plugin.appDisabled || plugin.version !== VERSION) {
      throw new Error('QuickLex installation/activation failed');
    }
    report.plugin = { active: plugin.isActive, compatible: plugin.isCompatible,
      appDisabled: plugin.appDisabled, version: plugin.version, root: plugin.getResourceURI().spec };
    let win, listener;
    for (let i = 0; i < 200; i++) {
      win = Zotero.getMainWindows().find(w => w.document.getElementById('quicklex-tools-menu'));
      listener = Zotero.Reader._registeredListeners.find(x => x.pluginID === PLUGIN_ID && x.type === 'renderTextSelectionPopup');
      if (win && listener) break;
      await Zotero.Promise.delay(100);
    }
    if (!win || !listener) throw new Error('QuickLex menu/reader handler did not register');
    report.menu = true;
    const doc = win.document;
    const holder = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    doc.documentElement.append(holder);
    for (const [word, expected] of [['novel', '小说'], ['НАУ́КА', '科学'], ['исследования', '研究'], ['ученый', '科学家'],
      ['статистические', '统计'], ['читает', '读'], ['экономического', '经济'], ['церковной', '教会']]) {
      let card;
      listener.handler({doc, params: {annotation: {text: word}}, append(node) {card = node; holder.replaceChildren(node);} });
      for (let i = 0; i < 300 && !card?.querySelector('.ql-translation'); i++) await Zotero.Promise.delay(10);
      const text = Array.from(card?.querySelectorAll('.ql-translation') || [], x => x.textContent).join('\n');
      if (!text.includes(expected)) throw new Error('Lookup failed: ' + word + ' / ' + text);
      if (word !== 'novel' && (!card.textContent.includes('БРуКС') || card.textContent.includes('维基词典'))) {
        throw new Error('Wrong Russian source attribution: ' + word);
      }
      report.checks.push({word, text, source: card.querySelector('.ql-time').textContent});
    }
    const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
    if (typeof FilePicker !== 'function') throw new Error('Native dictionary picker unavailable');
    if (PathUtils.profileDir !== PROFILE) throw new Error('Unexpected profile path; refusing dictionary writes');
    const scope = {};
    for (const file of ['core.js', 'user-dictionary.js']) {
      Services.scriptloader.loadSubScript(plugin.getResourceURI().spec + file, scope, 'UTF-8');
    }
    const bundled = new scope.QuickLexCore.Dictionary({ language: 'ru',
      loadJSON: async file => JSON.parse(await Zotero.File.getResourceAsync(plugin.getResourceURI().spec + 'data/ru/' + file)) });
    const manager = new scope.QuickLexUserDictionary.Manager({ bundled, prefs: Services.prefs,
      getStorage: () => ({ io: IOUtils, paths: PathUtils, root: PathUtils.join(PathUtils.profileDir, 'quicklex'), Decoder: TextDecoder }),
      yieldTask: () => Zotero.Promise.delay(0) });
    const fixture = PathUtils.join(PathUtils.parent(output), '俄汉测试.dsl');
    await IOUtils.writeUTF8(fixture, '#NAME "本地测试词典"\nстатистический\n [m1]自备统计释义[/m]\n\n');
    const imported = await manager.importFile(fixture);
    if (imported.entries !== 1 || !(await manager.lookup('статистические')).entries[0].translation.includes('自备统计释义')) {
      throw new Error('Native local DSL import/inflection lookup failed');
    }
    manager.dispose(); bundled.dispose();
    await plugin.disable();
    await plugin.enable();
    for (let i = 0; i < 200; i++) {
      listener = Zotero.Reader._registeredListeners.find(x => x.pluginID === PLUGIN_ID && x.type === 'renderTextSelectionPopup');
      if (listener && doc.getElementById('quicklex-tools-menu')) break;
      await Zotero.Promise.delay(100);
    }
    let importedCard;
    listener.handler({doc, params: {annotation: {text: 'статистические'}}, append(node) { importedCard = node; holder.replaceChildren(node); } });
    for (let i = 0; i < 300 && !importedCard?.querySelector('.ql-translation'); i++) await Zotero.Promise.delay(10);
    if (!importedCard?.textContent.includes('自备统计释义') || !importedCard.textContent.includes('本地测试词典')) {
      throw new Error('Imported dictionary not restored in reader after plugin restart');
    }
    report.importedDictionary = { entries: imported.entries, persistedAfterRestart: true, inflection: 'статистические' };
    const reset = Array.from(doc.getElementById('quicklex-tools-menu').querySelectorAll('menuitem'))
      .find(node => node.getAttribute('label') === '恢复内置俄汉词典');
    reset.doCommand();
    for (let i = 0; i < 200 && Services.prefs.getStringPref('extensions.quicklex.userDictionary', ''); i++) await Zotero.Promise.delay(10);
    let restoredCard;
    listener.handler({doc, params: {annotation: {text: 'статистические'}}, append(node) { restoredCard = node; holder.replaceChildren(node); } });
    for (let i = 0; i < 300 && !restoredCard?.querySelector('.ql-translation'); i++) await Zotero.Promise.delay(10);
    if (!restoredCard?.textContent.includes('БРуКС') || restoredCard.textContent.includes('自备统计释义')) {
      throw new Error('Restore bundled dictionary command failed');
    }
    report.importedDictionary.resetToBundled = true;
    holder.remove();
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.error = String(error);
    report.stack = error.stack;
  }
  await IOUtils.writeJSON(output, report);
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}
"""
    replacements = {"OUTPUT": str(report_path), "DATA": str(data), "MARKER": str(marker), "PROFILE": str(profile),
                    "PLUGIN_ID": plugin_id, "VERSION": manifest["version"]}
    # Exact uppercase tokens only, replaced before writing an executable test script.
    import re
    script = re.sub(r"\b(?:OUTPUT|DATA|MARKER|PROFILE|PLUGIN_ID|VERSION)\b",
                    lambda match: json.dumps(replacements[match.group()]), script)
    probe_source = folder / "probe-bootstrap.js"
    probe_source.write_text(script, encoding="utf-8", newline="\n")
    subprocess.run(["node", "--check", str(probe_source)], check=True)
    probe_path = profile / "extensions/quicklex-smoke@test.invalid.xpi"
    with zipfile.ZipFile(probe_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(probe_manifest))
        archive.writestr("bootstrap.js", script)
    launch = {}
    if sys.platform == "win32":
        info = subprocess.STARTUPINFO()
        info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        info.wShowWindow = subprocess.SW_HIDE
        launch.update(startupinfo=info, creationflags=subprocess.CREATE_NO_WINDOW)
    with (folder / "zotero.log").open("wb") as log:
        process = subprocess.Popen([str(args.executable), "-no-remote", "-profile", str(profile), "-ZoteroDebugText"],
                                   stdout=log, stderr=subprocess.STDOUT, **launch)
        try:
            deadline = time.monotonic() + 180
            # Zotero's Windows launcher can exit successfully while its browser process starts.
            while not report_path.exists() and time.monotonic() < deadline:
                time.sleep(0.25)
            if not report_path.exists():
                raise RuntimeError(f"Zotero test did not finish (exit={process.poll()}); inspect {folder / 'zotero.log'}")
            report = json.loads(report_path.read_text(encoding="utf-8"))
            print(json.dumps(report, ensure_ascii=True, indent=2))
            if not report.get("passed"):
                raise RuntimeError(report.get("error", "Native smoke test failed"))
        finally:
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=15)


if __name__ == "__main__":
    main()
