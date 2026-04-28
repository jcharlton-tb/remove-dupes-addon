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
const TOOLBAR_COMPARISON_ITEMS = [
  { id: "toggle-compare-subject", titleKey: "compareSubjectMenu", key: "compareSubject" },
  { id: "toggle-compare-author", titleKey: "compareAuthorMenu", key: "compareAuthor" },
  { id: "toggle-compare-recipients", titleKey: "compareRecipientsMenu", key: "compareRecipients" },
  { id: "toggle-compare-cc", titleKey: "compareCcMenu", key: "compareCc" },
  { id: "toggle-compare-send-time", titleKey: "compareSendTimeMenu", key: "compareSendTime" },
  { id: "toggle-compare-message-id", titleKey: "compareMessageIdMenu", key: "compareMessageId" },
  { id: "toggle-compare-folder", titleKey: "compareFolderMenu", key: "compareFolder" },
  { id: "toggle-compare-body", titleKey: "compareBodyMenu", key: "compareBody" },
];

function getToolbarComparisonItem(menuItemId) {
  return TOOLBAR_COMPARISON_ITEMS.find((item) => item.id === menuItemId) || null;
}

async function createToolbarMenus() {
  const settings = await window.getSettings();

  browser.menus.create({
    id: "open-options",
    title: browser.i18n.getMessage("toolbarOptions"),
    contexts: ["browser_action"],
  });

  browser.menus.create({
    id: "toolbar-separator",
    type: "separator",
    contexts: ["browser_action"],
  });

  for (const item of TOOLBAR_COMPARISON_ITEMS) {
    browser.menus.create({
      id: item.id,
      title: browser.i18n.getMessage(item.titleKey),
      type: "checkbox",
      checked: settings[item.key],
      contexts: ["browser_action"],
    });
  }
}

createToolbarMenus().catch((error) => {
  console.error("Failed to create toolbar menus:", error);
});

browser.menus.onShown.addListener(async (info) => {
  if (!info.contexts || !info.contexts.includes("folder_pane")) return;

  const folder =
    (info.selectedFolders && info.selectedFolders[0]) || info.selectedFolder;

  const shouldDisable = !folder || folder.isRoot === true;

  await browser.menus.update("log-duplicates", {
    enabled: !shouldDisable,
    visible: true,
  });

  await browser.menus.update("set-originals-folder", {
    enabled: !shouldDisable,
    visible: true,
  });

browser.menus.refresh();
});


async function getAllMessages(folder) {
  let results = await browser.messages.list(folder);
  const allMessages = [...results.messages];

  while (results.id) {
    results = await browser.messages.continueList(results.id);
    allMessages.push(...results.messages);
  }

  return allMessages;
}

function setOriginalsFolders(folders) {
  originalsFolders = Array.isArray(folders) ? folders : [];
}

function getSelectedFolders(info) {
  if (Array.isArray(info.selectedFolders) && info.selectedFolders.length > 0) {
    return info.selectedFolders;
  }

  if (info.selectedFolder) {
    return [info.selectedFolder];
  }

  return [];
}

async function collectFolders(rootFolder, includeSubfolders) {
  const folders = [rootFolder];

  if (!includeSubfolders || !Array.isArray(rootFolder.subFolders)) {
    return folders;
  }

  for (const subFolder of rootFolder.subFolders) {
    const nested = await collectFolders(subFolder, true);
    folders.push(...nested);
  }

  return folders;
}

function dedupeFolders(folders) {
  const seen = new Set();
  const unique = [];

  for (const folder of folders) {
    const key = folder.path || folder.name;

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(folder);
  }

  return unique;
}

function shouldSkipFolder(folder, settings) {
  if (!folder) {
    return true;
  }

  if (folder.isRoot === true) {
    return true;
  }

  if (folder.type === "newsgroup" || folder.isServer) {
    return true;
  }

  if (folder.type === "virtual") {
    return true;
  }

  if (settings.skipSpecialFolders) {
    const specialTypes = new Set([
      "trash",
      "sent",
      "drafts",
      "templates",
      "archives",
      "junk",
      "outbox",
    ]);

    if (folder.type !== "inbox" && specialTypes.has(folder.type)) {
      return true;
    }
  }

  console.log("Folder type:", folder.name, folder.type);

  return false;
}


// Async per entry processing
const ENTRY_CONCURRENCY = 8;

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function normalizeSubject(subject) {
  return String(subject || "(no subject)")
    .trim()
    .replace(/^(re|fw|fwd):\s*/i, "") 
    .toLowerCase();
}

function normalizeAddressList(addresses, stripAndSort) {
  const list = Array.isArray(addresses) ? addresses : [];

  const normalized = list
    .map((entry) => {
      if (!entry) {
        return "";
      }

      const text = String(entry).trim().toLowerCase();

      if (!stripAndSort) {
        return text;
      }

      const match = text.match(/<([^>]+)>/);
      return match ? match[1].trim() : text;
    })
    .filter(Boolean);

  if (stripAndSort) {
    normalized.sort();
  }

  return normalized.join(",");
}

function buildSendTimeKey(dateValue, resolution) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(Math.floor(date.getTime() / 1000));

  switch (resolution) {
    case "year":
      return year;
    case "month":
      return `${year}-${month}`;
    case "day":
      return `${year}-${month}-${day}`;
    case "hour":
      return `${year}-${month}-${day} ${hour}`;
    case "minute":
      return `${year}-${month}-${day} ${hour}:${minute}`;
    case "second":
    default:
      return second;
  }
}

function extractBodyText(part) {
  if (!part) {
    return "";
  }

  if (Array.isArray(part.parts) && part.parts.length > 0) {
    return part.parts.map(extractBodyText).join(" ");
  }

  return part.body || "";
}

function normalizeBody(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function getComparisonData(message, settings) {
  const hdr = await browser.messages.get(message.id);
  const parts = [];
  let fullMessage = null;

  if (settings.compareSubject) {
    parts.push(`subject:${normalizeSubject(hdr.subject)}`);
  }

  if (settings.compareAuthor) {
    parts.push(`author:${String(hdr.author || "").trim().toLowerCase()}`);
  }

  if (settings.compareRecipients) {
    parts.push(
      `recipients:${normalizeAddressList(
        hdr.recipients,
        settings.stripAndSortAddresses
      )}`
    );
  }

  if (settings.compareCc) {
    parts.push(
      `cc:${normalizeAddressList(
        hdr.ccList,
        settings.stripAndSortAddresses
      )}`
    );
  }

  if (settings.compareSendTime) {
    parts.push(`date:${buildSendTimeKey(hdr.date, settings.sendTimeResolution)}`);
  }

  if (settings.compareMessageId) {
    parts.push(
      `messageId:${String(hdr.headerMessageId || hdr.messageId || "")
        .trim()
        .toLowerCase()}`
    );
  }

  if (settings.compareFolder) {
    parts.push(
      `folder:${String(message.folder?.path || message.folder?.name || "")
        .trim()
        .toLowerCase()}`
    );
  }

  if (settings.compareBody) {
    fullMessage = await browser.messages.getFull(message.id);
    parts.push(`body:${normalizeBody(extractBodyText(fullMessage))}`);
  }

  return {
  id: message.id,
  subject: String(hdr.subject || "(no subject)"),
  author: String(hdr.author || ""),
  folder: String(message.folder?.name || message.folder?.path || ""),
  date: hdr.date ? new Date(hdr.date).toLocaleString() : "",
  dateValue: hdr.date ? new Date(hdr.date).getTime() : 0,
  key: parts.join("|"),
};
}

// Cache for dialog window
let lastScanResults = null;
let scanInProgress = false;
let lastScanError = null;
let currentScanFolderName = null;
let originalsFolders = [];


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
    return window.getSettings();
  }

  return false;
});

browser.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  for (const item of TOOLBAR_COMPARISON_ITEMS) {
    if (!changes[item.key]) {
      continue;
    }

    try {
      await browser.menus.update(item.id, {
        checked: changes[item.key].newValue,
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

  const settings = await window.getSettings();

  const originalsForThisScan = originalsFolders;
  originalsFolders = [];

  const originalFolderKeys = new Set(
  originalsForThisScan.map((folder) => folder.path || folder.name)
  );

  let foldersToScan = [];
  for (const folder of selectedFolders) {
    const collected = await collectFolders(folder, settings.searchSubfolders);
    foldersToScan.push(...collected);
  }

  for (const folder of originalsForThisScan) {
    const collected = await collectFolders(folder, settings.searchSubfolders);
    foldersToScan.push(...collected);
  }

  foldersToScan = dedupeFolders(foldersToScan);
  foldersToScan = foldersToScan.filter((folder) => !shouldSkipFolder(folder, settings));

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
      const messages = await getAllMessages(folder);

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
      };
      return;
    }

    const comparisons = await mapWithConcurrency(
      allMessages,
      ENTRY_CONCURRENCY,
      async (message) => {
        try {
          const item = await getComparisonData(message, settings);
          item.isOriginal = originalFolderKeys.has(message.folder?.path || message.folder?.name);
          return item;
        } catch (e) {
          console.warn("Failed to process message", message.id, e);
          return null;
        }
      }
    );

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
        });
      }

      const group = groups.get(item.key);
      group.count += 1;
      group.messageIds.push(item.id);
      if (item.isOriginal) {
        group.originalCount += 1;
      }
    }

    const hasOriginals = originalsForThisScan.length > 0;

    const rows = [...groups.values()]
    .filter((group) => {
      if (hasOriginals) {
        return group.originalCount > 0 && group.count > group.originalCount;
      }

    return group.count > 1;
    })

    .map((group) => ({
      subject: group.subject,
      author: group.author,
      folder: group.folder,
      date: group.date,
      dateValue: group.dateValue,
      count: group.count,
      messageIds: group.messageIds,
      }))
    .sort((a, b) => b.count - a.count);

    lastScanResults = {
      folderName:
        foldersToScan.length === 1
          ? foldersToScan[0].name
          : `${foldersToScan.length} folders`,
      scannedCount: allMessages.length,
      duplicateGroupCount: rows.length,
      rows,
      noDuplicatesFound: rows.length === 0,
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

  const toolbarItem = getToolbarComparisonItem(info.menuItemId);
  if (toolbarItem) {
    await window.saveSettings({
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
    const selectedFolders = getSelectedFolders(info);
    setOriginalsFolders(selectedFolders);
    console.log("Originals folders set:", selectedFolders.map((folder) => folder.name));
    return;
  }

  if (info.menuItemId === "tools-set-originals-folder") {
    try {
      const selectedFolders = await browser.mailTabs.getSelectedFolders();
      setOriginalsFolders(selectedFolders);
      console.log("Originals folders set:", selectedFolders.map((folder) => folder.name));
    } catch (err) {
      console.error("Failed to set originals folders from Tools menu:", err);
    }
    return;
  }

  if (info.menuItemId !== "log-duplicates") return;

  const selectedFolders = getSelectedFolders(info);
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