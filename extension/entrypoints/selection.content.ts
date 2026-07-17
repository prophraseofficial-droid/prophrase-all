import { browser } from "wxt/browser";

type EditableElement = HTMLInputElement | HTMLTextAreaElement;

type SelectionContext = {
  text: string;
  rect: DOMRect;
  element?: EditableElement;
  start?: number;
  end?: number;
  range?: Range;
  editableRoot?: HTMLElement;
};

type RephraseResponse = {
  ok: boolean;
  result?: string;
  error?: string;
  needsAuth?: boolean;
};

const quickTones = ["Professional", "Polite", "Shorter", "Short & Crisp"];

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main() {
    const host = document.createElement("div");
    host.id = "prophrase-selection-assistant";
    host.style.cssText = "all:initial;position:fixed;inset:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "closed" });
    const logoUrl = browser.runtime.getURL("/icons/icon-48.png");

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        button { font: inherit; }
        .pp-bubble {
          position: fixed;
          display: none;
          place-items: center;
          width: 34px;
          height: 34px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          pointer-events: auto;
          filter: drop-shadow(0 6px 10px rgba(24, 20, 15, .24));
          transition: transform .14s ease, filter .14s ease;
        }
        .pp-bubble:hover { transform: translateY(-1px) scale(1.05); filter: drop-shadow(0 7px 10px rgba(24, 20, 15, .3)); }
        .pp-bubble:focus-visible { outline: 3px solid rgba(23, 23, 23, .18); outline-offset: 2px; }
        .pp-bubble img { display: block; width: 32px; height: 32px; object-fit: contain; }
        .pp-panel {
          position: fixed;
          display: none;
          width: min(350px, calc(100vw - 16px));
          max-height: min(500px, calc(100vh - 16px));
          overflow: auto;
          padding: 15px;
          border: 1px solid rgba(17, 17, 14, .12);
          border-radius: 18px;
          background:
            radial-gradient(circle at 100% 0%, rgba(223, 182, 63, .2), transparent 34%),
            #f7f1e3;
          box-shadow: 0 22px 65px rgba(24, 20, 15, .26);
          color: #11110e;
          font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: auto;
        }
        .pp-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .pp-brand { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: 16px; letter-spacing: -.03em; }
        .pp-brand img { width: 32px; height: 32px; object-fit: contain; }
        .pp-close {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: rgba(17, 17, 14, .56);
          cursor: pointer;
        }
        .pp-close:hover { background: #f0e3bd; color: #11110e; }
        .pp-label { display: block; margin: 13px 0 7px; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #775b16; }
        .pp-preview, .pp-result {
          max-height: 100px;
          overflow: auto;
          padding: 10px;
          border: 1px solid rgba(17, 17, 14, .1);
          border-radius: 13px;
          background: #fffdf8;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .pp-preview { color: rgba(17, 17, 14, .62); }
        .pp-tones { display: flex; gap: 5px; overflow-x: auto; padding: 1px 0 2px; scrollbar-width: none; }
        .pp-tones::-webkit-scrollbar { display: none; }
        .pp-tone {
          flex: 0 0 auto;
          padding: 6px 9px;
          border: 1px solid rgba(17, 17, 14, .11);
          border-radius: 999px;
          background: #fffdf8;
          color: rgba(17, 17, 14, .62);
          font-size: 11px;
          cursor: pointer;
        }
        .pp-tone:hover { background: #f2df9c; color: #11110e; }
        .pp-tone[aria-pressed="true"] { border-color: #11110e; background: #11110e; color: white; }
        .pp-primary {
          width: 100%;
          min-height: 40px;
          margin-top: 12px;
          padding: 9px 12px;
          border: 1px solid #11110e;
          border-radius: 999px;
          background: #11110e;
          color: white;
          font-weight: 750;
          cursor: pointer;
        }
        .pp-primary:disabled { opacity: .5; cursor: wait; }
        .pp-result-wrap { display: none; margin-top: 12px; padding: 12px; border-radius: 14px; background: #11110e; color: white; }
        .pp-result-wrap .pp-label { color: #f2df9c; margin-top: 0; }
        .pp-result { margin-top: 6px; border-color: rgba(255,255,255,.12); background: transparent; color: white; }
        .pp-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 8px; }
        .pp-action {
          padding: 7px 10px;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 999px;
          background: transparent;
          color: rgba(255,255,255,.74);
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .pp-action:hover { border-color: #f2df9c; color: #f2df9c; }
        .pp-action.pp-replace { background: #f2df9c; border-color: #f2df9c; color: #11110e; }
        .pp-message { display: none; margin-top: 10px; padding: 9px 10px; border-radius: 12px; font-size: 11px; }
        .pp-message.error { display: block; border: 1px solid #efbbbb; background: #fff1f1; color: #9f2020; }
        .pp-message.info { display: block; border: 1px solid #bde1cd; background: #effaf4; color: #18633d; }
        @media (prefers-reduced-motion: reduce) { .pp-bubble { transition: none; } }
      </style>
      <button class="pp-bubble" type="button" aria-label="Rephrase with ProPhrase" title="Rephrase with ProPhrase">
        <img src="${logoUrl}" alt="" />
      </button>
      <section class="pp-panel" role="dialog" aria-label="ProPhrase quick rephrase">
        <div class="pp-panel-header">
          <div class="pp-brand"><img src="${logoUrl}" alt="" /><span>Quick Rephrase</span></div>
          <button class="pp-close" type="button" aria-label="Close">✕</button>
        </div>
        <span class="pp-label">Selected text</span>
        <div class="pp-preview"></div>
        <span class="pp-label">Style</span>
        <div class="pp-tones"></div>
        <button class="pp-primary" type="button">Rephrase</button>
        <div class="pp-message" role="status"></div>
        <div class="pp-result-wrap">
          <span class="pp-label">Result</span>
          <div class="pp-result"></div>
          <div class="pp-actions">
            <button class="pp-action pp-copy" type="button">Copy</button>
            <button class="pp-action pp-replace" type="button">Replace</button>
          </div>
        </div>
      </section>
    `;

    document.documentElement.append(host);

    const bubble = shadow.querySelector<HTMLButtonElement>(".pp-bubble")!;
    const panel = shadow.querySelector<HTMLElement>(".pp-panel")!;
    const closeButton = shadow.querySelector<HTMLButtonElement>(".pp-close")!;
    const preview = shadow.querySelector<HTMLElement>(".pp-preview")!;
    const tones = shadow.querySelector<HTMLElement>(".pp-tones")!;
    const submitButton = shadow.querySelector<HTMLButtonElement>(".pp-primary")!;
    const message = shadow.querySelector<HTMLElement>(".pp-message")!;
    const resultWrap = shadow.querySelector<HTMLElement>(".pp-result-wrap")!;
    const result = shadow.querySelector<HTMLElement>(".pp-result")!;
    const copyButton = shadow.querySelector<HTMLButtonElement>(".pp-copy")!;
    const replaceButton = shadow.querySelector<HTMLButtonElement>(".pp-replace")!;

    let selectionContext: SelectionContext | null = null;
    let selectedTone = quickTones[0];
    let panelOpen = false;
    let selectionTimer: number | undefined;

    function setMessage(text: string, type: "error" | "info" | null = null) {
      message.textContent = text;
      message.className = type ? `pp-message ${type}` : "pp-message";
    }

    function hideAssistant() {
      bubble.style.display = "none";
      panel.style.display = "none";
      panelOpen = false;
      setMessage("");
    }

    function isSupportedInput(element: Element): element is EditableElement {
      if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
      if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly) return false;
      return ["text", "search", "email", "url", "tel"].includes(element.type);
    }

    function readCurrentSelection(): SelectionContext | null {
      const active = document.activeElement;
      if (active && isSupportedInput(active)) {
        const start = active.selectionStart ?? 0;
        const end = active.selectionEnd ?? 0;
        const text = active.value.slice(start, end).trim();
        if (text.length >= 3 && text.length <= 5000) {
          return { text, rect: active.getBoundingClientRect(), element: active, start, end };
        }
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
      if (selection.anchorNode && shadow.contains(selection.anchorNode)) return null;
      const text = selection.toString().trim();
      if (text.length < 3 || text.length > 5000) return null;
      const range = selection.getRangeAt(0).cloneRange();
      const rects = range.getClientRects();
      const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return null;
      const anchorElement = selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode?.parentElement;
      const editableRoot = anchorElement?.closest<HTMLElement>("[contenteditable='true'], [contenteditable='plaintext-only']") ?? undefined;
      return { text, rect, range, editableRoot };
    }

    function clamp(value: number, minimum: number, maximum: number) {
      return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
    }

    function positionBubble(context: SelectionContext) {
      const left = clamp(context.rect.right + 7, 8, window.innerWidth - 44);
      const preferredTop = context.rect.bottom + 7;
      const top = preferredTop + 44 <= window.innerHeight
        ? preferredTop
        : clamp(context.rect.top - 43, 8, window.innerHeight - 44);
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
    }

    function positionPanel(context: SelectionContext) {
      const panelWidth = Math.min(350, window.innerWidth - 16);
      const left = clamp(context.rect.left, 8, window.innerWidth - panelWidth - 8);
      const estimatedHeight = 430;
      const below = context.rect.bottom + 8;
      const top = below + estimatedHeight <= window.innerHeight
        ? below
        : clamp(context.rect.top - estimatedHeight - 8, 8, window.innerHeight - 100);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }

    function showBubbleForSelection() {
      if (panelOpen) return;
      const current = readCurrentSelection();
      if (!current) {
        bubble.style.display = "none";
        return;
      }
      selectionContext = current;
      positionBubble(current);
      bubble.style.display = "grid";
    }

    function scheduleSelectionCheck() {
      window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(showBubbleForSelection, 80);
    }

    function renderTones() {
      tones.replaceChildren();
      for (const tone of quickTones) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pp-tone";
        button.textContent = tone === "Short & Crisp" ? "Crisp" : tone;
        button.setAttribute("aria-pressed", String(tone === selectedTone));
        button.addEventListener("click", () => {
          selectedTone = tone;
          renderTones();
        });
        tones.append(button);
      }
    }

    async function copyText(text: string) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
    }

    function replaceCapturedSelection(replacement: string) {
      if (!selectionContext) return false;
      const { element, start, end, range, editableRoot } = selectionContext;
      if (element && element.isConnected && start !== undefined && end !== undefined) {
        element.setRangeText(replacement, start, end, "end");
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacement }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      if (range && editableRoot?.isConnected) {
        try {
          range.deleteContents();
          range.insertNode(document.createTextNode(replacement));
          window.getSelection()?.removeAllRanges();
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }

    bubble.addEventListener("pointerdown", (event) => event.preventDefault());
    bubble.addEventListener("click", () => {
      if (!selectionContext) return;
      panelOpen = true;
      bubble.style.display = "none";
      preview.textContent = selectionContext.text;
      result.textContent = "";
      resultWrap.style.display = "none";
      replaceButton.style.display = selectionContext.element || selectionContext.editableRoot ? "inline-block" : "none";
      setMessage("");
      renderTones();
      positionPanel(selectionContext);
      panel.style.display = "block";
    });

    closeButton.addEventListener("click", hideAssistant);

    submitButton.addEventListener("click", async () => {
      if (!selectionContext) return;
      submitButton.disabled = true;
      submitButton.textContent = "Rephrasing...";
      setMessage("");
      resultWrap.style.display = "none";
      try {
        const response = await browser.runtime.sendMessage({
          type: "prophrase:rephrase-selection",
          text: selectionContext.text,
          tone: selectedTone,
        }) as RephraseResponse | undefined;
        if (!response?.ok) {
          if (response?.needsAuth) {
            setMessage("Your ProPhrase connection expired. Open the extension and reconnect your account.", "error");
          } else {
            setMessage(response?.error || "ProPhrase could not rephrase this selection.", "error");
          }
          return;
        }
        result.textContent = response.result || "";
        resultWrap.style.display = "block";
      } catch {
        setMessage("The extension was updated. Reload this page and try again.", "error");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Rephrase";
      }
    });

    copyButton.addEventListener("click", async () => {
      if (!result.textContent) return;
      await copyText(result.textContent);
      setMessage("Copied to clipboard.", "info");
    });

    replaceButton.addEventListener("click", () => {
      if (!result.textContent) return;
      if (replaceCapturedSelection(result.textContent)) {
        hideAssistant();
      } else {
        setMessage("The original selection changed. Copy the result instead.", "error");
      }
    });

    document.addEventListener("selectionchange", scheduleSelectionCheck, true);
    document.addEventListener("mouseup", scheduleSelectionCheck, true);
    document.addEventListener("keyup", scheduleSelectionCheck, true);
    document.addEventListener("pointerdown", (event) => {
      if (event.composedPath().includes(host)) return;
      if (panelOpen) hideAssistant();
    }, true);
    window.addEventListener("scroll", hideAssistant, true);
    window.addEventListener("resize", hideAssistant);
  },
});
