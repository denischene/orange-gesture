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
  // Firefox : sidebarAction.open() préserve l'activation utilisateur.
  // Chromium (Chrome, Edge, Opera, Brave) : aucun moyen fiable d'ouvrir
  // un sidePanel depuis ici ; on délègue au background pour qu'il
  // utilise EXACTEMENT le même chemin que le geste « point d'interrogation »
  // (sidePanel.open avec windowId/tabId si dispo, sinon panneau injecté
  // dans la page via iframe).
  try {
    if (browser.sidebarAction?.open) { await browser.sidebarAction.open(); return; }
    await browser.runtime.sendMessage({ type: "ogc.runAction", action: "help.toggle" });
    window.close();
  } catch (e) { console.warn("[OGC] open sidebar failed", e); }
});

const wb = document.getElementById("open-website");
if (wb) wb.addEventListener("click", async () => {
  try {
    await browser.tabs.create({ url: "https://orange-gesture.lovable.app" });
    window.close();
  } catch (e) { console.warn("[OGC] open website failed", e); }
});
