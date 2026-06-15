import { localizeDocument } from "../vendor/i18n.mjs";
import * as preferences from "../settings.js";
import * as folders from "../folders.js";

function setCheckbox(id, checked) {
  const el = document.getElementById(id);
  if (el) {
    el.checked = Boolean(checked);
  }
}

function getCheckbox(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

function setRadioValue(name, value) {
  const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) {
    radio.checked = true;
  }
}

function getRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : null;
}

function setStatus(messageKey) {
  const status = document.getElementById("status");
  if (!status) {
    return;
  }

  const text = messageKey ? browser.i18n.getMessage(messageKey) : "";
  status.textContent = text;

  if (text) {
    window.setTimeout(() => {
      if (status.textContent === text) {
        status.textContent = "";
      }
    }, 1500);
  }
}

// Fill the destination-folder picker with every folder across all accounts,
// then preselect the saved target (matched by account + path).
async function populateFolderSelect(selected) {
  const select = document.getElementById("moveTargetFolder");
  if (!select) {
    return;
  }

  while (select.options.length > 1) {
    select.remove(1);
  }

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

  if (selected && selected.path) {
    for (const option of select.options) {
      if (!option.value) {
        continue;
      }

      try {
        const parsed = JSON.parse(option.value);
        if (parsed.accountId === selected.accountId && parsed.path === selected.path) {
          select.value = option.value;
          break;
        }
      } catch (error) {
        // ignore malformed option values
      }
    }
  }
}

function readMoveTargetFolder() {
  const select = document.getElementById("moveTargetFolder");
  if (!select || !select.value) {
    return null;
  }

  try {
    return JSON.parse(select.value);
  } catch (error) {
    return null;
  }
}

function populateForm(settings) {
  setCheckbox("skipSpecialFolders", settings.skipSpecialFolders);
  setCheckbox("skipImapDeleted", settings.skipImapDeleted);
  setCheckbox("searchSubfolders", settings.searchSubfolders);
  setCheckbox("reviewBeforeDeletion", settings.reviewBeforeDeletion);
  setCheckbox("silentMode", settings.silentMode);

  setRadioValue("defaultAction", settings.defaultAction);

  setCheckbox("compareSubject", settings.compareSubject);
  setCheckbox("compareAuthor", settings.compareAuthor);
  setCheckbox("compareRecipients", settings.compareRecipients);
  setCheckbox("compareCc", settings.compareCc);
  setCheckbox("compareSendTime", settings.compareSendTime);
  setCheckbox("compareMessageId", settings.compareMessageId);
  setCheckbox("compareFolder", settings.compareFolder);
  setCheckbox("compareBody", settings.compareBody);
  setCheckbox("stripAndSortAddresses", settings.stripAndSortAddresses);

  const sendTimeResolution = document.getElementById("sendTimeResolution");
  if (sendTimeResolution) {
    sendTimeResolution.value = settings.sendTimeResolution;
  }
}

function readForm() {
  const sendTimeResolution = document.getElementById("sendTimeResolution");

  return {
    skipSpecialFolders: getCheckbox("skipSpecialFolders"),
    skipImapDeleted: getCheckbox("skipImapDeleted"),
    searchSubfolders: getCheckbox("searchSubfolders"),
    reviewBeforeDeletion: getCheckbox("reviewBeforeDeletion"),
    silentMode: getCheckbox("silentMode"),
    defaultAction: getRadioValue("defaultAction") || preferences.DEFAULT_SETTINGS.defaultAction,
    moveTargetFolder: readMoveTargetFolder(),

    compareSubject: getCheckbox("compareSubject"),
    compareAuthor: getCheckbox("compareAuthor"),
    compareRecipients: getCheckbox("compareRecipients"),
    compareCc: getCheckbox("compareCc"),
    compareSendTime: getCheckbox("compareSendTime"),
    compareMessageId: getCheckbox("compareMessageId"),
    compareFolder: getCheckbox("compareFolder"),
    compareBody: getCheckbox("compareBody"),

    stripAndSortAddresses: getCheckbox("stripAndSortAddresses"),
    sendTimeResolution: sendTimeResolution
      ? sendTimeResolution.value
      : preferences.DEFAULT_SETTINGS.sendTimeResolution,
  };
}

async function load() {
  const settings = await preferences.getSettings();
  populateForm(settings);
  await populateFolderSelect(settings.moveTargetFolder);
}

async function save() {
  const settings = readForm();
  await preferences.saveSettings(settings);
  setStatus("saved");
}

async function resetToDefaults() {
  populateForm(preferences.DEFAULT_SETTINGS);
  await populateFolderSelect(preferences.DEFAULT_SETTINGS.moveTargetFolder);
  await preferences.saveSettings(preferences.DEFAULT_SETTINGS);
  setStatus("defaultsRestored");
}

document.getElementById("save")?.addEventListener("click", save);
document.getElementById("reset")?.addEventListener("click", resetToDefaults);

window.addEventListener("DOMContentLoaded", async () => {
  localizeDocument();

  try {
    await load();
  } catch (error) {
    console.error("Failed to load options:", error);
    setStatus("failedToLoadSettings");
  }
});