import * as preferences from "./settings.js";
import * as originals from "./originals.js";
import * as folders from "./folders.js";
import * as comparison from "./comparison.js";
import * as menus from "./menus.js";
import * as scan from "./scan.js";

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


async function applyDuplicateAction(messageIds) {
  const ids = Array.isArray(messageIds) ? messageIds : [];

  if (ids.length === 0) {
    return { count: 0 };
  }

  const settings = await preferences.getSettings();

  if (settings.defaultAction === "move") {
    if (!settings.moveTargetFolder) {
      throw new Error("Move target folder is not configured");
    }

    await browser.messages.move(ids, settings.moveTargetFolder);
  } else {
    await browser.messages.delete(ids, {
      deletePermanently: settings.defaultAction === "permanent",
    });
  }

  return { count: ids.length };
}

async function notifyUser(message) {
  try {
    await browser.notifications.create({
      type: "basic",
      title: browser.i18n.getMessage("silentScanTitle"),
      message,
    });
  } catch (error) {
    console.warn("Notification failed:", error, message);
  }
}

// Single entry point for every scan trigger. Silent mode scans, applies the
// configured action, and reports via a notification; otherwise the review
// dialog window opens as before.
async function launchDuplicateScan(mailTabId) {
  const settings = await preferences.getSettings();

  if (!settings.silentMode) {
    await browser.storage.local.set({ scanMailTabId: mailTabId });

    await browser.windows.create({
      url: browser.runtime.getURL("dialog.html"),
      type: "popup",
      width: 900,
      height: 650,
    });

    return;
  }

  let selectedFolders = [];
  try {
    selectedFolders = await browser.mailTabs.getSelectedFolders(mailTabId);
  } catch (error) {
    console.warn("Failed to read selected folders:", error);
  }

  if (!Array.isArray(selectedFolders) || selectedFolders.length === 0) {
    await notifyUser(browser.i18n.getMessage("noFolderSelected"));
    return;
  }

  try {
    const originalsForThisScan = await originals.getOriginalsFolders();
    await originals.clearOriginalsFolders();

    const result = await scan.scanForDuplicates(selectedFolders, settings, {
      originalsForThisScan,
    });

    const ids = [];
    for (const row of result.rows || []) {
      for (const message of row.messages || []) {
        if (message.action === "delete") {
          ids.push(message.id);
        }
      }
    }

    if (ids.length === 0) {
      await notifyUser(browser.i18n.getMessage("silentNoDuplicates"));
      return;
    }

    await applyDuplicateAction(ids);

    const messageKey =
      settings.defaultAction === "move" ? "silentMovedCount" : "silentDeletedCount";
    await notifyUser(browser.i18n.getMessage(messageKey, [String(ids.length)]));
  } catch (error) {
    console.error("Silent scan failed:", error);
    await notifyUser(`${browser.i18n.getMessage("errorPrefix")} ${error?.message || error}`);
  }
}


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

  if (msg && msg.type === "commit-duplicate-actions") {
    return applyDuplicateAction(msg.messageIds);
  }

  if (msg && msg.type === "preview-message") {
    return browser.messageDisplay.open({
      messageId: msg.messageId,
      location: "tab",
    });
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

      await launchDuplicateScan(activeTab.id);
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

  await launchDuplicateScan(activeTab.id);
});

if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "run-duplicate-scan") return;

    try {
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      await launchDuplicateScan(activeTab.id);
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

    await launchDuplicateScan(activeTab.id);
  } catch (err) {
    console.error("Toolbar click scan failed:", err);
  }
});