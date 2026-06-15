export async function getAllMessages(folder) {
  let results = await browser.messages.list(folder);
  const allMessages = [...results.messages];

  while (results.id) {
    results = await browser.messages.continueList(results.id);
    allMessages.push(...results.messages);
  }

  return allMessages;
}

export async function collectFolders(rootFolder, includeSubfolders) {
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

export async function listAllFolders() {
  const accounts = await browser.accounts.list();
  const entries = [];

  function walk(accountId, accountName, folderList, depth) {
    for (const folder of folderList || []) {
      if (folder.path && folder.path !== "/") {
        entries.push({
          accountId,
          path: folder.path,
          name: folder.name,
          label: `${accountName}: ${"  ".repeat(depth)}${folder.name}`,
          depth,
        });
      }

      if (Array.isArray(folder.subFolders) && folder.subFolders.length > 0) {
        walk(accountId, accountName, folder.subFolders, depth + 1);
      }
    }
  }

  for (const account of accounts) {
    walk(account.id, account.name, account.folders || account.rootFolder?.subFolders, 0);
  }

  return entries;
}

export function getSelectedFolders(info) {
  if (Array.isArray(info.selectedFolders) && info.selectedFolders.length > 0) {
    return info.selectedFolders;
  }

  if (info.selectedFolder) {
    return [info.selectedFolder];
  }

  return [];
}

export function dedupeFolders(folders) {
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

export function shouldSkipFolder(folder, settings) {
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