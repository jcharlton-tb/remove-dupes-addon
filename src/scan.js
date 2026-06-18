import * as folders from "./folders.js";
import * as comparison from "./comparison.js";

export function buildRowsFromGroups(groupedValues, hasOriginals, settings) {
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

      // When originals are used, keep each original next to the duplicate(s) it corresponds to and lead each pair with the original
      if (hasOriginals) {
        const pairKey = (message) =>
          String(message.messageId || "").trim().toLowerCase() ||
          `${message.subject}|${message.dateValue}|${message.author}`;

        messages.sort((a, b) => {
          const keyA = pairKey(a);
          const keyB = pairKey(b);

          if (keyA !== keyB) {
            return keyA < keyB ? -1 : 1;
          }

          return (b.isOriginal === true) - (a.isOriginal === true);
        });
      }

      // The header summarises the whole group and uncompared columns and send times that differ are left blank
      const shared = (pick) => {
        const first = pick(messages[0]);
        return messages.every((message) => pick(message) === first);
      };

      const subjectDisplay =
        settings.compareSubject && shared((m) => m.subject) ? group.subject : "";
      const authorDisplay =
        settings.compareAuthor && shared((m) => m.author) ? group.author : "";
      
        // Folder is the exception to the "only show match criteria" rule 
      const folderDisplay = [
        ...new Set(messages.map((message) => message.folder).filter(Boolean)),
      ].join(", ");
      const dateDisplay =
        settings.compareSendTime && shared((m) => m.date) ? group.date : "";

      return {
        subject: group.subject,
        author: group.author,
        folder: group.folder,
        date: group.date,
        dateValue: group.dateValue,
        count: group.count,
        subjectDisplay,
        authorDisplay,
        folderDisplay,
        dateDisplay,
        messageIds: group.messageIds,
        messages,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function folderLabel(foldersToScan) {
  // List the folders being scanned by name rather than a bare count.
  return foldersToScan.map((folder) => folder.name).join(", ");
}

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

    if (!item) {
      continue;
    }

    let groupKey = item.key;
    if (!groupKey) {
      if (!settings.compareBody) {
        continue;
      }
      groupKey = "__body_only__";
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
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

    const group = groups.get(groupKey);
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

    // Don't stream partial results when Body is on
    if (onProgress && !settings.compareBody && group.count > 1 && messageIndex % 25 === 0) {
      const rows = buildRowsFromGroups([...groups.values()], hasOriginals, settings);
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

  const rows = buildRowsFromGroups(groupedValues, hasOriginals, settings);

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
