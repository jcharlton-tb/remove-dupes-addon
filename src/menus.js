export const TOOLBAR_COMPARISON_ITEMS = [
  { id: "toggle-compare-subject", titleKey: "compareSubjectMenu", key: "compareSubject" },
  { id: "toggle-compare-author", titleKey: "compareAuthorMenu", key: "compareAuthor" },
  { id: "toggle-compare-recipients", titleKey: "compareRecipientsMenu", key: "compareRecipients" },
  { id: "toggle-compare-cc", titleKey: "compareCcMenu", key: "compareCc" },
  { id: "toggle-compare-send-time", titleKey: "compareSendTimeMenu", key: "compareSendTime" },
  { id: "toggle-compare-message-id", titleKey: "compareMessageIdMenu", key: "compareMessageId" },
  { id: "toggle-compare-folder", titleKey: "compareFolderMenu", key: "compareFolder" },
  { id: "toggle-compare-body", titleKey: "compareBodyMenu", key: "compareBody" },
];

export function getToolbarComparisonItem(menuItemId) {
  return TOOLBAR_COMPARISON_ITEMS.find((item) => item.id === menuItemId) || null;
}

export async function createToolbarMenus(settings) {

  browser.menus.create({
    id: "open-options",
    title: browser.i18n.getMessage("toolbarOptions"),
    contexts: ["browser_action"],
  });

  browser.menus.create({
    id: "toolbar-separator",
    type: "separator",
    contexts: ["browser_action"],
  });

  const INLINE_COUNT = 3;
  let otherCriteriaCreated = false;

  for (const [index, item] of TOOLBAR_COMPARISON_ITEMS.entries()) {
    const isInline = index < INLINE_COUNT;

    if (!isInline && !otherCriteriaCreated) {
      browser.menus.create({
        id: "toolbar-other-criteria",
        title: browser.i18n.getMessage("otherCriteriaMenu"),
        contexts: ["browser_action"],
      });
      otherCriteriaCreated = true;
    }

    browser.menus.create({
      id: item.id,
      title: browser.i18n.getMessage(item.titleKey),
      type: "checkbox",
      checked: settings[item.key],
      contexts: ["browser_action"],
      ...(isInline ? {} : { parentId: "toolbar-other-criteria" }),
    });
  }
}