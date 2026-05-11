/* Background service worker — replaces the legacy XPCOM component + OGC_ComponentLoader.
 * Receives recognized gestures from content scripts and dispatches to the
 * appropriate browser.* API.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  button: 2,        // 2 = right mouse button
  trails: true,
  tooltips: true,
  sensitivity: 24
};

browser.runtime.onInstalled.addListener(async () => {
  const { settings } = await browser.storage.local.get("settings");
  if (!settings) await browser.storage.local.set({ settings: DEFAULT_SETTINGS });
});

const ACTIONS = {
  "tab.back":         async (tab) => browser.tabs.goBack(tab.id).catch(() => {}),
  "tab.forward":      async (tab) => browser.tabs.goForward(tab.id).catch(() => {}),
  "tab.reload":       async (tab) => browser.tabs.reload(tab.id),
  "tab.close":        async (tab) => browser.tabs.remove(tab.id),
  "tab.duplicate":    async (tab) => browser.tabs.duplicate(tab.id),
  "tab.reopen":       async ()    => {
    const sessions = await browser.sessions.getRecentlyClosed({ maxResults: 1 });
    const s = sessions[0];
    if (s?.tab) return browser.sessions.restore(s.tab.sessionId);
    if (s?.window) return browser.sessions.restore(s.window.sessionId);
  },
  "tab.next":         async (tab) => cycleTab(tab, +1),
  "tab.prev":         async (tab) => cycleTab(tab, -1),
  "tab.scrollTop":    async (tab) => scroll(tab, "top"),
  "tab.scrollBottom": async (tab) => scroll(tab, "bottom"),
  "page.top":         async (tab) => scroll(tab, "top"),
  "window.new":       async ()    => browser.windows.create({}),
  "history.open":     async ()    => browser.tabs.create({ url: "about:history" }),
  "bookmarks.open":   async ()    => browser.tabs.create({ url: "about:bookmarks" }),
  "downloads.open":   async ()    => browser.tabs.create({ url: "about:downloads" })
};

async function cycleTab(tab, delta) {
  const tabs = await browser.tabs.query({ currentWindow: true });
  const sorted = tabs.sort((a, b) => a.index - b.index);
  const i = sorted.findIndex((t) => t.id === tab.id);
  const next = sorted[(i + delta + sorted.length) % sorted.length];
  if (next) await browser.tabs.update(next.id, { active: true });
}

async function scroll(tab, where) {
  await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: (w) => window.scrollTo({ top: w === "top" ? 0 : document.body.scrollHeight, behavior: "smooth" }),
    args: [where]
  });
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg?.type !== "ogc.action") return;
  const tab = sender.tab;
  if (!tab) return;
  const handler = ACTIONS[msg.action];
  if (handler) {
    try { await handler(tab); }
    catch (err) { console.warn("[OGC] action failed", msg.action, err); }
  }
});