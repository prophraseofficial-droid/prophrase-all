import { browser } from "wxt/browser";
import type { SelectionSnapshot } from "./types";

async function activeTabId() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Open a regular webpage before using ProPhrase.");
  return tab.id;
}

export async function readSelection(): Promise<SelectionSnapshot> {
  const tabId = await activeTabId();
  const [result] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      const element = document.activeElement;
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        const start = element.selectionStart ?? 0;
        const end = element.selectionEnd ?? 0;
        const selected = element.value.slice(start, end);
        return { text: selected || element.value, replaceable: true };
      }
      const selection = window.getSelection();
      return {
        text: selection?.toString().trim() ?? "",
        replaceable: Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed),
      };
    },
  });
  return (result?.result as SelectionSnapshot | undefined) ?? { text: "", replaceable: false };
}

export async function replaceSelection(text: string) {
  const tabId = await activeTabId();
  const [result] = await browser.scripting.executeScript({
    target: { tabId },
    args: [text],
    func: (replacement) => {
      const element = document.activeElement;
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        const start = element.selectionStart ?? 0;
        const end = element.selectionEnd ?? element.value.length;
        element.setRangeText(replacement, start, end, "end");
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacement }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(replacement));
      selection.removeAllRanges();
      return true;
    },
  });
  if (!result?.result) throw new Error("The original field is no longer selected. Copy the result instead.");
}
