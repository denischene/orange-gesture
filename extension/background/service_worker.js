/* Background service worker — dispatches recognized gestures.
 * Uses WASM recognizer with JS fallback, plus a fuzzy matcher so users
 * don't have to draw the exact canonical sequence.
 */
import { recognizeAction, preload } from "./wasm_loader.js";
import GESTURES from "../data/gestures.data.js";

// Build the runtime vocabulary from the single JSON source of truth.
// Every canonical sequence + every alias maps to the same entry so the
// JS fallback (when WASM fails) and the fuzzy matcher share one table.
const OGC_VOCABULARY = {};
const ENTRY_BY_ACTION = {};
for (const g of GESTURES.gestures) {
  const entry = {
    action: g.id,
    label: g.label,
    ...(g.longLabel ? { longLabel: g.longLabel } : {}),
    ...(g.repeat ? { repeat: true } : {})
  };
  ENTRY_BY_ACTION[g.id] = entry;
  OGC_VOCABULARY[g.canonical] = entry;
  for (const a of g.aliases || []) {
    if (!OGC_VOCABULARY[a]) OGC_VOCABULARY[a] = entry;
  }
}

const DEFAULT_SETTINGS = {
  enabled: true, button: 2, trails: true, tooltips: true, sensitivity: 24
};

browser.runtime.onInstalled.addListener(async () => {
  const { settings } = await browser.storage.local.get("settings");
  if (!settings) await browser.storage.local.set({ settings: DEFAULT_SETTINGS });
  preload();
});
browser.runtime.onStartup?.addListener(() => preload());
preload();

/* ---------- fuzzy matching ---------- */

// Tokenize a sequence string into an array of direction tokens
// (UR/UL/DR/DL are 2-char tokens; U/D/L/R are 1-char).
function tokenize(seq) {
  const out = [];
  let i = 0;
  while (i < seq.length) {
    const two = seq.substr(i, 2);
    if (two === "UR" || two === "UL" || two === "DR" || two === "DL") {
      out.push(two); i += 2;
    } else {
      out.push(seq[i]); i += 1;
    }
  }
  return out;
}

// Substitution cost between two direction tokens (0 same, 1 neighbour, 2 far).
const DIR_INDEX = { R: 0, UR: 1, U: 2, UL: 3, L: 4, DL: 5, D: 6, DR: 7 };
function subCost(a, b) {
  if (a === b) return 0;
  const da = DIR_INDEX[a], db = DIR_INDEX[b];
  if (da == null || db == null) return 2;
  let d = Math.abs(da - db);
  if (d > 4) d = 8 - d;
  return d === 1 ? 1 : 2;
}

function dirDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + subCost(a[i - 1], b[j - 1])
      );
    }
  }
  return dp[m][n];
}

const VOCAB_KEYS = Object.keys(OGC_VOCABULARY);
const VOCAB_TOKENS = VOCAB_KEYS.map((k) => ({ key: k, tokens: tokenize(k) }));

function findVocab(seq) {
  if (OGC_VOCABULARY[seq]) return OGC_VOCABULARY[seq];
  const inputTokens = tokenize(seq);
  let best = null;
  let bestCost = Infinity;
  let bestKeyLen = 0;
  for (const { key, tokens } of VOCAB_TOKENS) {
    const lenDiff = Math.abs(tokens.length - inputTokens.length);
    if (lenDiff > Math.max(2, Math.ceil(tokens.length * 0.4))) continue;
    const d = dirDistance(inputTokens, tokens);
    const threshold = Math.max(2, Math.ceil(tokens.length * 0.45));
    if (d <= threshold && (d < bestCost || (d === bestCost && tokens.length > bestKeyLen))) {
      best = OGC_VOCABULARY[key];
      bestCost = d;
      bestKeyLen = tokens.length;
    }
  }
  return best;
}

/* ---------- actions ---------- */
const ACTIONS = {
  "page.back":      async (tab) => browser.tabs.goBack(tab.id).catch(() => {}),
  "page.forward":   async (tab) => browser.tabs.goForward(tab.id).catch(() => {}),
  "scroll.up":      async (tab, ctx) => contextualScroll(tab, ctx, "up"),
  "scroll.down":    async (tab, ctx) => contextualScroll(tab, ctx, "down"),
  "page.top":       async (tab) => scrollExtreme(tab, "top"),
  "page.bottom":    async (tab) => scrollExtreme(tab, "bottom"),
  "site.home":      async (tab, ctx) => {
    if (ctx?.longPress) return browser.tabs.create({ url: "about:home" });
    return browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.location.href = window.location.origin + "/"; }
    });
  },
  "search.web":     async (tab, ctx) => {
    if (ctx?.longPress) {
      // "Rechercher dans la page" : utilise l'API browser.find pour
      // rechercher la sélection courante (ou le presse-papiers en repli)
      // et surligne les résultats dans l'onglet actif.
      let query = ctx?.selection?.trim() || "";
      if (!query) {
        try {
          const r = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => (window.getSelection?.()?.toString() || "").trim()
          });
          query = r?.[0]?.result || "";
        } catch {}
      }
      if (!query) {
        try { query = (await navigator.clipboard.readText())?.trim() || ""; }
        catch {}
      }
      if (!query) {
        // Pas de requête : afficher une notification d'aide.
        return browser.notifications?.create?.({
          type: "basic",
          iconUrl: "icons/ogc-48.png",
          title: "Rechercher dans la page",
          message: "Sélectionnez du texte avant l'appui long, ou utilisez Ctrl+F."
        });
      }
      try {
        await browser.find.find(query, { tabId: tab.id, caseSensitive: false });
        await browser.find.highlightResults({ tabId: tab.id });
      } catch (e) { console.warn("[OGC] find failed", e); }
      return;
    }
    const q = ctx?.selection?.trim();
    const url = q
      ? "https://www.google.com/search?q=" + encodeURIComponent(q)
      : "https://www.google.com/";
    return browser.tabs.create({ url });
  },
  "help.toggle":    async () => browser.sidebarAction?.toggle?.(),
  "tab.new":        async (tab, ctx) => {
    const opts = {};
    if (ctx?.linkHref) opts.url = ctx.linkHref;
    return browser.tabs.create(opts);
  },
  "tab.next":       async (tab) => cycleTab(tab, +1),
  "tab.prev":       async (tab) => cycleTab(tab, -1),
  "tab.close":      async (tab) => browser.tabs.remove(tab.id),
  "window.maximize":async () => cycleWindowState(+1),
  "window.minimize":async () => cycleWindowState(-1),
  "zoom.in":        async (tab) => zoomBy(tab, +0.1),
  "zoom.out":       async (tab) => zoomBy(tab, -0.1),
  "bookmarks.add":  async (tab) => browser.bookmarks.create({ title: tab.title, url: tab.url }),
  "page.saveAs":    async (tab, ctx) => {
    const url = ctx?.linkHref ?? ctx?.imageSrc ?? tab.url;
    if (!url || /^(about:|moz-extension:|chrome:)/i.test(url)) {
      return browser.notifications?.create?.({
        type: "basic",
        iconUrl: "icons/ogc-48.png",
        title: "Enregistrer sous…",
        message: "Cette page n'est pas téléchargeable."
      });
    }
    try {
      await browser.downloads.download({ url, saveAs: true });
    } catch (e) {
      console.warn("[OGC] download failed", e);
      browser.notifications?.create?.({
        type: "basic",
        iconUrl: "icons/ogc-48.png",
        title: "Enregistrer sous…",
        message: "Téléchargement impossible : " + (e?.message || e)
      });
    }
  }
};

async function cycleTab(tab, delta) {
  const tabs = await browser.tabs.query({ currentWindow: true });
  const sorted = tabs.sort((a, b) => a.index - b.index);
  const i = sorted.findIndex((t) => t.id === tab.id);
  const next = sorted[(i + delta + sorted.length) % sorted.length];
  if (next) await browser.tabs.update(next.id, { active: true });
}

async function scrollExtreme(tab, where) {
  await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: (w) => window.scrollTo({ top: w === "top" ? 0 : document.body.scrollHeight, behavior: "smooth" }),
    args: [where]
  });
}

async function contextualScroll(tab, ctx, dir) {
  if (dir === "up" && ctx?.selection) {
    return browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (text) => {
        try { await navigator.clipboard.writeText(text); }
        catch { document.execCommand("copy"); }
      },
      args: [ctx.selection]
    });
  }
  if (dir === "down" && ctx?.inEditable) {
    return browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const el = document.activeElement;
        let text = "";
        try { text = await navigator.clipboard.readText(); }
        catch { text = ""; }
        if (!text) { document.execCommand("paste"); return; }
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
          const start = el.selectionStart ?? el.value.length;
          const end   = el.selectionEnd   ?? el.value.length;
          el.value = el.value.slice(0, start) + text + el.value.slice(end);
          const pos = start + text.length;
          el.selectionStart = el.selectionEnd = pos;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (el && el.isContentEditable) {
          document.execCommand("insertText", false, text);
        }
      }
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
  if (msg?.type !== "ogc.stroke" || !Array.isArray(msg.points)) return;

  const ctx = msg.context ?? {};
  let sequence = "";
  let nativeAction = null;
  try {
    const res = await recognizeAction(msg.points);
    sequence     = res.sequence;
    nativeAction = res.actionName;
  } catch (err) { console.warn("[OGC] recognition failed", err); return; }

  // Prefer the native exact match embedded in the WASM; fall back to the JS
  // fuzzy matcher only when the C++ table has no exact hit.
  const entry = (nativeAction && ENTRY_BY_ACTION[nativeAction]) || findVocab(sequence);
  if (!entry) return;

  // For repeats: only "repeat" tagged actions get re-fired.
  if (ctx.repeat && !entry.repeat) return;

  const handler = ACTIONS[entry.action];
  if (!handler) return;

  // Send tooltip feedback to the page (FR label).
  const labelText = ctx.longPress && entry.longLabel ? entry.longLabel : entry.label;
  if (!ctx.repeat) {
    browser.tabs.sendMessage(tab.id, {
      type: "ogc.feedback",
      label: labelText,
      long: !!ctx.longPress
    }).catch(() => {});
  }

  try { await handler(tab, ctx); }
  catch (err) { console.warn("[OGC] action failed", entry.action, sequence, err); }
});