/* Background service worker — dispatches recognized gestures.
 * Uses WASM recognizer with JS fallback, plus a fuzzy matcher so users
 * don't have to draw the exact canonical sequence.
 *
 * Chargé en script CLASSIQUE (pas un module ES) pour rester compatible
 * avec Firefox MV3 event-pages (qui n'acceptent pas toujours
 * "type":"module"), notamment sur macOS. Les dépendances sont chargées
 * via importScripts() côté Chromium (service worker) et via la liste
 * background.scripts côté Firefox (event page).
 */
if (typeof importScripts === "function" && !globalThis.OGC_GESTURES_DATA) {
  try {
    importScripts(
      "../lib/compat.js",
      "../lib/storage.js",
      "../data/gestures.data.js",
      "./wasm_loader.js"
    );
  } catch (e) {
    console.error("[OGC] importScripts failed", e);
  }
}
const GESTURES = globalThis.OGC_GESTURES_DATA;
const { recognizeAction, preload } = globalThis.OGC_WASM || {
  recognizeAction: async () => ({ sequence: "", actionName: null }),
  preload: () => {}
};

// Détection navigateur — utilisée pour les URLs «accueil navigateur»
// (chaque famille de navigateurs a sa propre page d'accueil interne).
const IS_FIREFOX = !!browser.runtime?.getBrowserInfo;
function browserHomeUrl() {
  if (IS_FIREFOX) return "about:home";
  // Chromium (Chrome, Edge, Opera, Brave) : la page d'accueil interne
  // est la nouvelle page d'onglet.
  return "chrome://newtab/";
}

// Build the runtime vocabulary from the single JSON source of truth.
// Every canonical sequence + every alias maps to the same entry so the
// JS fallback (when WASM fails) and the fuzzy matcher share one table.
const OGC_VOCABULARY = {};
const ENTRY_BY_ACTION = {};
// Tokenise une séquence brute (canonical/alias dans gestures.json) en
// tokens directionnels puis joint par "-" pour matcher le format dashé
// émis par le recognizer JS (lib/recognizer.js).
function dashifySeq(seq) {
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
  return out.join("-");
}
for (const g of GESTURES.gestures) {
  const entry = {
    action: g.id,
    label: g.label,
    ...(g.longLabel ? { longLabel: g.longLabel } : {}),
    ...(g.repeat ? { repeat: true } : {})
  };
  ENTRY_BY_ACTION[g.id] = entry;
  OGC_VOCABULARY[dashifySeq(g.canonical)] = entry;
  for (const a of g.aliases || []) {
    const k = dashifySeq(a);
    if (!OGC_VOCABULARY[k]) OGC_VOCABULARY[k] = entry;
  }
}

const DEFAULT_SETTINGS = {
  enabled: true, button: 2, trails: true, tooltips: true, sensitivity: 24,
  repeatEnabled: true, voice: false
};

let SETTINGS = { ...DEFAULT_SETTINGS };
let CUSTOM_VOCAB = {}; // sequence -> entry (issu des gestes personnalisés)

async function refreshSettings() {
  const { settings } = await browser.storage.local.get("settings");
  SETTINGS = { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
async function refreshCustom() {
  const customGestures = await OGCStore.getCustom();
  const next = {};
  for (const [actionId, seq] of Object.entries(customGestures || {})) {
    const entry = ENTRY_BY_ACTION[actionId];
    if (entry && typeof seq === "string" && seq.length > 0) next[seq] = entry;
  }
  CUSTOM_VOCAB = next;
}
refreshSettings();
refreshCustom();
browser.storage.onChanged.addListener((changes) => {
  if (changes.settings) refreshSettings();
  if (changes.customGestures) refreshCustom();
});

browser.runtime.onInstalled.addListener(async () => {
  const { settings } = await browser.storage.local.get("settings");
  if (!settings) await browser.storage.local.set({ settings: DEFAULT_SETTINGS });
  preload();
});
browser.runtime.onStartup?.addListener(() => preload());
preload();

/* ---------- détection du lecteur PDF intégré de Firefox ----------
 * Sur Firefox, le visualiseur PDF interne (pdf.js) s'exécute dans un
 * contexte privilégié où les extensions ne peuvent injecter aucun content
 * script : aucun geste ne peut donc y être reconnu. On le détecte au
 * chargement de l'onglet et on prévient l'utilisateur via une notification.
 */
if (IS_FIREFOX) {
  const NOTIFIED = new Set();
  browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (info.status !== "complete") return;
    const url = tab?.url || "";
    if (!/\.pdf(\?|#|$)/i.test(url) && !/^file:.+\.pdf/i.test(url)) return;
    // Ping le content script : s'il répond, c'est qu'on n'est PAS dans
    // pdf.js (PDF servi en plugin tiers, viewer custom…) — rien à signaler.
    let alive = false;
    try {
      const r = await Promise.race([
        browser.tabs.sendMessage(tabId, { type: "ogc.pingLongPress" }),
        new Promise((res) => setTimeout(() => res(null), 800))
      ]);
      alive = !!r;
    } catch {}
    if (alive) return;
    if (NOTIFIED.has(tabId)) return;
    NOTIFIED.add(tabId);
    try {
      await browser.notifications.create("ogc-pdfjs-" + tabId, {
        type: "basic",
        iconUrl: "icons/ogc-48.png",
        title: "Orange Gesture Control",
        message: "Le lecteur PDF intégré de Firefox n'accepte aucune extension : les gestes ne seront pas fonctionnels sur cette page."
      });
    } catch {}
  });
  browser.tabs.onRemoved?.addListener((tabId) => NOTIFIED.delete(tabId));
}

/* ---------- fuzzy matching ---------- */

// Tokenize a sequence string into an array of direction tokens
// (UR/UL/DR/DL are 2-char tokens; U/D/L/R are 1-char).
function tokenize(seq) {
  // Le recognizer JS produit désormais des séquences dashées
  // (« U-R », « D-R-U-R »…). On accepte aussi les anciennes formes
  // compactes par sécurité.
  if (seq.indexOf("-") >= 0) return seq.split("-").filter(Boolean);
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
    // Pas de matching flou pour les clés très courtes (UR/DL = 1 token,
    // L/R/U/D = 1 token) : elles doivent être saisies exactement pour
    // éviter qu'un geste long (ex. U-U-R = « haut de page ») soit
    // confondu avec une diagonale unique (UR = « agrandir »).
    if (tokens.length <= 2 || inputTokens.length <= 2) continue;
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
      let url = browserHomeUrl();
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
    // perdue dans les handlers de messages. Chromium n'expose pas
    // sidebarAction du tout — on tente sidePanel.open(), puis on bascule sur
    // un panneau injecté côté page (même contenu, dans une iframe).
    const sa = browser.sidebarAction;
    try {
      if (sa && typeof sa.toggle === "function") { await sa.toggle(); return; }
      if (sa && typeof sa.open === "function") { await sa.open(); return; }
    } catch (e) { /* fallback injecté ci-dessous */ }
    try {
      const sp = globalThis.chrome?.sidePanel || browser.sidePanel;
      if (sp?.open) { await sp.open({ windowId: tab.windowId, tabId: tab.id }); return; }
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
  "tab.close":      async (tab) => {
    // On bascule d'abord vers l'onglet voisin pour pouvoir y faire parvenir
    // le retour visuel/vocal (l'onglet courant est sur le point d'être
    // détruit, son content script ne pourra ni afficher ni vocaliser).
    let nextTab = null;
    try {
      const tabs = await browser.tabs.query({ windowId: tab.windowId });
      const sorted = tabs.sort((a, b) => a.index - b.index);
      const i = sorted.findIndex((t) => t.id === tab.id);
      nextTab = sorted[i + 1] || sorted[i - 1] || null;
    } catch {}
    if (nextTab) {
      try { await browser.tabs.update(nextTab.id, { active: true }); } catch {}
      try {
        await browser.tabs.sendMessage(nextTab.id, {
          type: "ogc.feedback",
          label: "Fermer onglet",
          long: false,
          voice: !!SETTINGS.voice
        });
      } catch {}
    }
    await browser.tabs.remove(tab.id);
    if (nextTab) {
      try { await browser.tabs.sendMessage(nextTab.id, { type: "ogc.adoptLongPress" }); } catch {}
      return { pressTabId: nextTab.id, skipFeedback: true };
    }
    return false;
  },
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
  },
  /* Élément suivant / précédent : déplace le focus sur l'élément focusable
   * suivant ou précédent dans le DOM de l'onglet actif (équivalent Tab
   * ou Shift+Tab). Réalisé via injection — l'extension ne peut pas
   * envoyer une vraie touche Tab système. */
  "element.next":   async (tab) => moveFocus(tab, +1),
  "element.prev":   async (tab) => moveFocus(tab, -1),
  /* Valider : équivalent Entrée — clique l'élément focusé et dispatche
   * un évènement clavier Enter. */
  "element.activate": async (tab) => browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const el = document.activeElement;
      if (!el || el === document.body) return;
      try {
        const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
        el.dispatchEvent(new KeyboardEvent("keydown", opts));
        el.dispatchEvent(new KeyboardEvent("keypress", opts));
        el.dispatchEvent(new KeyboardEvent("keyup", opts));
        if (typeof el.click === "function") el.click();
      } catch {}
    }
  }).catch(() => {})
};

async function moveFocus(tab, delta) {
  return browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: (dir) => {
      const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),audio[controls],video[controls],[contenteditable=""],[contenteditable="true"],iframe,summary';
      const all = Array.from(document.querySelectorAll(sel));
      const visible = all.filter((el) => {
        if (el.disabled) return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") return false;
        return true;
      });
      visible.sort((a, b) => {
        const ta = parseInt(a.getAttribute("tabindex") || "0", 10);
        const tb = parseInt(b.getAttribute("tabindex") || "0", 10);
        if (ta > 0 && tb > 0 && ta !== tb) return ta - tb;
        if (ta > 0 && tb <= 0) return -1;
        if (tb > 0 && ta <= 0) return 1;
        // DOM order
        const cmp = a.compareDocumentPosition(b);
        if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (cmp & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
      if (visible.length === 0) return;
      const cur = document.activeElement;
      let idx = visible.indexOf(cur);
      if (idx === -1) idx = dir > 0 ? -1 : visible.length;
      const n = visible.length;
      const next = visible[((idx + dir) % n + n) % n];
      try { next.focus({ preventScroll: false }); } catch { try { next.focus(); } catch {} }
      try { next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); } catch {}
    },
    args: [delta]
  }).catch(() => {});
}

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

function waitTabComplete(tabId, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { browser.tabs.onUpdated.removeListener(listener); } catch {}
      clearTimeout(timer);
      resolve(ok);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try { browser.tabs.onUpdated.addListener(listener); } catch { finish(false); }
  });
}

async function navigateAndAdopt(tab, navFn) {
  try { await navFn(); }
  catch { return false; }
  await waitTabComplete(tab.id);
  // Petite marge pour laisser le content script se réinstaller.
  await new Promise((r) => setTimeout(r, 60));
  try { await browser.tabs.sendMessage(tab.id, { type: "ogc.adoptLongPress" }); } catch {}
  return { pressTabId: tab.id };
}

async function scrollExtreme(tab, where) {
  // allFrames: true permet de défiler aussi à l'intérieur des iframes
  // (lecteur PDF SharePoint, pdf.js embarqué, etc.). On vise au passage
  // l'élément interne le plus haut qui soit réellement scrollable, car
  // sur certains visualiseurs PDF ce n'est ni window ni document.body.
  await browser.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: (w) => {
      const top = w === "top";
      // 1) défile la fenêtre
      try {
        window.scrollTo({ top: top ? 0 : document.documentElement.scrollHeight, behavior: "smooth" });
      } catch {}
      // 2) défile aussi le plus grand conteneur scrollable interne
      let best = null, bestArea = 0;
      const all = document.querySelectorAll("*");
      for (let i = 0; i < all.length && i < 4000; i++) {
        const el = all[i];
        if (el.scrollHeight - el.clientHeight < 40) continue;
        const cs = getComputedStyle(el);
        if (!/(auto|scroll|overlay)/.test(cs.overflowY)) continue;
        const area = el.clientWidth * el.clientHeight;
        if (area > bestArea) { best = el; bestArea = area; }
      }
      if (best) {
        try { best.scrollTo({ top: top ? 0 : best.scrollHeight, behavior: "smooth" }); }
        catch { best.scrollTop = top ? 0 : best.scrollHeight; }
      }
    },
    args: [where]
  }).catch(() => {});
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
    target: { tabId: tab.id, allFrames: true },
    func: (s) => {
      // Défile la fenêtre…
      try { window.scrollBy({ top: s, behavior: "smooth" }); } catch {}
      // …et le plus grand conteneur scrollable interne (lecteurs PDF
      // SharePoint, pdf.js, viewers custom où window n'est pas scrollable).
      let best = null, bestArea = 0;
      const all = document.querySelectorAll("*");
      for (let i = 0; i < all.length && i < 4000; i++) {
        const el = all[i];
        if (el.scrollHeight - el.clientHeight < 40) continue;
        const cs = getComputedStyle(el);
        if (!/(auto|scroll|overlay)/.test(cs.overflowY)) continue;
        const area = el.clientWidth * el.clientHeight;
        if (area > bestArea) { best = el; bestArea = area; }
      }
      if (best) {
        try { best.scrollBy({ top: s, behavior: "smooth" }); }
        catch { best.scrollTop += s; }
      }
    },
    args: [step]
  }).catch(() => {});
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
  const customEntry = CUSTOM_VOCAB[sequence] || null;
  const entry = hintedEntry || customEntry || (nativeAction && ENTRY_BY_ACTION[nativeAction]) || findVocab(sequence);
  if (!entry) return;

  const handler = ACTIONS[entry.action];
  if (!handler) return;

  // Send tooltip feedback to the page (FR label).
  // Étiquette contextuelle : certains gestes changent de sens selon le
  // contexte (sélection de texte, champ de saisie). On annonce alors
  // l'action réellement effectuée plutôt que le libellé générique.
  let labelText = ctx.longPress && entry.longLabel ? entry.longLabel : entry.label;
  if (!ctx.longPress) {
    if (entry.action === "scroll.up" && (ctx.selection || "").trim()) {
      labelText = "Copier";
    } else if (entry.action === "scroll.down" && ctx.inEditable) {
      labelText = "Coller";
    }
  }
  // L'action tab.close gère elle-même son feedback (envoyé à l'onglet
  // voisin, le courant étant détruit). On laisse le handler s'en occuper.
  if (entry.action !== "tab.close") {
    browser.tabs.sendMessage(tab.id, {
      type: "ogc.feedback",
      label: labelText,
      long: !!ctx.longPress,
      voice: !!SETTINGS.voice
    }).catch(() => {});
  }

  let firstResult;
  try { firstResult = await handler(tab, ctx); }
  catch (err) { console.warn("[OGC] action failed", entry.action, sequence, err); }

  // Démarre la boucle de répétition pilotée par le background pour les
  // gestes répétables, sauf si la première exécution a déjà demandé l'arrêt.
  if (ctx.longPress && entry.repeat && firstResult !== false && SETTINGS.repeatEnabled !== false) {
    const token = Symbol("repeat");
    // Pour `tab.close`, l'onglet d'origine vient d'être détruit : le handler
    // renvoie l'id de l'onglet voisin (où le content script a adopté
    // l'appui long). On part de cet id-là pour pinger la suite.
    const initialPressTabId = (firstResult && firstResult.pressTabId) || tab.id;
    activeRepeat = { token, timer: null, pressTabId: initialPressTabId };
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