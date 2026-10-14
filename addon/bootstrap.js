var quickLexInstance;
var quickLexScope;

async function startup({ id, version, rootURI }) {
  await Zotero.initializationPromise;
  // Local preview builds are updated by installing a new XPI. Zotero requires an HTTPS
  // update_url even for these builds; .invalid is reserved and cannot be taken over.
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const addon = await AddonManager.getAddonByID(id);
  if (addon) addon.applyBackgroundUpdates = AddonManager.AUTOUPDATE_DISABLE;
  quickLexScope = {};
  for (const file of ["core.js", "card.js", "user-dictionary.js", "runtime.js"]) {
    Services.scriptloader.loadSubScript(rootURI + file, quickLexScope, "UTF-8");
  }
  quickLexInstance = quickLexScope.QuickLexRuntime.create({ Zotero, Services, rootURI, id, version,
    getStorage: () => ({ io: IOUtils, paths: PathUtils, root: PathUtils.join(PathUtils.profileDir, "quicklex"), Decoder: TextDecoder }),
    pickDictionary: async win => {
      const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
      const picker = new FilePicker();
      picker.init(win, "导入俄汉 DSL 词典", picker.modeOpen);
      picker.appendFilter("DSL 词典文本", "*.dsl");
      if (await picker.show() !== picker.returnOK) return null;
      return picker.file;
    },
  });
  quickLexInstance.start();
}

function onMainWindowLoad({ window }) { quickLexInstance?.addWindow(window); }
function onMainWindowUnload({ window }) { quickLexInstance?.removeWindow(window); }

function shutdown() {
  quickLexInstance?.stop();
  quickLexInstance = undefined;
  quickLexScope = undefined;
}

function install() {}
function uninstall() {}
