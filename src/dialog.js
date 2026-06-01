import { localizeDocument } from "./vendor/i18n.mjs";

window.addEventListener("DOMContentLoaded", () => {
  localizeDocument();
});

let data = null;

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

async function waitForResults() {
  while (true) {
    const status = await browser.runtime.sendMessage({ type: "get-scan-status" });

    if (status.error) {
      throw new Error(status.error);
    }

    if (status.inProgress) {
      const folderText = status.folderName
        ? browser.i18n.getMessage("loadingFolderText", status.folderName)
        : browser.i18n.getMessage("loadingText");

      setLoading(true, folderText);
    }

    if (!status.inProgress && status.hasResults) {
      data = await browser.runtime.sendMessage({ type: "get-last-scan-results" });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
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

  await waitForResults();
  await render();

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