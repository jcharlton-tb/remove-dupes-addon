import * as preferences from "./settings.js";
import * as originals from "./originals.js";
import * as folders from "./folders.js";
import * as comparison from "./comparison.js";
import * as menus from "./menus.js";

// background.js
console.log("RemoveDupes background loaded");

// Menu items
browser.menus.create({
  id: "log-duplicates",
  title: browser.i18n.getMessage("removeDuplicatesMenu"),
  contexts: ["folder_pane"],
});

browser.menus.create({
  id: "tools-remove-duplicates",
  title: browser.i18n.getMessage("removeDuplicatesMenu"),
  contexts: ["tools_menu"],
});

browser.menus.create({
  id: "tools-set-originals-folder",
  title: browser.i18n.getMessage("originalsFolderMenu"),
  contexts: ["tools_menu"],
});

browser.menus.create({
  id: "set-originals-folder",
  title: browser.i18n.getMessage("originalsFolderMenu"),
  contexts: ["folder_pane"],
});

// settings menu
const settings = await preferences.getSettings();

menus.createToolbarMenus(settings).catch((error) => {
  console.error("Failed to create toolbar menus:");
});

browser.menus.onShown.addListener(async (info) => {
  if (!info.contexts || !info.contexts.includes("folder_pane")) return;

  const folder =
    (info.selectedFolders && info.selectedFolders[0]) || info.selectedFolder;

  const shouldDisable = !folder || folder.isRoot === true;

  const folderKey = folder?.path || folder?.name;
  const originalsFolders = await originals.getOriginalsFolders();
  const isOriginalsFolder = originalsFolders.some(
    (originalFolder) => (originalFolder.path || originalFolder.name) === folderKey
  );

  const originalsTitle = isOriginalsFolder
  ? `✓ ${browser.i18n.getMessage("originalsFolderMenu")}`
  : browser.i18n.getMessage("originalsFolderMenu");

  await browser.menus.update("log-duplicates", {
    enabled: !shouldDisable,
    visible: true,
  });

  await browser.menus.update("set-originals-folder", {
    enabled: !shouldDisable,
    visible: true,
    title: originalsTitle,
  });

browser.menus.refresh();
});

// Cache for dialog window
let lastScanResults = null;
let scanInProgress = false;
let lastScanError = null;
let currentScanFolderName = null;


browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "get-last-scan-results") {
    return Promise.resolve(lastScanResults);
  }

  if (msg && msg.type === "get-scan-status") {
    return Promise.resolve({
      inProgress: scanInProgress,
      hasResults: !!lastScanResults,
      error: lastScanError,
      folderName: currentScanFolderName,
    });
  }

  if (msg && msg.type === "get-current-settings") {
    return preferences.getSettings();
  }

  if (msg && msg.type === "delete-selected-messages") {
    const ids = Array.isArray(msg.messageIds) ? msg.messageIds : [];

    if (ids.length === 0) {
      return Promise.resolve();
    }

    return browser.messages.delete(ids);
  }

  return false;
});

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local" || !changes.preferences) {
    return;
  }

  const oldPrefs = changes.preferences.oldValue || {};
  const newPrefs = changes.preferences.newValue || {};

  for (const item of menus.TOOLBAR_COMPARISON_ITEMS) {
    if (oldPrefs[item.key] === newPrefs[item.key]) {
      continue;
    }

    try {
      await browser.menus.update(item.id, {
        checked: newPrefs[item.key],
      });
    } catch (error) {
      console.warn("Failed to update toolbar menu item:", item.id, error);
    }
  }

  browser.menus.refresh();
});



// Menu option 
browser.menus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "open-options") {
    await browser.runtime.openOptionsPage();
    return;
    }

  const toolbarItem = menus.getToolbarComparisonItem(info.menuItemId);
  if (toolbarItem) {
    await preferences.saveSettings({
      [toolbarItem.key]: info.checked,
    });
    return;
  }

    if (info.menuItemId === "tools-remove-duplicates") {
    try {
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      await browser.storage.local.set({
        scanMailTabId: activeTab.id,
      });

      await browser.windows.create({
        url: browser.runtime.getURL("dialog.html"),
        type: "popup",
        width: 900,
        height: 650,
      })
    } catch (err) {
      console.error("Tools menu scan failed:", err);
    }
    return;
  }

    if (info.menuItemId === "set-originals-folder") {
    const selectedFolders = folders.getSelectedFolders(info);
    await originals.setOriginalsFolders(selectedFolders);
    console.log("Originals folders set:", selectedFolders.map((folder) => folder.name));
    return;
  }

  if (info.menuItemId === "tools-set-originals-folder") {
    try {
      const selectedFolders = await browser.mailTabs.getSelectedFolders();
      await originals.setOriginalsFolders(selectedFolders);
      console.log("Originals folders set:", selectedFolders.map((folder) => folder.name));
    } catch (err) {
      console.error("Failed to set originals folders from Tools menu:", err);
    }
    return;
  }

  if (info.menuItemId !== "log-duplicates") return;

  const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      await browser.storage.local.set({
        scanMailTabId: activeTab.id,
      });

  await browser.windows.create({
        url: browser.runtime.getURL("dialog.html"),
        type: "popup",
        width: 900,
        height: 650,
      })

});

if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "run-duplicate-scan") return;

    try {

      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      await browser.storage.local.set({
        scanMailTabId: activeTab.id,
      });
      
      await browser.windows.create({
        url: browser.runtime.getURL("dialog.html"),
        type: "popup",
        width: 900,
        height: 650,
      })
    } catch (err) {
      console.error("Command failed:", err);
    }
  });
} else {
  console.warn("commands API not available");
}

browser.browserAction.onClicked.addListener(async () => {
  try {

    const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      await browser.storage.local.set({
        scanMailTabId: activeTab.id,
      });

    await browser.windows.create({
        url: browser.runtime.getURL("dialog.html"),
        type: "popup",
        width: 900,
        height: 650,
      })
  } catch (err) {
    console.error("Toolbar click scan failed:", err);
  }
});