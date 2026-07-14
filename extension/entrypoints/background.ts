import { browser } from "wxt/browser";

export default defineBackground(() => {
  const extensionAction = browser.action ?? browser.browserAction;
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: "prophrase-rephrase",
        title: "Rephrase with ProPhrase",
        contexts: ["selection", "editable"],
      });
    });
  });

  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== "prophrase-rephrase") return;
    void browser.storage.local.set({ prophrase_pending_text: info.selectionText ?? "" }).then(async () => {
      try {
        await extensionAction.openPopup();
      } catch {
        await extensionAction.setBadgeText({ text: "1" });
        await extensionAction.setBadgeBackgroundColor({ color: "#111111" });
      }
    });
  });
});
