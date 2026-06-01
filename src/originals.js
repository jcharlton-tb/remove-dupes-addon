const ORIGINALS_FOLDER_KEY = "originalsFolders";

export async function setOriginalsFolders(folders) {
  await browser.storage.local.set({
    [ORIGINALS_FOLDER_KEY]: Array.isArray(folders) ? folders : [],
  });
}

export async function getOriginalsFolders() {
  const stored = await browser.storage.local.get({
    [ORIGINALS_FOLDER_KEY]: [],
  });

  return Array.isArray(stored[ORIGINALS_FOLDER_KEY])
    ? stored[ORIGINALS_FOLDER_KEY]
    : [];
}

export async function clearOriginalsFolders() {
  await browser.storage.local.remove(ORIGINALS_FOLDER_KEY);
}
