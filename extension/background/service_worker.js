/* Background service worker — replaces the legacy XPCOM component + OGC_ComponentLoader.
 * Receives recognized gestures from content scripts and dispatches to the
 * appropriate browser.* API.
 *
 * Gesture recognition runs natively here via a C++ engine compiled to
 * WebAssembly (see ../native/ogc_recognizer.cpp). The module is loaded with
 * WebAssembly.instantiateStreaming the first time a stroke arrives — and
 * proactively at startup — so dispatch latency stays sub-millisecond.
 */

import { recognizeStroke, preload } from "./wasm_loader.js";

// Background vocabulary mirror — content scripts use the same map for live
// tooltip preview, but action dispatch is decided here from the WASM output.
const OGC_VOCABULARY = {
  "L":  "tab.back",
  "R":  "tab.forward",
  "U":  "page.top",
  "D":  "tab.scrollBottom",
  "DR": "tab.close",
  "UL": "tab.reopen",
  "UR": "window.new",
  "DL": "tab.reload",
  "LR": "tab.next",
  "RL": "tab.prev",
  "LU": "history.open",
  "LD": "bookmarks.open",
  "RD": "downloads.open",
  "RU": "tab.duplicate"
};

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
  preload();
});
browser.runtime.onStartup?.addListener(() => preload());
preload();

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
  const tab = sender.tab;
  if (!tab) return;

  let action = null;
  let sequence = "";

  if (msg?.type === "ogc.stroke" && Array.isArray(msg.points)) {
    try {
      sequence = await recognizeStroke(msg.points);
      action = OGC_VOCABULARY[sequence] ?? null;
    } catch (err) {
      console.warn("[OGC] wasm recognition failed", err);
      return;
    }
  } else if (msg?.type === "ogc.action") {
    action = msg.action;
    sequence = msg.sequence ?? "";
  } else {
    return;
  }

  if (!action) return;
  const handler = ACTIONS[action];
  if (handler) {
    try { await handler(tab); }
    catch (err) { console.warn("[OGC] action failed", action, sequence, err); }
  }
});