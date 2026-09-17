/* global CopyIntoLLM */
"use strict";

const { PROVIDERS, PROVIDER_IDS, ALL_ORIGINS, normalizeProviderId } = CopyIntoLLM;

const MENU_DEFAULT = "copy-into-default";
const MENU_PARENT = "copy-into";
const MENU_ITEM_PREFIX = "copy-into:";
const MENU_OPTIONS = "copy-into:options";
const MENU_SEPARATOR = "copy-into:separator";
const PENDING_PREFIX = "pending:";
const PENDING_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function getDefaultProvider() {
  const { defaultProvider } = await browser.storage.sync.get("defaultProvider");
  return normalizeProviderId(defaultProvider);
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

async function buildMenus() {
  await browser.menus.removeAll();
  const defaultId = await getDefaultProvider();

  browser.menus.create({
    id: MENU_DEFAULT,
    title: `Copy into ${PROVIDERS[defaultId].label}`,
    contexts: ["selection"],
  });

  browser.menus.create({
    id: MENU_PARENT,
    title: "Copy into",
    contexts: ["selection"],
  });

  for (const id of PROVIDER_IDS) {
    browser.menus.create({
      id: MENU_ITEM_PREFIX + id,
      parentId: MENU_PARENT,
      title: PROVIDERS[id].label,
      contexts: ["selection"],
    });
  }

  browser.menus.create({
    id: MENU_SEPARATOR,
    parentId: MENU_PARENT,
    type: "separator",
    contexts: ["selection"],
  });

  browser.menus.create({
    id: MENU_OPTIONS,
    parentId: MENU_PARENT,
    title: "Set default…",
    contexts: ["selection"],
  });
}

async function refreshDefaultMenuTitle() {
  const defaultId = await getDefaultProvider();
  try {
    await browser.menus.update(MENU_DEFAULT, {
      title: `Copy into ${PROVIDERS[defaultId].label}`,
    });
  } catch (e) {
    // Menu may not exist yet (e.g. first run); rebuild instead.
    await buildMenus();
  }
}

// ---------------------------------------------------------------------------
// Selection capture
// ---------------------------------------------------------------------------

/**
 * Reads the selection from the page itself so line breaks survive.
 * menus.onClicked's info.selectionText collapses whitespace.
 */
async function readSelectionFromTab(tabId) {
  if (typeof tabId !== "number") return "";
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) return sel.toString();
        const el = document.activeElement;
        if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") &&
            typeof el.selectionStart === "number") {
          return el.value.slice(el.selectionStart, el.selectionEnd);
        }
        return "";
      },
    });
    const first = Array.isArray(results) ? results[0] : null;
    return first && typeof first.result === "string" ? first.result : "";
  } catch (e) {
    // Privileged pages (about:, addons.mozilla.org, PDF viewer, ...) refuse injection.
    console.debug("[Copy into LLM] executeScript failed, using selectionText", e);
    return "";
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.warn("[Copy into LLM] clipboard write failed", e);
  }
}

// ---------------------------------------------------------------------------
// Core action
// ---------------------------------------------------------------------------

async function sendSelection(providerId, sourceTab, fallbackText) {
  const provider = PROVIDERS[normalizeProviderId(providerId)];

  let text = await readSelectionFromTab(sourceTab && sourceTab.id);
  if (!text.trim()) text = typeof fallbackText === "string" ? fallbackText : "";
  if (!text.trim()) return;

  await copyToClipboard(text);

  const createProps = { url: provider.newChatUrl(text), active: true };
  if (sourceTab && typeof sourceTab.index === "number") createProps.index = sourceTab.index + 1;
  if (sourceTab && typeof sourceTab.windowId === "number") createProps.windowId = sourceTab.windowId;

  const newTab = await browser.tabs.create(createProps);

  await browser.storage.session.set({
    [PENDING_PREFIX + newTab.id]: {
      provider: provider.id,
      text,
      createdAt: Date.now(),
    },
  });
}

// ---------------------------------------------------------------------------
// Pending-prompt handoff to the content script
// ---------------------------------------------------------------------------

async function takePendingPrompt(tabId) {
  const key = PENDING_PREFIX + tabId;
  const stored = await browser.storage.session.get(key);
  const payload = stored[key];
  if (!payload) return null;
  if (Date.now() - payload.createdAt > PENDING_TTL_MS) {
    await browser.storage.session.remove(key);
    return null;
  }
  return payload;
}

async function clearPendingPrompt(tabId) {
  await browser.storage.session.remove(PENDING_PREFIX + tabId);
}

browser.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender && sender.tab && sender.tab.id;
  if (!message || typeof tabId !== "number") return undefined;

  switch (message.type) {
    case "getPendingPrompt":
      return takePendingPrompt(tabId);
    case "clearPendingPrompt":
      return clearPendingPrompt(tabId).then(() => true);
    default:
      return undefined;
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  clearPendingPrompt(tabId).catch(() => {});
});

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

browser.menus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);

  if (id === MENU_OPTIONS) {
    await browser.runtime.openOptionsPage();
    return;
  }

  let providerId = null;
  if (id === MENU_DEFAULT) {
    providerId = await getDefaultProvider();
  } else if (id.startsWith(MENU_ITEM_PREFIX)) {
    providerId = id.slice(MENU_ITEM_PREFIX.length);
  }
  if (!providerId || !PROVIDERS[providerId]) return;

  await sendSelection(providerId, tab, info.selectionText);
});

browser.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "send-to-default") return;
  const activeTab = tab || (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  const providerId = await getDefaultProvider();
  await sendSelection(providerId, activeTab, "");
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.defaultProvider) {
    refreshDefaultMenuTitle().catch((e) => console.error(e));
  }
});

async function ensureHostPermissions() {
  try {
    const granted = await browser.permissions.contains({ origins: ALL_ORIGINS });
    if (granted) return;
    const { promptedForPermissions } = await browser.storage.local.get("promptedForPermissions");
    if (promptedForPermissions) return;
    await browser.storage.local.set({ promptedForPermissions: true });
    await browser.runtime.openOptionsPage();
  } catch (e) {
    console.warn("[Copy into LLM] permission check failed", e);
  }
}

browser.runtime.onInstalled.addListener(() => {
  ensureHostPermissions();
});

// This top-level code runs every time the event page loads, which includes
// install, browser startup and any reload after Firefox unloaded the page.
// Rebuilding here (and only here) avoids two concurrent builds racing on
// duplicate menu IDs, and keeps the default item's title accurate.
buildMenus().catch((e) => console.error(e));
