/* global CopyIntoLLM */
(function () {
  "use strict";

  const { providerForUrl } = CopyIntoLLM;
  const COMPOSER_TIMEOUT_MS = 15000;
  const TOAST_ID = "copy-into-llm-toast";

  // Only the top-level document should insert text.
  if (window.top !== window.self) return;

  const provider = providerForUrl(location.href);
  if (!provider) return;

  // -------------------------------------------------------------------------
  // Composer discovery
  // -------------------------------------------------------------------------

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findComposer(selectors) {
    for (const selector of selectors) {
      const candidates = document.querySelectorAll(selector);
      for (const el of candidates) {
        if (isVisible(el)) return el;
      }
    }
    return null;
  }

  function waitForComposer(selectors, timeoutMs) {
    return new Promise((resolve, reject) => {
      const immediate = findComposer(selectors);
      if (immediate) {
        resolve(immediate);
        return;
      }

      let settled = false;
      const observer = new MutationObserver(() => {
        const el = findComposer(selectors);
        if (el && !settled) {
          settled = true;
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        reject(new Error("composer not found"));
      }, timeoutMs);
    });
  }

  // -------------------------------------------------------------------------
  // Text insertion
  // -------------------------------------------------------------------------

  function normalize(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function alreadyContains(el, text) {
    const current = el.tagName === "TEXTAREA" ? el.value : el.textContent;
    const want = normalize(text);
    return want.length > 0 && normalize(current).includes(want);
  }

  function insertIntoTextarea(el, text) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    el.focus();
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return el.value === text;
  }

  function placeCaretAtEnd(el) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insertIntoContentEditable(el, text) {
    el.focus();
    placeCaretAtEnd(el);

    // execCommand is deprecated but is still the one path that makes
    // ProseMirror (Claude, ChatGPT) and Quill (Gemini) see the change as
    // genuine user input, including line breaks.
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (e) {
      ok = false;
    }
    if (ok && alreadyContains(el, text)) return true;

    // Fallback: write the DOM directly and fire an input event.
    el.textContent = "";
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) el.appendChild(document.createElement("br"));
      el.appendChild(document.createTextNode(line));
    });
    el.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: text, bubbles: true }));
    return alreadyContains(el, text);
  }

  function insertText(el, text) {
    if (alreadyContains(el, text)) {
      el.focus();
      return true;
    }
    if (el.tagName === "TEXTAREA") return insertIntoTextarea(el, text);
    return insertIntoContentEditable(el, text);
  }

  // -------------------------------------------------------------------------
  // Feedback
  // -------------------------------------------------------------------------

  function showToast(message) {
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.textContent = message;
    toast.setAttribute("role", "status");
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      maxWidth: "min(90vw, 480px)",
      padding: "12px 16px",
      background: "#1f2937",
      color: "#f9fafb",
      font: "14px/1.4 system-ui, sans-serif",
      borderRadius: "8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      zIndex: "2147483647",
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  }

  // -------------------------------------------------------------------------
  // Main
  // -------------------------------------------------------------------------

  async function main() {
    let payload;
    try {
      payload = await browser.runtime.sendMessage({ type: "getPendingPrompt" });
    } catch (e) {
      return;
    }
    if (!payload || typeof payload.text !== "string" || !payload.text.trim()) return;

    // The payload is only cleared after a successful insert. If this page is a
    // login redirect, the next document load in this tab gets another go, and
    // the background expires stale payloads after a few minutes anyway.
    let composer;
    try {
      composer = await waitForComposer(provider.composerSelectors, COMPOSER_TIMEOUT_MS);
    } catch (e) {
      showToast("Copy into LLM: couldn't find the chat box. The text is on your clipboard, press Ctrl+V to paste it.");
      return;
    }

    const ok = insertText(composer, payload.text);
    if (!ok) {
      showToast("Copy into LLM: couldn't fill the chat box. The text is on your clipboard, press Ctrl+V to paste it.");
      return;
    }
    browser.runtime.sendMessage({ type: "clearPendingPrompt" }).catch(() => {});
  }

  main();
})();
