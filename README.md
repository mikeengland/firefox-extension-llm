# Copy into LLM

A small Firefox extension. Select text on any page, right-click, and open it in a
**new chat** on Claude, ChatGPT or Gemini in a new tab. The text is placed in the
chat box but **never sent automatically**, so you can add your own instructions first.

## What you get

- **`Copy into <Default>`** at the top of the context menu for a one-click send.
- **`Copy into ▸`** submenu with **Claude**, **ChatGPT** and **Gemini**, plus
  **Set default…** which opens the options page.
- **Keyboard shortcut** `Ctrl+Shift+L` (`Cmd+Shift+L` on macOS) sends the current
  selection to your default assistant. Change it in `about:addons` → gear icon →
  *Manage Extension Shortcuts*.
- **Clipboard safety net**: the selection is always copied to the clipboard too, so
  if a site changes its layout and the chat box can't be filled, `Ctrl+V` still works.
- Multi-line selections keep their line breaks.

## Install (development)

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
2. Pick `manifest.json` in this folder.

Or, with Node installed:

```sh
npm install
npm start        # launches Firefox with the extension loaded (web-ext run)
npm run lint     # validates the manifest and code (web-ext lint)
npm test         # unit tests for the shared provider table
npm run build    # produces web-ext-artifacts/*.zip for signing
```

Requires Firefox 128 or newer.

## How it works

1. The background script reads the selection from the page (so line breaks survive),
   copies it to the clipboard, opens the provider's new-chat URL in a new tab and
   stores the text in session storage keyed by that tab.
2. A content script that runs only on `claude.ai`, `chatgpt.com` and
   `gemini.google.com` asks the background for pending text. If there is none it
   exits immediately. Otherwise it waits for the chat box to appear and inserts the
   text as if typed.
3. For Claude, short selections are also passed via `https://claude.ai/new?q=…`,
   which prefills without submitting. ChatGPT's `?q=` auto-submits and Gemini has no
   URL prefill, so those rely purely on the content script.

## Permissions

| Permission | Why |
| --- | --- |
| `menus` | Adds the context-menu items. |
| `storage` | Stores your default assistant (`sync`) and the pending text (`session`). |
| `activeTab`, `scripting` | Reads the exact selection from the page you right-clicked on. |
| `clipboardWrite` | Copies the selection to the clipboard as a fallback. |
| `https://claude.ai/*`, `https://chatgpt.com/*`, `https://gemini.google.com/*` | Lets the content script fill in the chat box on those sites only. |

The extension never reads your conversations or credentials, and makes no network
requests of its own.

## Known limitations

- The chat-box selectors in `providers.js` depend on each site's markup. If a site
  redesigns, filling may stop working until the selector list is updated. The
  clipboard copy is the fallback in the meantime.
- You need to be logged in to the target site. If it redirects to a login page, the
  text is inserted once you land on the chat page in the same tab (within 5 minutes).
- Selection can't be read from privileged pages (`about:`, the PDF viewer, Mozilla's
  add-on site). There, the whitespace-collapsed selection Firefox provides is used.
