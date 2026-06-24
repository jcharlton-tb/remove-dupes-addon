import { localizeDocument } from "./vendor/i18n.mjs";
import * as preferences from "./settings.js";
import * as originals from "./originals.js";
import * as scan from "./scan.js";
import * as folders from "./folders.js";

window.addEventListener("DOMContentLoaded", () => {
  localizeDocument();
});

let data = null;
let scanFolders = [];
let selectedAction = "trash";
let selectedMoveTarget = null;

// default sort: by subject so each original sits next to its duplicates
let sort = { key: "subject", dir: "asc" };

let renderToken = 0;

function setLoading(isLoading, text = browser.i18n.getMessage("loadingText")) {
  const loading = document.getElementById("loading");
  const loadingText = document.getElementById("loading-text");
  const resultsWrap = document.getElementById("results-wrap");
  const reviewToolbar = document.getElementById("review-toolbar");

  if (loadingText) {
    loadingText.textContent = isLoading ? text : "";
  }

  if (loading) {
    loading.hidden = !isLoading;
  }

  if (resultsWrap) {
    resultsWrap.hidden = isLoading;
  }

  if (reviewToolbar) {
    reviewToolbar.hidden = isLoading;
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

function actionLabelSet(defaultAction) {
  if (defaultAction === "move") {
    return {
      commit: browser.i18n.getMessage("moveSelected") || "Move selected",
      row: browser.i18n.getMessage("moveAction") || "Move",
      confirmKey: "moveSelectedConfirm",
    };
  }

  if (defaultAction === "permanent") {
    return {
      commit: browser.i18n.getMessage("deleteSelected") || "Delete selected",
      row: browser.i18n.getMessage("deleteAction") || "Delete",
      confirmKey: "deleteSelectedConfirm",
    };
  }

  return {
    commit: browser.i18n.getMessage("moveToTrash") || "Move to Trash",
    row: browser.i18n.getMessage("moveToTrash") || "Move to Trash",
    confirmKey: "trashSelectedConfirm",
  };
}

function updateCommitButtonLabel(defaultAction) {
  const deleteSelectedBtn = document.getElementById("delete-selected");
  if (!deleteSelectedBtn) return;

  deleteSelectedBtn.textContent = actionLabelSet(defaultAction).commit;
}

async function setupActionConfig() {
  const container = document.getElementById("action-config");
  if (!container) return;

  const settings = await preferences.getSettings();
  selectedAction = settings.defaultAction || "trash";
  selectedMoveTarget = settings.moveTargetFolder || null;

  const select = document.getElementById("dialog-move-target");

  if (select) {
    while (select.options.length > 1) {
      select.remove(1);
    }

    try {
      const entries = await folders.listAllFolders();
      for (const entry of entries) {
        const option = document.createElement("option");
        option.value = JSON.stringify({
          accountId: entry.accountId,
          path: entry.path,
          name: entry.name,
        });
        option.textContent = entry.label;
        select.appendChild(option);
      }
    } catch (err) {
      console.error("Failed to list folders for the move target:", err);
    }

    if (selectedMoveTarget && selectedMoveTarget.path) {
      for (const option of select.options) {
        if (!option.value) continue;
        try {
          const parsed = JSON.parse(option.value);
          if (
            parsed.accountId === selectedMoveTarget.accountId &&
            parsed.path === selectedMoveTarget.path
          ) {
            select.value = option.value;
            break;
          }
        } catch (error) {
          // ignore malformed option values
        }
      }
    }

    select.classList.toggle("is-hidden", selectedAction !== "move");

    select.addEventListener("change", () => {
      selectedMoveTarget = null;
      if (select.value) {
        try {
          selectedMoveTarget = JSON.parse(select.value);
        } catch (error) {
          selectedMoveTarget = null;
        }
      }
    });
  }

  for (const radio of container.querySelectorAll('input[name="dialog-default-action"]')) {
    radio.checked = radio.value === selectedAction;

    radio.addEventListener("change", async () => {
      if (!radio.checked) return;
      selectedAction = radio.value;
      if (select) select.classList.toggle("is-hidden", selectedAction !== "move");
      updateCommitButtonLabel(selectedAction);
      // Re-render so the per-message radios relabel (Move to Trash / Move / Delete).
      await render();
    });
  }

  updateCommitButtonLabel(selectedAction);
}

function renderRowsChunked(tbody, rows, columns, token, chunkSize = 1) {
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
      subjectCell.textContent = r.subjectDisplay;
      subjectCell.hidden = !columns.visible.subject;
      groupRow.appendChild(subjectCell);

      const authorCell = document.createElement("td");
      authorCell.textContent = r.authorDisplay;
      authorCell.hidden = !columns.visible.author;
      groupRow.appendChild(authorCell);

      const folderCell = document.createElement("td");
      folderCell.textContent = r.folderDisplay;
      folderCell.hidden = !columns.visible.folder;
      groupRow.appendChild(folderCell);

      const dateCell = document.createElement("td");
      dateCell.textContent = r.dateDisplay;
      dateCell.hidden = !columns.visible.date;
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
        messageCell.colSpan = columns.count;

        const review = document.createElement("div");
        review.className = "message-review";

        const actions = document.createElement("div");
        actions.className = "message-actions";

        const choices = document.createElement("div");
        choices.className = "message-action-choices";

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
        deleteLabel.append(` ${columns.deleteLabel}`);

        choices.appendChild(keepLabel);
        choices.appendChild(deleteLabel);
        actions.appendChild(choices);

        const previewBtn = document.createElement("button");
        previewBtn.type = "button";
        previewBtn.className = "preview-btn";
        previewBtn.dataset.messageId = String(message.id);
        previewBtn.textContent = browser.i18n.getMessage("previewMessage") || "Open";
        actions.appendChild(previewBtn);

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

  renderToken++;
  const token = renderToken;

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

  const columnVisible = {
    subject: !!settings.compareSubject,
    author: !!settings.compareAuthor,
    folder: !!settings.compareFolder,
    date: !!settings.compareSendTime,
    count: true,
  };

  for (const [key, thId] of [
    ["subject", "th-subject"],
    ["author", "th-author"],
    ["folder", "th-folder"],
    ["date", "th-date"],
    ["count", "th-count"],
  ]) {
    const th = document.getElementById(thId);
    if (th) th.hidden = !columnVisible[key];
  }

  const visibleColumnCount = Object.values(columnVisible).filter(Boolean).length;

  const deleteActionLabel = actionLabelSet(selectedAction).row;

  const scanSummary = document.getElementById("scan-summary");
  if (scanSummary) {
    const enabled = [];

    if (settings.compareSubject) enabled.push(browser.i18n.getMessage("subjectColumn"));
    if (settings.compareAuthor) enabled.push(browser.i18n.getMessage("authorColumn"));
    if (settings.compareFolder) enabled.push(browser.i18n.getMessage("folderColumn"));
    if (settings.compareSendTime) enabled.push(browser.i18n.getMessage("dateColumn"));

    let summaryText =
      `${browser.i18n.getMessage("scanSummaryLabel")} ${enabled.join(", ")}`;

    // Only surface the scope when it isn't the default ("all messages").
    if (settings.searchScope && settings.searchScope !== "all") {
      summaryText += ` • ${browser.i18n.getMessage("searchScopeUnread")}`;
    }

    if (Array.isArray(data.originalsFolderNames) && data.originalsFolderNames.length > 0) {
      summaryText += ` • ${browser.i18n.getMessage(
        "originalsFoldersUsed",
        data.originalsFolderNames.join(", ")
      )}`;
    }

    scanSummary.textContent = summaryText;
  }

  if (data.noFolderSelected) {
    const deleteSelectedBtn = document.getElementById("delete-selected");

    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = true;
    }

    tbody.textContent = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = visibleColumnCount;
    cell.style.textAlign = "center";
    cell.style.padding = "16px";
    cell.textContent = browser.i18n.getMessage("noFolderSelected");

    row.appendChild(cell);
    tbody.appendChild(row);

    return;
  }

  if (data.scanCancelled) {
    const deleteSelectedBtn = document.getElementById("delete-selected");

    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = true;
    }

    tbody.textContent = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = visibleColumnCount;
    cell.style.textAlign = "center";
    cell.style.padding = "16px";
    cell.textContent = browser.i18n.getMessage("scanCancelledMessage");

    row.appendChild(cell);
    tbody.appendChild(row);

    return;
  }

  if (data.noCriteriaSelected) {
    const deleteSelectedBtn = document.getElementById("delete-selected");

    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = true;
    }

    tbody.textContent = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = visibleColumnCount;
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

    cell.colSpan = visibleColumnCount;
    cell.style.textAlign = "center";
    cell.style.padding = "16px";
    cell.textContent = browser.i18n.getMessage("noResults");

    row.appendChild(cell);
    tbody.appendChild(row);

    return;
  }

  renderRowsChunked(
    tbody,
    rows,
    { visible: columnVisible, count: visibleColumnCount, deleteLabel: deleteActionLabel },
    token
  );
}

async function runDuplicateScan(selectedFolders) {
  if (!Array.isArray(selectedFolders) || selectedFolders.length === 0) {
    return;
  }

  const settings = await preferences.getSettings();

  const originalsForThisScan = await originals.getOriginalsFolders();
  await originals.clearOriginalsFolders();

  // Without an identifying field (Subject/message-ID/body) and without an Originals folder to anchor against, the criteria can't tell messages apart
  // Warning user that limited selected criteria will skew duplicate results, but let the user proceed if they choose to.
  const hasIdentifyingCriteria =
    settings.compareSubject || settings.compareMessageId || settings.compareBody;

  if (!hasIdentifyingCriteria && originalsForThisScan.length === 0) {
    const proceed = window.confirm(browser.i18n.getMessage("weakCriteriaWarning"));

    if (!proceed) {
      data = {
        folderName: "",
        scannedCount: 0,
        duplicateGroupCount: 0,
        rows: [],
        scanCancelled: true,
        originalsFolderNames: [],
      };
      return;
    }
  }

  data = null;

  // Body scan loading
  if (settings.compareBody) {
    setLoading(true, browser.i18n.getMessage("bodyScanLoading"));
  }

  try {
    const result = await scan.scanForDuplicates(selectedFolders, settings, {
      originalsForThisScan,
      onProgress: async (partial) => {
        data = partial;
        await render();
      },
    });

    data = result;
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

    tbody.addEventListener("click", async (event) => {
      const button = event.target.closest(".preview-btn");
      if (!button) return;

      const messageId = Number(button.dataset.messageId);
      if (!Number.isFinite(messageId)) return;

      await browser.runtime.sendMessage({
        type: "preview-message",
        messageId,
      });
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

      const isMove = selectedAction === "move";

      if (isMove && !selectedMoveTarget) {
        alert(browser.i18n.getMessage("moveTargetMissing"));
        return;
      }

      const confirmed = confirm(
        browser.i18n.getMessage(
          actionLabelSet(selectedAction).confirmKey,
          [String(messageIdsToDelete.length)]
        )
      );

      if (!confirmed) {
        return;
      }

      await browser.runtime.sendMessage({
        type: "commit-duplicate-actions",
        messageIds: messageIdsToDelete,
        action: selectedAction,
        moveTargetFolder: selectedMoveTarget,
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

  if (!Array.isArray(scanFolders) || scanFolders.length === 0) {
    data = {
      folderName: "",
      scannedCount: 0,
      duplicateGroupCount: 0,
      rows: [],
      noFolderSelected: true,
    };

    await render();
    updateDeleteSelectedButton();
    return;
  }

  // Seed the per-scan action from the saved default before scanning 
  const seedSettings = await preferences.getSettings();
  selectedAction = seedSettings.defaultAction || "trash";
  selectedMoveTarget = seedSettings.moveTargetFolder || null;

  await runDuplicateScan(scanFolders);

  const settings = await preferences.getSettings();

  if (!settings.reviewBeforeDeletion && data?.rows?.length > 0) {
    const messageIdsToDelete = [];

    for (const row of data.rows || []) {
      for (const message of row.messages || []) {
        if (message.action === "delete") {
          messageIdsToDelete.push(message.id);
        }
      }
    }

    if (messageIdsToDelete.length > 0) {
      const isMove = selectedAction === "move";
      if (isMove && !selectedMoveTarget) {
        alert(browser.i18n.getMessage("moveTargetMissing"));
      } else {
        const confirmed = confirm(
          browser.i18n.getMessage(
            actionLabelSet(selectedAction).confirmKey,
            [String(messageIdsToDelete.length)]
          )
        );

        if (confirmed) {
          await browser.runtime.sendMessage({
            type: "commit-duplicate-actions",
            messageIds: messageIdsToDelete,
            action: selectedAction,
            moveTargetFolder: selectedMoveTarget,
          });

          window.close();
          return;
        }
      }
    }
  }

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

  // Populate and wire the footer Action chooser after the scan
  try {
    await setupActionConfig();
  } catch (err) {
    console.error("Action config setup failed:", err);
  }
}

init().catch((err) => {
  console.error(err);
  setLoading(false);
  const meta = document.getElementById("meta");
  if (meta) {
    meta.textContent = `${browser.i18n.getMessage("errorPrefix")} ${err?.message || err}`;
  }
});