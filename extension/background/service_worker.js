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
  "page.back":      async (tab) => navigateAndAdopt(tab, () => browser.tabs.goBack(tab.id)),
  "page.forward":   async (tab) => navigateAndAdopt(tab, () => browser.tabs.goForward(tab.id)),
  "scroll.up":      async (tab, ctx) => contextualScroll(tab, ctx, "up"),
  "scroll.down":    async (tab, ctx) => contextualScroll(tab, ctx, "down"),
  "page.top":       async (tab) => scrollExtreme(tab, "top"),
  "page.bottom":    async (tab) => scrollExtreme(tab, "bottom"),
  "site.home":      async (tab, ctx) => {
    if (ctx?.longPress) {
      let url = "about:home";
      try {
        const hp = await browser.browserSettings?.homepageOverride?.get?.({});
        if (hp?.value) url = String(hp.value).split("|")[0].trim() || url;
      } catch {}
      try { return await browser.tabs.update(tab.id, { url }); }
      catch { return browser.tabs.create({ url }); }
    }
    return browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.location.href = window.location.origin + "/"; }
    });
  },
  "search.web":     async (tab, ctx) => {
    if (ctx?.longPress) {
      // "Rechercher dans la page" : ouvre une mini barre de recherche
      // injectée dans la page (équivalent fonctionnel de Ctrl+F).
      let query = (ctx?.selection ?? "").trim();
      if (!query) {
        try {
          const r = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => (window.getSelection?.()?.toString() || "").trim()
          });
          query = (r?.[0]?.result || "").trim();
        } catch {}
      }
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: openInPageFind,
          args: [query]
        });
      } catch (e) { console.warn("[OGC] in-page find failed", e); }
      // En complément, on tente aussi l'API native find/highlight si dispo.
      if (query) {
        try {
          await browser.find.find(query, { tabId: tab.id, caseSensitive: false });
          await browser.find.highlightResults({ tabId: tab.id });
        } catch {}
      }
      return;
    }
    const q = ctx?.selection?.trim();
    const url = q
      ? "https://www.google.com/search?q=" + encodeURIComponent(q)
      : "https://www.google.com/";
    return browser.tabs.create({ url });
  },
  "help.toggle":    async (tab) => {
    // Firefox MV3 : sidebarAction.open/toggle exige une activation utilisateur,
    // perdue dans les handlers de messages. On essaie quand même, puis on
    // bascule sur un panneau injecté côté page (même contenu, dans une iframe).
    const sa = browser.sidebarAction;
    try {
      if (sa && typeof sa.toggle === "function") { await sa.toggle(); return; }
      if (sa && typeof sa.open === "function") { await sa.open(); return; }
    } catch (e) { /* fallback injecté ci-dessous */ }
    try { await browser.tabs.sendMessage(tab.id, { type: "ogc.toggleHelpPanel" }); }
    catch (e) { console.warn("[OGC] help.toggle fallback failed", e); }
  },
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
  if (sorted.length < 2) return false;
  const i = sorted.findIndex((t) => t.id === tab.id);
  if (i < 0) return false;
  const next = sorted[(i + delta + sorted.length) % sorted.length];
  if (!next || next.id === tab.id) return false;
  await browser.tabs.update(next.id, { active: true });
  try { await browser.tabs.sendMessage(next.id, { type: "ogc.adoptLongPress" }); } catch {}
  return { pressTabId: next.id };
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
  // Clamp aux extrémités : on s'arrête à `minimized` ou `fullscreen`.
  const j = Math.max(0, Math.min(WIN_STATES.length - 1, i + delta));
  if (j === i) return false; // signale au répéteur qu'il faut s'arrêter
  await browser.windows.update(win.id, { state: WIN_STATES[j] });
  // Retourne false aussi si on vient d'atteindre une extrémité, pour
  // que la prochaine itération soit évitée.
  if (j === 0 || j === WIN_STATES.length - 1) return false;
  return true;
}

/* ---------- background-driven repetition ----------
 * Pour fiabiliser la répétition au-delà des navigations (page.back, tab.close,
 * tab.next), le background pilote la boucle : après chaque action, on attend
 * REPEAT_MS puis on demande à l'onglet actif si l'utilisateur maintient
 * toujours l'appui. Si oui, on répète. Sinon, on s'arrête.
 */
const REPEAT_MS = 1000;
let activeRepeat = null;
function stopRepeat() {
  if (activeRepeat) {
    if (activeRepeat.timer) clearTimeout(activeRepeat.timer);
    activeRepeat = null;
  }
}

async function pingLongPress(tabId) {
  try {
    const r = await browser.tabs.sendMessage(tabId, { type: "ogc.pingLongPress" });
    return !!r?.active;
  } catch { return false; }
}

function isNavigationRepeatAction(action) {
  return action === "page.back" || action === "page.forward" ||
    action === "tab.next" || action === "tab.prev" || action === "tab.close";
}

async function getCurrentTab(originTab) {
  try {
    const wid = originTab?.windowId;
    const tabs = await browser.tabs.query({ active: true, windowId: wid });
    return tabs[0] || originTab;
  } catch { return originTab; }
}

function scheduleRepeat(entry, handler, originTab, ctx, token) {
  if (!activeRepeat || activeRepeat.token !== token) return;
  activeRepeat.timer = setTimeout(async () => {
    if (!activeRepeat || activeRepeat.token !== token) return;
    const target = isNavigationRepeatAction(entry.action) ? await getCurrentTab(originTab) : originTab;
    if (!target) { stopRepeat(); return; }
    const stillPressing = await pingLongPress(activeRepeat.pressTabId);
    if (!stillPressing) { stopRepeat(); return; }
    let cont = true;
    try {
      const r = await handler(target, ctx);
      if (r === false) cont = false;
      else if (r?.pressTabId && activeRepeat?.token === token) activeRepeat.pressTabId = r.pressTabId;
    } catch (err) { console.warn("[OGC] repeat failed", err); }
    if (!cont) { stopRepeat(); return; }
    scheduleRepeat(entry, handler, originTab, ctx, token);
  }, REPEAT_MS);
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
  const tab = sender.tab;
  if (!tab) return;
  if (msg?.type === "ogc.repeatStop") { stopRepeat(); return; }
  if (msg?.type !== "ogc.stroke" || !Array.isArray(msg.points)) return;

  const ctx = msg.context ?? {};
  // Any new stroke cancels a pending repeat.
  stopRepeat();
  let sequence = "";
  let nativeAction = null;
  try {
    const res = await recognizeAction(msg.points);
    sequence     = res.sequence;
    nativeAction = res.actionName;
  } catch (err) { console.warn("[OGC] recognition failed", err); return; }

  // Prefer the native exact match embedded in the WASM; fall back to the JS
  // fuzzy matcher only when the C++ table has no exact hit.
  const hintedEntry = typeof msg.actionHint === "string" ? ENTRY_BY_ACTION[msg.actionHint] : null;
  const entry = hintedEntry || (nativeAction && ENTRY_BY_ACTION[nativeAction]) || findVocab(sequence);
  if (!entry) return;

  const handler = ACTIONS[entry.action];
  if (!handler) return;

  // Send tooltip feedback to the page (FR label).
  const labelText = ctx.longPress && entry.longLabel ? entry.longLabel : entry.label;
  browser.tabs.sendMessage(tab.id, {
    type: "ogc.feedback",
    label: labelText,
    long: !!ctx.longPress
  }).catch(() => {});

  let firstResult;
  try { firstResult = await handler(tab, ctx); }
  catch (err) { console.warn("[OGC] action failed", entry.action, sequence, err); }

  // Démarre la boucle de répétition pilotée par le background pour les
  // gestes répétables, sauf si la première exécution a déjà demandé l'arrêt.
  if (ctx.longPress && entry.repeat && firstResult !== false) {
    const token = Symbol("repeat");
    activeRepeat = { token, timer: null, pressTabId: tab.id };
    scheduleRepeat(entry, handler, tab, ctx, token);
  }
});

/* ---------- helper injecté pour la recherche dans la page ---------- */
function openInPageFind(initialQuery) {
  try {
    const ID = "__ogc_find_bar__";
    document.getElementById(ID)?.remove();
    const bar = document.createElement("div");
    bar.id = ID;
    bar.style.cssText = [
      "position:fixed", "top:12px", "right:12px", "z-index:2147483647",
      "background:#fff", "color:#111", "border:1px solid #ccc",
      "border-radius:8px", "box-shadow:0 4px 16px rgba(0,0,0,.2)",
      "padding:8px 10px", "font:14px/1.2 system-ui,sans-serif",
      "display:flex", "gap:6px", "align-items:center"
    ].join(";");
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Rechercher dans la page…";
    input.value = initialQuery || "";
    input.style.cssText = "border:1px solid #ccc;border-radius:6px;padding:4px 8px;min-width:220px;font:inherit";
    const prev = document.createElement("button"); prev.textContent = "◀";
    const next = document.createElement("button"); next.textContent = "▶";
    const close = document.createElement("button"); close.textContent = "✕";
    for (const b of [prev, next, close]) {
      b.style.cssText = "border:1px solid #ccc;background:#f4f4f4;border-radius:6px;padding:2px 8px;cursor:pointer;font:inherit";
    }
    const doFind = (forward) => {
      const q = input.value;
      if (!q) return;
      try { window.find(q, false, !forward, true, false, true, false); } catch {}
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doFind(!e.shiftKey); }
      else if (e.key === "Escape") { e.preventDefault(); bar.remove(); }
    });
    next.addEventListener("click", () => doFind(true));
    prev.addEventListener("click", () => doFind(false));
    close.addEventListener("click", () => bar.remove());
    bar.append(input, prev, next, close);
    document.documentElement.appendChild(bar);
    input.focus(); input.select();
    if (initialQuery) doFind(true);
  } catch (e) { console.warn("[OGC] openInPageFind", e); }
}