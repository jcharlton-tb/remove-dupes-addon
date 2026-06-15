import * as folders from "./folders.js";
import * as comparison from "./comparison.js";

export function buildRowsFromGroups(groupedValues, hasOriginals) {
  return groupedValues
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
}

function folderLabel(foldersToScan) {
  return foldersToScan.length === 1
    ? foldersToScan[0].name
    : `${foldersToScan.length} folders`;
}

// Expand the user selection (plus any originals folders) into the concrete set
// of folders to scan, applying the subfolder and special-folder rules.
export async function collectScanFolders(selectedFolders, originalsForThisScan, settings) {
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

  return { foldersToScan, originalFolderKeys };
}

// Scan the selected folders and return duplicate groups as display-ready rows.
// Pass options.onProgress to receive partial results during the scan (used by
// the dialog for progressive rendering); silent mode omits it.
export async function scanForDuplicates(selectedFolders, settings, options = {}) {
  const { originalsForThisScan = [], onProgress = null } = options;

  const { foldersToScan, originalFolderKeys } = await collectScanFolders(
    selectedFolders,
    originalsForThisScan,
    settings
  );

  const hasOriginals = originalsForThisScan.length > 0;
  const originalsFolderNames = originalsForThisScan.map((folder) => folder.name);

  if (foldersToScan.length === 0) {
    return {
      folderName: "",
      scannedCount: 0,
      duplicateGroupCount: 0,
      rows: [],
      noFoldersToScan: true,
      originalsFolderNames,
    };
  }

  const hasAnyCriteria =
    settings.compareSubject ||
    settings.compareAuthor ||
    settings.compareRecipients ||
    settings.compareCc ||
    settings.compareSendTime ||
    settings.compareMessageId ||
    settings.compareFolder ||
    settings.compareBody;

  console.log(
    "Scanning folders:",
    foldersToScan.map((folder) => folder.name)
  );

  let allMessages = [];

  for (const folder of foldersToScan) {
    const messages = await folders.getAllMessages(folder);

    // Stamp the known scan folder onto each message. The folder object on a
    // header from messages.list() may lack the full path, which the originals
    // match (originalFolderKeys, built from folder.path) relies on.
    for (const message of messages) {
      message.folder = folder;
    }

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

  const folderName = folderLabel(foldersToScan);

  if (!hasAnyCriteria) {
    return {
      folderName,
      scannedCount: allMessages.length,
      duplicateGroupCount: 0,
      rows: [],
      noCriteriaSelected: true,
      originalsFolderNames,
    };
  }

  const groups = new Map();

  let messageIndex = -1;
  for (const message of allMessages) {
    messageIndex += 1;
    let item = null;

    try {
      item = await comparison.getMessageComparisonData(message, settings);
      item.isOriginal = originalFolderKeys.has(message.folder?.path || message.folder?.name);
    } catch (e) {
      console.warn("Failed to process message", message.id, e);
      continue;
    }

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

    if (onProgress && group.count > 1 && messageIndex % 25 === 0) {
      const rows = buildRowsFromGroups([...groups.values()], hasOriginals);
      await onProgress({
        folderName,
        scannedCount: allMessages.length,
        duplicateGroupCount: rows.length,
        rows,
        partial: true,
        originalsFolderNames,
      });
    }
  }

  let groupedValues = [...groups.values()];

  if (settings.compareBody) {
    groupedValues = await comparison.filterGroupsByBody(groupedValues);
  }

  const rows = buildRowsFromGroups(groupedValues, hasOriginals);

  console.log("Duplicate rows", rows.length);

  return {
    folderName,
    scannedCount: allMessages.length,
    duplicateGroupCount: rows.length,
    rows,
    noDuplicatesFound: rows.length === 0,
    originalsFolderNames,
  };
}
