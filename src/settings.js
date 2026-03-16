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
        title: "Compare Subject",
        key: "compareSubject",
        checked: settings.compareSubject,
      },
      {
        id: "toggle-compare-author",
        title: "Compare Author",
        key: "compareAuthor",
        checked: settings.compareAuthor,
      },
      {
        id: "toggle-compare-recipients",
        title: "Compare Recipients",
        key: "compareRecipients",
        checked: settings.compareRecipients,
      },
      {
        id: "toggle-compare-cc",
        title: "Compare CC",
        key: "compareCc",
        checked: settings.compareCc,
      },
      {
        id: "toggle-compare-send-time",
        title: "Compare Send Time",
        key: "compareSendTime",
        checked: settings.compareSendTime,
      },
      {
        id: "toggle-compare-message-id",
        title: "Compare Message ID",
        key: "compareMessageId",
        checked: settings.compareMessageId,
      },
      {
        id: "toggle-compare-folder",
        title: "Compare Folder",
        key: "compareFolder",
        checked: settings.compareFolder,
      },
      {
        id: "toggle-compare-body",
        title: "Compare Body",
        key: "compareBody",
        checked: settings.compareBody,
      },
    ];
  }

  const COMPARISON_MENU_ITEMS = getComparisonMenuItems(DEFAULT_SETTINGS);