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
// Mirrors extension/lib/vocabulary.js. Service-worker modules can't share the
// IIFE-style global from the content-script bundle, so we duplicate it here.
const OGC_VOCABULARY = {
  "L":            "page.back",
  "R":            "page.forward",
  "U":            "scroll.up",
  "D":            "scroll.down",
  "RU":           "page.top",
  "RD":           "page.bottom",
  "LURDR":        "site.home",
  "URUURRDLDDL":  "search.web",
  "UURRDDLDD":    "help.toggle",
  "DUURRDRD":     "tab.new",
  "URRDRD":       "tab.next",
  "DDLLULU":      "tab.prev",
  "DRULDR":       "tab.close",
  "UR":           "window.maximize",
  "DL":           "window.minimize",
  "DRDDLLLUURUR": "zoom.in",
  "LDLDDRRULUUL": "zoom.out",
  "LRULRD":       "bookmarks.add",
  "DDRURUULL":    "page.saveAs"
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
  // History
  "page.back":      async (tab) => browser.tabs.goBack(tab.id).catch(() => {}),
  "page.forward":   async (tab) => browser.tabs.goForward(tab.id).catch(() => {}),
  // Scroll one step / extremes
  "scroll.up":      async (tab, ctx) => contextualScroll(tab, ctx, "up"),
  "scroll.down":    async (tab, ctx) => contextualScroll(tab, ctx, "down"),
  "page.top":       async (tab) => scroll(tab, "top"),
  "page.bottom":    async (tab) => scroll(tab, "bottom"),
  // Site / browser home
  "site.home":      async (tab, ctx) => {
    if (ctx?.longPress) return browser.tabs.create({ url: "about:home" });
    return browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.location.href = window.location.origin + "/"; }
    });
  },
  // Search
  "search.web":     async (tab, ctx) => {
    if (ctx?.longPress) {
      return browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (q) => {
          const evt = new KeyboardEvent("keydown", { key: "f", ctrlKey: true });
          window.dispatchEvent(evt);
          if (q) console.log("[OGC] in-page search:", q);
        },
        args: [ctx?.selection ?? ""]
      });
    }
    const q = ctx?.selection?.trim();
    const url = q
      ? "https://www.google.com/search?q=" + encodeURIComponent(q)
      : "https://www.google.com/";
    return browser.tabs.create({ url });
  },
  // Help sidebar
  "help.toggle":    async () => browser.sidebarAction?.toggle?.(),
  // Tabs
  "tab.new":        async (tab, ctx) => browser.tabs.create({ url: ctx?.linkHref ?? "about:newtab" }),
  "tab.next":       async (tab) => cycleTab(tab, +1),
  "tab.prev":       async (tab) => cycleTab(tab, -1),
  "tab.close":      async (tab) => browser.tabs.remove(tab.id),
  // Window state
  "window.maximize":async () => cycleWindowState(+1),
  "window.minimize":async () => cycleWindowState(-1),
  // Zoom
  "zoom.in":        async (tab) => zoomBy(tab, +0.1),
  "zoom.out":       async (tab) => zoomBy(tab, -0.1),
  // Bookmarks / save
  "bookmarks.add":  async (tab) => browser.bookmarks.create({ title: tab.title, url: tab.url }),
  "page.saveAs":    async (tab, ctx) => {
    const url = ctx?.linkHref ?? ctx?.imageSrc ?? tab.url;
    return browser.downloads.download({ url, saveAs: true });
  }
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

async function contextualScroll(tab, ctx, dir) {
  // U on selection -> copy ; D on input field -> paste.
  if (dir === "up" && ctx?.selection) {
    return browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.execCommand("copy")
    });
  }
  if (dir === "down" && ctx?.inEditable) {
    return browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.execCommand("paste")
    });
  }
  const step = dir === "up" ? -300 : 300;
  return browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: (s) => window.scrollBy({ top: s, behavior: "smooth" }),
    args: [step]
  });
}

async function zoomBy(tab, delta) {
  const z = await browser.tabs.getZoom(tab.id);
  await browser.tabs.setZoom(tab.id, Math.max(0.3, Math.min(3, z + delta)));
}

const WIN_STATES = ["minimized", "normal", "maximized", "fullscreen"];
async function cycleWindowState(delta) {
  const win = await browser.windows.getCurrent();
  const i = WIN_STATES.indexOf(win.state);
  const next = WIN_STATES[Math.max(0, Math.min(WIN_STATES.length - 1, i + delta))];
  await browser.windows.update(win.id, { state: next });
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
  const tab = sender.tab;
  if (!tab) return;

  let action = null;
  let sequence = "";
  const ctx = msg?.context ?? {};

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
    try { await handler(tab, ctx); }
    catch (err) { console.warn("[OGC] action failed", action, sequence, err); }
  }
});