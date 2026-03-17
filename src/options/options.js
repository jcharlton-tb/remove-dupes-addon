import { localizeDocument } from "../vendor/i18n.mjs";

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

function populateForm(settings) {
  setCheckbox("skipSpecialFolders", settings.skipSpecialFolders);
  setCheckbox("skipImapDeleted", settings.skipImapDeleted);
  setCheckbox("searchSubfolders", settings.searchSubfolders);
  setCheckbox("reviewBeforeDeletion", settings.reviewBeforeDeletion);

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
    defaultAction: getRadioValue("defaultAction") || window.DEFAULT_SETTINGS.defaultAction,

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
      : window.DEFAULT_SETTINGS.sendTimeResolution,
  };
}

async function load() {
  const settings = await window.getSettings();
  populateForm(settings);
}

async function save() {
  const settings = readForm();
  await window.saveSettings(settings);
  setStatus("saved");
}

async function resetToDefaults() {
  populateForm(window.DEFAULT_SETTINGS);
  await window.saveSettings(window.DEFAULT_SETTINGS);
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