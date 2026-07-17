import { browser } from "wxt/browser";
import { isAuthenticationError, loadCredits, rephrase } from "../lib/api";
import { clearToken, getToken } from "../lib/auth";

type ExtensionMessage = {
  type?: string;
  text?: string;
  tone?: string;
};

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

  browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    const message = rawMessage as ExtensionMessage;
    if (message.type !== "prophrase:rephrase-selection") return undefined;

    void (async () => {
      const token = await getToken();
      if (!token) {
        return { ok: false, needsAuth: true };
      }
      if (!message.text || message.text.trim().length < 3 || message.text.length > 5000) {
        return { ok: false, error: "Select between 3 and 5,000 characters." };
      }
      try {
        const credits = await loadCredits(token);
        const limit = credits.balance?.maxInputCharacters ?? 5000;
        if (message.text.trim().length > limit) {
          const plan = credits.balance?.plan ?? "current";
          return {
            ok: false,
            error: `${plan[0].toUpperCase()}${plan.slice(1)} supports selections up to ${limit.toLocaleString()} characters.`,
          };
        }
        const response = await rephrase(token, message.text.trim(), message.tone || "Professional");
        return { ok: true, result: response.result };
      } catch (error) {
        if (isAuthenticationError(error)) {
          await clearToken(token);
          return { ok: false, needsAuth: true };
        }
        return {
          ok: false,
          error: error instanceof Error ? error.message : "ProPhrase could not rephrase this selection.",
        };
      }
    })().then(sendResponse);

    return true;
  });
});
