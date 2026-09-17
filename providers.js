/**
 * Shared provider table. Loaded as a plain script by the background page and
 * the content script (where it defines globals), and via require() in tests.
 */
(function (root) {
  "use strict";

  // Above this length Claude's ?q= fast path is skipped and we rely purely on
  // the content script inserting the text. Keeps URLs a sane size.
  const CLAUDE_QUERY_MAX_CHARS = 6000;

  const PROVIDERS = {
    claude: {
      id: "claude",
      label: "Claude",
      origin: "https://claude.ai/*",
      newChatUrl(text) {
        const base = "https://claude.ai/new";
        if (typeof text === "string" && text.length > 0 && text.length <= CLAUDE_QUERY_MAX_CHARS) {
          return base + "?q=" + encodeURIComponent(text);
        }
        return base;
      },
      composerSelectors: [
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][data-placeholder]',
        "fieldset textarea",
        "textarea",
      ],
    },
    chatgpt: {
      id: "chatgpt",
      label: "ChatGPT",
      origin: "https://chatgpt.com/*",
      newChatUrl() {
        // Deliberately no ?q= here: ChatGPT auto-submits it, and we only prefill.
        return "https://chatgpt.com/";
      },
      composerSelectors: [
        "#prompt-textarea",
        'div.ProseMirror[contenteditable="true"]',
        "form textarea",
        "textarea",
      ],
    },
    gemini: {
      id: "gemini",
      label: "Gemini",
      origin: "https://gemini.google.com/*",
      newChatUrl() {
        // Gemini has no URL prefill; the content script does all the work.
        return "https://gemini.google.com/app";
      },
      composerSelectors: [
        'rich-textarea .ql-editor[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        "textarea",
      ],
    },
  };

  const PROVIDER_IDS = Object.keys(PROVIDERS);
  const DEFAULT_PROVIDER = "claude";
  const ALL_ORIGINS = PROVIDER_IDS.map((id) => PROVIDERS[id].origin);

  /** Returns the provider whose origin pattern matches the given page URL, or null. */
  function providerForUrl(url) {
    let host;
    try {
      host = new URL(url).host;
    } catch (e) {
      return null;
    }
    for (const id of PROVIDER_IDS) {
      const originHost = new URL(PROVIDERS[id].origin.replace("/*", "/")).host;
      if (host === originHost) return PROVIDERS[id];
    }
    return null;
  }

  /** Coerces any stored value to a valid provider id. */
  function normalizeProviderId(value) {
    return PROVIDER_IDS.includes(value) ? value : DEFAULT_PROVIDER;
  }

  const api = {
    PROVIDERS,
    PROVIDER_IDS,
    DEFAULT_PROVIDER,
    ALL_ORIGINS,
    CLAUDE_QUERY_MAX_CHARS,
    providerForUrl,
    normalizeProviderId,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CopyIntoLLM = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
