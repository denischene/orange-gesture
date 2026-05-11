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
if (sb) sb.addEventListener("click", () => browser.sidebarAction?.open?.());
