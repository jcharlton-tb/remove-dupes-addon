const DEFAULT_SETTINGS = {
    skipSpecialFolders: true,
    skipImapDeleted: true,
    searchSubfolders: true,
    reviewBeforeDeletion: true,
    defaultAction: "trash", 
  
    compareSubject: true,
    compareAuthor: true,
    compareRecipients: true,
    compareCc: false,
    compareSendTime: true,
    compareMessageId: true,
    compareFolder: false,
    compareBody: false,
  
    stripAndSortAddresses: true,
    sendTimeResolution: "minute", 

    searchScope: "all"
  };
  
  async function getSettings() {
    const stored = await browser.storage.local.get();
    return { ...DEFAULT_SETTINGS, ...stored };
  }
  
  async function saveSettings(updates) {
    await browser.storage.local.set(updates);
  }
  
  function getComparisonMenuItems(settings) {
  return [
    {
      id: "toggle-compare-subject",
      title: browser.i18n.getMessage("compareSubjectMenu"),
      key: "compareSubject",
      checked: settings.compareSubject,
    },
    {
      id: "toggle-compare-author",
      title: browser.i18n.getMessage("compareAuthorMenu"),
      key: "compareAuthor",
      checked: settings.compareAuthor,
    },
    {
      id: "toggle-compare-recipients",
      title: browser.i18n.getMessage("compareRecipientsMenu"),
      key: "compareRecipients",
      checked: settings.compareRecipients,
    },
    {
      id: "toggle-compare-cc",
      title: browser.i18n.getMessage("compareCcMenu"),
      key: "compareCc",
      checked: settings.compareCc,
    },
    {
      id: "toggle-compare-send-time",
      title: browser.i18n.getMessage("compareSendTimeMenu"),
      key: "compareSendTime",
      checked: settings.compareSendTime,
    },
    {
      id: "toggle-compare-message-id",
      title: browser.i18n.getMessage("compareMessageIdMenu"),
      key: "compareMessageId",
      checked: settings.compareMessageId,
    },
    {
      id: "toggle-compare-folder",
      title: browser.i18n.getMessage("compareFolderMenu"),
      key: "compareFolder",
      checked: settings.compareFolder,
    },
    {
      id: "toggle-compare-body",
      title: browser.i18n.getMessage("compareBodyMenu"),
      key: "compareBody",
      checked: settings.compareBody,
    },
  ];
}

  const COMPARISON_MENU_ITEMS = getComparisonMenuItems(DEFAULT_SETTINGS);

window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
window.getSettings = getSettings;
window.saveSettings = saveSettings;