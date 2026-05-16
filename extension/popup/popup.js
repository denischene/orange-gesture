const cb = document.getElementById("enabled");
(async () => {
  const { settings = {} } = await browser.storage.local.get("settings");
  cb.checked = settings.enabled !== false;
})();
cb.addEventListener("change", async () => {
  const { settings = {} } = await browser.storage.local.get("settings");
  await browser.storage.local.set({ settings: { ...settings, enabled: cb.checked } });
});
document.getElementById("open-options").addEventListener("click", () => browser.runtime.openOptionsPage());
const sb = document.getElementById("open-sidebar");
if (sb) sb.addEventListener("click", async () => {
  // Firefox : sidebarAction.open(). Chromium : sidePanel.open({windowId}).
  try {
    if (browser.sidebarAction?.open) { await browser.sidebarAction.open(); return; }
    const sp = globalThis.chrome?.sidePanel || browser.sidePanel;
    if (sp?.open) {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      await sp.open({ windowId: tab.windowId, tabId: tab.id });
    }
  } catch (e) { console.warn("[OGC] open sidebar/sidePanel failed", e); }
});
