import { localizeDocument } from "./vendor/i18n.mjs";
import * as preferences from "./settings.js";
import * as originals from "./originals.js";
import * as folders from "./folders.js";
import * as comparison from "./comparison.js";

window.addEventListener("DOMContentLoaded", () => {
  localizeDocument();
});

let data = null;
let scanFolders = [];

// default sort: highest count first
let sort = { key: "count", dir: "desc" };

let renderToken = 0;

function setLoading(isLoading, text = browser.i18n.getMessage("loadingText")) {
  const loading = document.getElementById("loading");
  const loadingText = document.getElementById("loading-text");
  const resultsWrap = document.getElementById("results-wrap");

  if (loadingText) {
    loadingText.textContent = isLoading ? text : "";
  }

  if (loading) {
    loading.hidden = !isLoading;
  }

  if (resultsWrap) {
    resultsWrap.hidden = isLoading;
  }
}

function originalsWereUsed() {
  return Array.isArray(data?.originalsFolderNames) && data.originalsFolderNames.length > 0;
}

function updateDeleteSelectedButton() {
  const deleteSelectedBtn = document.getElementById("delete-selected");

  if (!deleteSelectedBtn) {
    return;
  }

  const hasMessagesToDelete = (data?.rows || []).some((row) =>
    (row.messages || []).some((message) => message.action === "delete")
  );

  deleteSelectedBtn.disabled = !hasMessagesToDelete;
}

function renderRowsChunked(tbody, rows, chunkSize = 1, token) {
  tbody.textContent = "";
  let i = 0;

  function appendChunk() {
    if (token !== renderToken) return;

    const end = Math.min(i + chunkSize, rows.length);
    const fragment = document.createDocumentFragment();

    for (; i < end; i++) {
      const r = rows[i];

      const groupRow = document.createElement("tr");
      groupRow.className = "group-row";

      const subjectCell = document.createElement("td");
      subjectCell.className = "subject";
      subjectCell.textContent = r.subject;
      groupRow.appendChild(subjectCell);

      const authorCell = document.createElement("td");
      authorCell.textContent = r.author;
      groupRow.appendChild(authorCell);

      const folderCell = document.createElement("td");
      folderCell.textContent = r.folder;
      groupRow.appendChild(folderCell);

      const dateCell = document.createElement("td");
      dateCell.textContent = r.date;
      groupRow.appendChild(dateCell);

      const countCell = document.createElement("td");
      countCell.className = "count";
      countCell.textContent = String(Number(r.count) || 0);
      groupRow.appendChild(countCell);

      fragment.appendChild(groupRow);

      for (const message of r.messages || []) {
        const messageRow = document.createElement("tr");
        messageRow.className = "message-row";
        messageRow.dataset.messageId = String(message.id);

        const messageCell = document.createElement("td");
        messageCell.colSpan = 5;

        const review = document.createElement("div");
        review.className = "message-review";

        const actions = document.createElement("div");
        actions.className = "message-actions";

        const keepLabel = document.createElement("label");
        const keepInput = document.createElement("input");
        keepInput.type = "radio";
        keepInput.name = `action-${message.id}`;
        keepInput.value = "keep";
        keepInput.checked = message.action === "keep";
        keepLabel.appendChild(keepInput);
        keepLabel.append(` ${browser.i18n.getMessage("keepAction")}`);

        const deleteLabel = document.createElement("label");
        const deleteInput = document.createElement("input");
        deleteInput.type = "radio";
        deleteInput.name = `action-${message.id}`;
        deleteInput.value = "delete";
        deleteInput.checked = message.action === "delete";
        deleteLabel.appendChild(deleteInput);
        deleteLabel.append(` ${browser.i18n.getMessage("deleteAction")}`);

        actions.appendChild(keepLabel);
        actions.appendChild(deleteLabel);

        const meta = document.createElement("div");
        meta.className = "message-meta";

        if (message.isOriginal) {
          const badge = document.createElement("span");
          badge.className = "original-badge";
          badge.textContent =
            browser.i18n.getMessage("originalMessageLabel") || "Original";
          meta.appendChild(badge);
          meta.append(" ");
        }

        const subject = document.createElement("strong");
        subject.textContent = message.subject;
        meta.appendChild(subject);
        meta.appendChild(document.createElement("br"));

        meta.append(message.author);
        meta.appendChild(document.createElement("br"));
        meta.append(`${message.folder} • ${message.date}`);

        review.appendChild(actions);
        review.appendChild(meta);
        messageCell.appendChild(review);
        messageRow.appendChild(messageCell);
        fragment.appendChild(messageRow);
      }
    }

    tbody.appendChild(fragment);

    if (i < rows.length) {
      setTimeout(() => requestAnimationFrame(appendChunk), 200);
    }
  }

  requestAnimationFrame(appendChunk);
}

function compareRows(a, b, key, dir) {
  let cmp = 0;

  if (key === "count") {
    cmp = (Number(a.count) || 0) - (Number(b.count) || 0);

  } else if (key === "subject") {
    cmp = String(a.subject || "").localeCompare(String(b.subject || ""), undefined, {
      sensitivity: "base",
    });

  } else if (key === "author") {
    cmp = String(a.author || "").localeCompare(String(b.author || ""), undefined, {
      sensitivity: "base",
    });

  } else if (key === "folder") {
    cmp = String(a.folder || "").localeCompare(String(b.folder || ""), undefined, {
      sensitivity: "base",

    });

  } else if (key === "date") {
    cmp = (Number(a.dateValue) || 0) - (Number(b.dateValue) || 0);
  }

  return dir === "asc" ? cmp : -cmp;
}

function toggleSort(key) {
  if (sort.key === key) {
    sort.dir = sort.dir === "asc" ? "desc" : "asc";
  } else {
    sort.key = key;
    sort.dir = key === "count" ? "desc" : "asc";
  }

  render();
}

function updateHeaderLabels() {
  const subjectBtn = document.getElementById("sort-subject");
  const authorBtn = document.getElementById("sort-author");
  const folderBtn = document.getElementById("sort-folder");
  const dateBtn = document.getElementById("sort-date");
  const countBtn = document.getElementById("sort-count");

  const labels = {
    subject: browser.i18n.getMessage("subjectColumn"),
    author: browser.i18n.getMessage("authorColumn"),
    folder: browser.i18n.getMessage("folderColumn"),
    date: browser.i18n.getMessage("dateColumn"),
    count: browser.i18n.getMessage("countColumn"),
  };

  function withArrow(label, key) {
    return label + (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  }

  if (subjectBtn) subjectBtn.textContent = withArrow(labels.subject, "subject");
  if (authorBtn) authorBtn.textContent = withArrow(labels.author, "author");
  if (folderBtn) folderBtn.textContent = withArrow(labels.folder, "folder");
  if (dateBtn) dateBtn.textContent = withArrow(labels.date, "date");
  if (countBtn) countBtn.textContent = withArrow(labels.count, "count");
}

async function render() {
  const meta = document.getElementById("meta");
  const tbody = document.getElementById("rows");

  if (!meta || !tbody) return;

  if (!data) {
    meta.textContent = "";
    tbody.textContent = "";
    setLoading(true, browser.i18n.getMessage("loadingText"));
    return;
  }

  meta.textContent = browser.i18n.getMessage("scanSummary", [
    data.folderName,
    String(data.scannedCount),
    String(data.duplicateGroupCount),
  ]);

  setLoading(false);

  const rows = [...(data.rows || [])].sort((a, b) =>
    compareRows(a, b, sort.key, sort.dir)
  );

  updateHeaderLabels();

  const settings = await browser.runtime.sendMessage({ type: "get-current-settings" });

  [
    ["th-subject", "sort-subject", settings.compareSubject],
    ["th-author", "sort-author", settings.compareAuthor],
    ["th-folder", "sort-folder", settings.compareFolder],
    ["th-date", "sort-date", settings.compareSendTime],
  ].forEach(([thId, btnId, active]) => {
    const th = document.getElementById(thId);
    const btn = document.getElementById(btnId);

    if (th) th.classList.toggle("active-criterion", active);
    if (btn) btn.classList.toggle("active-criterion", active);
  });

  const scanSummary = document.getElementById("scan-summary");
  if (scanSummary) {
    const enabled = [];

    if (settings.compareSubject) enabled.push(browser.i18n.getMessage("subjectColumn"));
    if (settings.compareAuthor) enabled.push(browser.i18n.getMessage("authorColumn"));
    if (settings.compareFolder) enabled.push(browser.i18n.getMessage("folderColumn"));
    if (settings.compareSendTime) enabled.push(browser.i18n.getMessage("dateColumn"));

    const scope =
      settings.searchScope === "unread"
        ? browser.i18n.getMessage("searchScopeUnread")
        : browser.i18n.getMessage("searchScopeAll");

    let summaryText =
      `${browser.i18n.getMessage("scanSummaryLabel")} ${enabled.join(", ")} • ${scope}`;

    if (Array.isArray(data.originalsFolderNames) && data.originalsFolderNames.length > 0) {
      summaryText += ` • ${browser.i18n.getMessage(
        "originalsFoldersUsed",
        data.originalsFolderNames.join(", ")
      )}`;
    }

    scanSummary.textContent = summaryText;
  }

  if (data.noCriteriaSelected) {
    const deleteSelectedBtn = document.getElementById("delete-selected");

    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = true;
    }

    tbody.textContent = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 5;
    cell.style.textAlign = "center";
    cell.style.padding = "16px";
    cell.textContent = browser.i18n.getMessage("noCriteriaSelected");

    row.appendChild(cell);
    tbody.appendChild(row);

    return;
  }

  if (rows.length === 0) {
    const deleteSelectedBtn = document.getElementById("delete-selected");

    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = true;
    }

    tbody.textContent = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 5;
    cell.style.textAlign = "center";
    cell.style.padding = "16px";
    cell.textContent = browser.i18n.getMessage("noResults");

    row.appendChild(cell);
    tbody.appendChild(row);

    return;
  }

  renderToken++;
  const token = renderToken;
  renderRowsChunked(tbody, rows, 1, token);
}

function buildRowsFromGroups(groupedValues, hasOriginals) {
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

const hasAnyCriteria =
  settings.compareSubject ||
  settings.compareAuthor ||
  settings.compareRecipients ||
  settings.compareCc ||
  settings.compareSendTime ||
  settings.compareMessageId ||
  settings.compareFolder ||
  settings.compareBody;

data = null;

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
    data = {
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
  const groups = new Map();

  for (const message of allMessages) {
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

    if (groups.size > 0 && group.count > 1 && allMessages.indexOf(message) % 25 === 0) {
      const groupedValues = [...groups.values()];
      const hasOriginals = originalsForThisScan.length > 0;
      const rows = buildRowsFromGroups(groupedValues, hasOriginals);

      data = {
        folderName:
          foldersToScan.length === 1
            ? foldersToScan[0].name
            : `${foldersToScan.length} folders`,
        scannedCount: allMessages.length,
        duplicateGroupCount: rows.length,
        rows,
        partial: true,
        originalsFolderNames: originalsForThisScan.map((f) => f.name),
      };

      await render();
    }
  }

  // Convert grouped map to array and optionally refine using body comparison
  let groupedValues = [...groups.values()];

  if (settings.compareBody) {
    groupedValues = await comparison.filterGroupsByBody(groupedValues);
  }

  const hasOriginals = originalsForThisScan.length > 0;

  // Build final rows for dialog display and apply keep/delete 
  const rows = buildRowsFromGroups(groupedValues, hasOriginals);

  console.log("Duplicate rows", rows.length);

  data = {
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
  throw err;
}
}

async function init() {
  const subjectBtn = document.getElementById("sort-subject");
  const countBtn = document.getElementById("sort-count");
  const authorBtn = document.getElementById("sort-author");
  const folderBtn = document.getElementById("sort-folder");
  const dateBtn = document.getElementById("sort-date");
  const keepFirstBtn = document.getElementById("keep-first");
  const keepLastBtn = document.getElementById("keep-last");
  const markAllDeleteBtn = document.getElementById("delete-duplicates");
  const resetChoicesBtn = document.getElementById("reset-choices");

  if (subjectBtn) subjectBtn.addEventListener("click", () => toggleSort("subject"));
  if (countBtn) countBtn.addEventListener("click", () => toggleSort("count"));
  if (authorBtn) authorBtn.addEventListener("click", () => toggleSort("author"));
  if (folderBtn) folderBtn.addEventListener("click", () => toggleSort("folder"));
  if (dateBtn) dateBtn.addEventListener("click", () => toggleSort("date"));
  if (keepFirstBtn) {
    keepFirstBtn.addEventListener("click", async () => {
      if (originalsWereUsed()) return;

      for (const row of data?.rows || []) {
        for (const [index, message] of (row.messages || []).entries()) {
          message.action = index === 0 ? "keep" : "delete";
        }
      }

      await render();
      updateDeleteSelectedButton();
    });
  }

  if (keepLastBtn) {
    keepLastBtn.addEventListener("click", async () => {
      if (originalsWereUsed()) return;

      for (const row of data?.rows || []) {
        const messages = row.messages || [];
        const lastIndex = messages.length - 1;

        for (const [index, message] of messages.entries()) {
          message.action = index === lastIndex ? "keep" : "delete";
        }
      }

      await render();
      updateDeleteSelectedButton();
    });
  }

  if (markAllDeleteBtn) {
    markAllDeleteBtn.addEventListener("click", async () => {
      if (originalsWereUsed()) return;

      for (const row of data?.rows || []) {
        for (const message of row.messages || []) {
          message.action = "delete";
        }
      }

      await render();
      updateDeleteSelectedButton();
    });
  }

  if (resetChoicesBtn) {
    resetChoicesBtn.addEventListener("click", async () => {
      if (originalsWereUsed()) return;

      for (const row of data?.rows || []) {
        for (const [index, message] of (row.messages || []).entries()) {
          message.action = index === 0 ? "keep" : "delete";
        }
      }

      await render();
      updateDeleteSelectedButton();
    });
  }

  const tbody = document.getElementById("rows");

  if (tbody) {
    tbody.addEventListener("change", (event) => {
      const input = event.target;

      if (!(input instanceof HTMLInputElement)) return;
      if (input.type !== "radio") return;

      const messageRow = input.closest(".message-row");
      const messageId = messageRow?.dataset.messageId;

      if (!messageId) return;

      for (const row of data?.rows || []) {
        const message = (row.messages || []).find(
          (m) => String(m.id) === String(messageId)
        );

        if (message) {
          message.action = input.value;
          break;
        }
      }

      updateDeleteSelectedButton();
    });
  }

  await render();

  const closeBtn = document.getElementById("close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.close();
    });
  }

  const deleteSelectedBtn = document.getElementById("delete-selected");

  if (deleteSelectedBtn) {
    deleteSelectedBtn.disabled = true;

    deleteSelectedBtn.addEventListener("click", async () => {
      const messageIdsToDelete = [];

      for (const row of data?.rows || []) {
        for (const message of row.messages || []) {
          if (message.action === "delete") {
            messageIdsToDelete.push(message.id);
          }
        }
      }

      if (messageIdsToDelete.length === 0) {
        return;
      }

      const confirmed = confirm(
        browser.i18n.getMessage("deleteSelectedConfirm", [
          String(messageIdsToDelete.length),
        ])
      );

      if (!confirmed) {
        return;
      }

      await browser.runtime.sendMessage({
        type: "delete-selected-messages",
        messageIds: messageIdsToDelete,
      });

      for (const row of data?.rows || []) {
        row.messages = (row.messages || []).filter(
          (message) => !messageIdsToDelete.includes(message.id)
        );
      }

      data.rows = (data.rows || []).filter((row) => (row.messages || []).length > 1);
      data.duplicateGroupCount = data.rows.length;

      await render();
    });
  }

  const { scanMailTabId } = await browser.storage.local.get({
    scanMailTabId: null,
  });

  scanFolders = await browser.mailTabs.getSelectedFolders(scanMailTabId);

  await browser.storage.local.remove("scanMailTabId");

  await runDuplicateScan(scanFolders);
  await render();
  updateDeleteSelectedButton();

  if (originalsWereUsed()) {
    for (const id of ["keep-first", "keep-last", "delete-duplicates", "reset-choices"]) {
      const button = document.getElementById(id);
      if (button) {
        button.disabled = true;
      }
    }
  }

  updateDeleteSelectedButton();
}

init().catch((err) => {
  console.error(err);
  setLoading(false);
  const meta = document.getElementById("meta");
  if (meta) {
    meta.textContent = `${browser.i18n.getMessage("errorPrefix")} ${err?.message || err}`;
  }
});