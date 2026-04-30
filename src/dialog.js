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

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function renderRowsChunked(tbody, rows, chunkSize = 1, token) {
  tbody.textContent = ""; 
  let i = 0;

  function appendChunk() {
    if (token !== renderToken) return;
    const end = Math.min(i + chunkSize, rows.length);
    let html = "";

    for (; i < end; i++) {
      const r = rows[i];
      html += `<tr class="group-row">
        <td class="subject">${escapeHtml(r.subject)}</td>
        <td>${escapeHtml(r.author)}</td>
        <td>${escapeHtml(r.folder)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td class="count">${Number(r.count) || 0}</td>
      </tr>`;

      for (const message of r.messages || []) {
        const keepChecked = message.action === "keep" ? "checked" : "";
        const deleteChecked = message.action === "delete" ? "checked" : "";
        const originalMessageLabel = browser.i18n.getMessage("originalMessageLabel") || "Original";
        const originalLabel = message.isOriginal
        ? ` <strong>(${escapeHtml(originalMessageLabel)})</strong>`
         : "";

        html += `<tr class="message-row" data-message-id="${escapeHtml(message.id)}">
          <td colspan="5">
            <div class="message-review">
            <div class="message-actions">
              <label>
                <input type="radio" name="action-${escapeHtml(message.id)}" value="keep" ${keepChecked}>
                ${escapeHtml(browser.i18n.getMessage("keepAction"))}
              </label>
              <label>
                <input type="radio" name="action-${escapeHtml(message.id)}" value="delete" ${deleteChecked}>
                ${escapeHtml(browser.i18n.getMessage("deleteAction"))}
              </label>
            </div>

            <div class="message-meta">
              <strong>${escapeHtml(message.subject)}</strong>${originalLabel}<br>
              ${escapeHtml(message.author)}<br>
              ${escapeHtml(message.folder)} • ${escapeHtml(message.date)}
            </div>
            </div>
          </td>
        </tr>`;
      }
    }

    tbody.insertAdjacentHTML("beforeend", html);

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
    tbody.innerHTML = "";
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
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding: 16px;">
          ${browser.i18n.getMessage("noCriteriaSelected")}
        </td>
      </tr>
    `;
    return;
  }

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding: 16px;">
          ${browser.i18n.getMessage("noResults")}
        </td>
      </tr>
    `;
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

  if (subjectBtn) subjectBtn.addEventListener("click", () => toggleSort("subject"));
  if (countBtn) countBtn.addEventListener("click", () => toggleSort("count"));
  if (authorBtn) authorBtn.addEventListener("click", () => toggleSort("author"));
  if (folderBtn) folderBtn.addEventListener("click", () => toggleSort("folder"));
  if (dateBtn) dateBtn.addEventListener("click", () => toggleSort("date"));

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

      const deleteSelectedBtn = document.getElementById("delete-selected");

      if (deleteSelectedBtn) {
        const hasMessagesToDelete = (data?.rows || []).some((row) =>
        (row.messages || []).some((m) => m.action === "delete")
        );

        deleteSelectedBtn.disabled = !hasMessagesToDelete;
      }
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

  if (deleteSelectedBtn) {
    const hasMessagesToDelete = (data?.rows || []).some((row) =>
    (row.messages || []).some((m) => m.action === "delete")
    );

    deleteSelectedBtn.disabled = !hasMessagesToDelete;
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