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

async function runDuplicateScan(selectedFolders) {
  if (!Array.isArray(selectedFolders) || selectedFolders.length === 0) {
    return;
  }

  const settings = await preferences.getSettings();

  const originalsForThisScan = await originals.getOriginalsFolders();
  await originals.clearOriginalsFolders();

  // Track folders marked as "originals" for one-shot duplicate comparison
  const originalFolderKeys = new Set(
  originalsForThisScan.map((folder) => folder.path || folder.name)
  );

  let foldersToScan = [];
  for (const folder of selectedFolders) {
    const collected = await folders.collectFolders(folder, settings.searchSubfolders);
    foldersToScan.push(...collected);
  }

  for (const folder of originalsForThisScan) {
    const collected = await folders.collectFolders(folder, settings.searchSubfolders);
    foldersToScan.push(...collected);
  }

  foldersToScan = folders.dedupeFolders(foldersToScan);

  // Skip special folders such as 'trash' unless they are explicitly marked as originals
  foldersToScan = foldersToScan.filter((folder) => {
  const key = folder.path || folder.name;

  if (originalFolderKeys.has(key)) {
    return true;
  }

  return !folders.shouldSkipFolder(folder, settings);
  });

  if (foldersToScan.length === 0) {
    return;
  }

  currentScanFolderName =
    foldersToScan.length === 1
      ? foldersToScan[0].name
      : `${foldersToScan[0].name} + ${foldersToScan.length - 1} more`;

  const hasAnyCriteria =
    settings.compareSubject ||
    settings.compareAuthor ||
    settings.compareRecipients ||
    settings.compareCc ||
    settings.compareSendTime ||
    settings.compareMessageId ||
    settings.compareFolder ||
    settings.compareBody;

  scanInProgress = true;
  lastScanResults = null;
  lastScanError = null;

  await browser.windows.create({
    url: browser.runtime.getURL("dialog.html"),
    type: "popup",
    width: 900,
    height: 650,
  });

  try {
    console.log(
      "Scanning folders:",
      foldersToScan.map((folder) => folder.name)
    );

    let allMessages = [];

    for (const folder of foldersToScan) {
      const messages = await folders.getAllMessages(folder);

      let filtered = messages;

      if (settings.skipImapDeleted) {
        filtered = filtered.filter(
          (message) =>
            !(Array.isArray(message.flags) && message.flags.includes("deleted"))
        );
      }

      switch (settings.searchScope) {
        case "unread":
          filtered = filtered.filter((message) => !message.read);
          break;
        case "all":
        default:
          break;
      }

      allMessages.push(...filtered);

      console.log("Messages in folder", folder.name, filtered.length);
      console.log("Total messaages so far", allMessages.length);
    }

    

    if (!hasAnyCriteria) {
      lastScanResults = {
        folderName:
          foldersToScan.length === 1
            ? foldersToScan[0].name
            : `${foldersToScan.length} folders`,
        scannedCount: allMessages.length,
        duplicateGroupCount: 0,
        rows: [],
        noCriteriaSelected: true,
        originalsFolderNames: originalsForThisScan.map((f) => f.name),
      };
      return;
    }

    // Process messages with limited concurrency to avoid blocking the UI
    const comparisons = await comparison.mapWithConcurrency(
      allMessages,
      comparison.ENTRY_CONCURRENCY,
      async (message) => {
        try {
          const item = await comparison.getMessageComparisonData(message, settings);
          item.isOriginal = originalFolderKeys.has(message.folder?.path || message.folder?.name);
          return item;
        } catch (e) {
          console.warn("Failed to process message", message.id, e);
          return null;
        }
      }
    );

// Group messages by comparison key, the first run using selected fields

    const groups = new Map();

    for (const item of comparisons) {
      if (!item || !item.key) {
        continue;
      }

      if (!groups.has(item.key)) {
        groups.set(item.key, {
          subject: item.subject,
          author: item.author,
          folder: item.folder,
          date: item.date,
          dateValue: item.dateValue,
          count: 0,
          originalCount: 0,
          messageIds: [],
          messages: [],
        });
      }

      const group = groups.get(item.key);
      group.count += 1;
      group.messageIds.push(item.id);
      group.messages.push({
        id: item.id,
        subject: item.subject,
        author: item.author,
        folder: item.folder,
        date: item.date,
        dateValue: item.dateValue,
        messageId: item.messageId,
        size: item.size,
        flags: item.flags,
        isOriginal: item.isOriginal === true,
      });
      
      if (item.isOriginal) {
        group.originalCount += 1;
      }
    }

  // Convert grouped map to array and optionally refine using body comparison
    let groupedValues = [...groups.values()];

    if (settings.compareBody) {
      groupedValues = await comparison.filterGroupsByBody(groupedValues);
    }

    const hasOriginals = originalsForThisScan.length > 0;

// Build final rows for dialog display and apply keep/delete 
    const rows = groupedValues
    .filter((group) => {
      if (hasOriginals) {
        return group.originalCount > 0 && group.count > group.originalCount;
      }

    return group.count > 1;
    })

    .map((group) => {
      const messages = group.messages.map((message, index) => ({
        ...message,
        action: hasOriginals
        ? (message.isOriginal ? "keep" : "delete")
        : (index === 0 ? "keep" : "delete"),
      }));

      return {
        subject: group.subject,
        author: group.author,
        folder: group.folder,
        date: group.date,
        dateValue: group.dateValue,
        count: group.count,
        messageIds: group.messageIds,
        messages,
      };
    })

    .sort((a, b) => b.count - a.count);

    console.log("Duplicate rows", rows.length);

    lastScanResults = {
      folderName:
        foldersToScan.length === 1
          ? foldersToScan[0].name
          : `${foldersToScan.length} folders`,
      scannedCount: allMessages.length,
      duplicateGroupCount: rows.length,
      rows,
      noDuplicatesFound: rows.length === 0,
      originalsFolderNames: originalsForThisScan.map((f) => f.name),
    };
  } catch (err) {
    console.error("Scan failed:", err);
    lastScanError = String(err);
  } finally {
    scanInProgress = false;
    currentScanFolderName = null;
  }
}

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
      const selectedFolders = await browser.mailTabs.getSelectedFolders();
      await runDuplicateScan(selectedFolders);
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

  const selectedFolders = folders.getSelectedFolders(info);
  await runDuplicateScan(selectedFolders);

});

if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "run-duplicate-scan") return;

    try {
      const selectedFolders = await browser.mailTabs.getSelectedFolders();
      await runDuplicateScan(selectedFolders);
    } catch (err) {
      console.error("Command failed:", err);
    }
  });
} else {
  console.warn("commands API not available");
}

browser.browserAction.onClicked.addListener(async () => {
  try {
    const selectedFolders = await browser.mailTabs.getSelectedFolders();
    await runDuplicateScan(selectedFolders);
  } catch (err) {
    console.error("Toolbar click scan failed:", err);
  }
});