/* global CopyIntoLLM */
(function () {
  "use strict";

  const { PROVIDERS, PROVIDER_IDS, ALL_ORIGINS, normalizeProviderId } = CopyIntoLLM;

  const fieldset = document.getElementById("default-provider");
  const savedNote = document.getElementById("saved");
  const permissionsSection = document.getElementById("permissions");
  const grantButton = document.getElementById("grant-permissions");
  const shortcutEl = document.getElementById("shortcut");

  function renderRadios(current) {
    fieldset.textContent = "";
    for (const id of PROVIDER_IDS) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "defaultProvider";
      input.value = id;
      input.checked = id === current;
      input.addEventListener("change", onChange);
      label.appendChild(input);
      label.appendChild(document.createTextNode(PROVIDERS[id].label));
      fieldset.appendChild(label);
    }
  }

  async function onChange(event) {
    const value = normalizeProviderId(event.target.value);
    await browser.storage.sync.set({ defaultProvider: value });
    savedNote.textContent = `Default set to ${PROVIDERS[value].label}.`;
    setTimeout(() => {
      if (savedNote.textContent.includes(PROVIDERS[value].label)) savedNote.textContent = "";
    }, 2500);
  }

  async function refreshPermissions() {
    let granted = true;
    try {
      granted = await browser.permissions.contains({ origins: ALL_ORIGINS });
    } catch (e) {
      granted = true;
    }
    permissionsSection.hidden = granted;
  }

  grantButton.addEventListener("click", async () => {
    try {
      await browser.permissions.request({ origins: ALL_ORIGINS });
    } catch (e) {
      console.warn("[Copy into LLM] permission request failed", e);
    }
    await refreshPermissions();
  });

  async function renderShortcut() {
    try {
      const commands = await browser.commands.getAll();
      const cmd = commands.find((c) => c.name === "send-to-default");
      shortcutEl.textContent = cmd && cmd.shortcut ? cmd.shortcut : "No shortcut";
    } catch (e) {
      shortcutEl.textContent = "No shortcut";
    }
  }

  async function init() {
    const { defaultProvider } = await browser.storage.sync.get("defaultProvider");
    renderRadios(normalizeProviderId(defaultProvider));
    await Promise.all([refreshPermissions(), renderShortcut()]);
  }

  init().catch((e) => console.error(e));
})();
