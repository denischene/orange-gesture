/* Page de préférences — OGC.
 * Réglages : bouton souris, trace, répétition.
 * Gestes personnalisés : assistant en 5 tracés avec test de cohérence.
 */

const DEFAULTS = {
  enabled: true,
  button: 2,
  trails: true,
  tooltips: true,
  sensitivity: 24,
  repeatEnabled: true
};

const form = document.getElementById("ogc-options");
const saveStatus = document.getElementById("ogc-save-status");
const customList = document.getElementById("ogc-custom-list");

let GESTURES = [];
let customGestures = {};

/* Mapping id de geste → nom de fichier d'imagette (extension/img/<name>.png). */
const GESTURE_IMG = {
  "page.back":       "right_left",
  "page.forward":    "left_right",
  "scroll.up":       "bottom_top",
  "scroll.down":     "top_bottom",
  "page.top":        "left_right_top",
  "page.bottom":     "left_right_bottom",
  "site.home":       "accueil",
  "search.web":      "magnifying_glass",
  "help.toggle":     "interogation",
  "tab.new":         "top_down_arch",
  "tab.next":        "left_right_arch",
  "tab.prev":        "right_left_arch",
  "tab.close":       "alpha",
  "window.maximize": "bottom_left_top_right",
  "window.minimize": "top_right_bottom_left",
  "zoom.in":         "clockwise_circle",
  "zoom.out":        "anticlockwise_circle",
  "bookmarks.add":   "left_right_heart",
  "page.saveAs":     "vertical_ribbon"
};

/* ---------- réglages ---------- */

async function loadSettings() {
  const { settings = {} } = await browser.storage.local.get("settings");
  const s = { ...DEFAULTS, ...settings };
  for (const el of form.querySelectorAll('input[name="button"]')) {
    el.checked = Number(el.value) === Number(s.button);
  }
  for (const el of form.querySelectorAll('input[name="trails"]')) {
    el.checked = (el.value === "on") === !!s.trails;
  }
  for (const el of form.querySelectorAll('input[name="repeatEnabled"]')) {
    el.checked = (el.value === "on") === !!s.repeatEnabled;
  }
}

form.addEventListener("submit", (e) => e.preventDefault());

async function persistSettings() {
  const { settings = {} } = await browser.storage.local.get("settings");
  const next = {
    ...DEFAULTS,
    ...settings,
    button: Number(new FormData(form).get("button")),
    trails: new FormData(form).get("trails") === "on",
    repeatEnabled: new FormData(form).get("repeatEnabled") === "on"
  };
  await browser.storage.local.set({ settings: next });
  saveStatus.textContent = "Préférences enregistrées.";
  setTimeout(() => { saveStatus.textContent = ""; }, 2000);
}
form.addEventListener("change", (e) => {
  if (e.target && e.target.matches('input[type="radio"]')) persistSettings();
});

/* ---------- liste des gestes ---------- */

async function loadGestures() {
  const url = browser.runtime.getURL("data/gestures.json");
  const res = await fetch(url);
  const data = await res.json();
  GESTURES = data.gestures || [];
}

async function loadCustomGestures() {
  customGestures = await OGCStore.getCustom();
}

function renderCustomList() {
  customList.innerHTML = "";
  for (const g of GESTURES) {
    const row = document.createElement("div");
    row.className = "ogc-gesture-row";
    const isCustom = !!customGestures[g.id];
    const seq = customGestures[g.id] || g.canonical;
    const imgName = GESTURE_IMG[g.id] || "";
    row.innerHTML = `
      <img class="ogc-gesture-img" src="../img/${imgName}.png" alt="" onerror="this.style.visibility='hidden'" />
      <div>
        <span class="ogc-gesture-label">${g.label}</span>
        ${isCustom ? '<span class="ogc-badge">Personnalisé</span>' : ""}
      </div>
      <span class="ogc-gesture-seq ${isCustom ? "custom" : ""}">${seq}</span>
      <button type="button" class="ogc-btn ogc-btn-ghost" data-action="customize">Personnaliser</button>
      <button type="button" class="ogc-btn ogc-btn-ghost" data-action="reset" ${isCustom ? "" : "disabled"}>Réinitialiser</button>
    `;
    row.querySelector('[data-action="customize"]').addEventListener("click", () => openWizard(g));
    row.querySelector('[data-action="reset"]').addEventListener("click", async () => {
      delete customGestures[g.id];
      await OGCStore.setCustom(customGestures);
      renderCustomList();
    });
    customList.appendChild(row);
  }
}

/* ---------- wizard de personnalisation ---------- */

const REQUIRED_TRACES = 5;
const wizard = document.getElementById("ogc-wizard");
const wizardTitle = document.getElementById("ogc-wizard-title");
const wizardSub = document.getElementById("ogc-wizard-sub");
const wizardStep = document.getElementById("ogc-wizard-step");
const wizardSeq = document.getElementById("ogc-wizard-seq");
const wizardMsg = document.getElementById("ogc-wizard-msg");
const wizardCanvas = document.getElementById("ogc-wizard-canvas");
const wizardSave = document.getElementById("ogc-wizard-save");
const wizardReset = document.getElementById("ogc-wizard-reset");
const wizardClose = document.getElementById("ogc-wizard-close");
const wizardCancel = document.getElementById("ogc-wizard-cancel");

let currentGesture = null;
let traces = []; // sequences enregistrées
let acceptedStrokes = []; // points des tracés acceptés (pour overlay final)
let fadeTimer = null;
let inconsistencyStreak = 0;
const MAX_INCONSISTENCIES = 3;
let drawing = false;
let recognizer = null;
let lastPoint = null;
let currentStrokePoints = [];
const ctx = wizardCanvas.getContext("2d");

/* Distance de Levenshtein pour tolérer de petites variations. */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}
function isCloseEnough(a, b) {
  if (a === b) return true;
  const tol = Math.max(1, Math.floor(Math.max(a.length, b.length) / 3));
  return levenshtein(a, b) <= tol;
}

function setMsg(text, kind = "") {
  wizardMsg.textContent = text;
  wizardMsg.className = "ogc-wizard-msg " + kind;
}

function clearCanvas() {
  ctx.clearRect(0, 0, wizardCanvas.width, wizardCanvas.height);
  ctx.strokeStyle = "#ff7900";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function drawStroke(points, opts = {}) {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = opts.color || "#ff7900";
  ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;
  ctx.lineWidth = opts.width || 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
  ctx.restore();
}

function scheduleFade() {
  if (fadeTimer) clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => { clearCanvas(); fadeTimer = null; }, 3000);
}
function cancelFade() {
  if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
}

function openWizard(gesture) {
  currentGesture = gesture;
  traces = [];
  acceptedStrokes = [];
  cancelFade();
  inconsistencyStreak = 0;
  wizardTitle.textContent = `Personnaliser : ${gesture.label}`;
  wizardSub.textContent = `Tracez votre geste ${REQUIRED_TRACES} fois. Les tracés doivent être cohérents.`;
  wizardStep.textContent = "1";
  wizardSeq.textContent = customGestures[gesture.id] || gesture.canonical;
  wizardSave.disabled = true;
  setMsg("");
  wizard.hidden = false;
  requestAnimationFrame(() => { resizeCanvas(); });
}

function closeWizard() {
  wizard.hidden = true;
  currentGesture = null;
  traces = [];
  acceptedStrokes = [];
  cancelFade();
  drawing = false;
}

function resizeCanvas() {
  const r = wizardCanvas.getBoundingClientRect();
  wizardCanvas.width = Math.round(r.width);
  wizardCanvas.height = Math.round(r.height);
  clearCanvas();
}

function pointerPos(e) {
  const r = wizardCanvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

wizardCanvas.addEventListener("contextmenu", (e) => e.preventDefault());
wizardCanvas.addEventListener("pointerdown", (e) => {
  if (!currentGesture) return;
  e.preventDefault();
  cancelFade();
  drawing = true;
  recognizer = new OGC_Recognizer();
  clearCanvas();
  currentStrokePoints = [];
  const [x, y] = pointerPos(e);
  recognizer.addPoint(x, y);
  lastPoint = [x, y];
  currentStrokePoints.push([x, y]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  wizardCanvas.setPointerCapture(e.pointerId);
});
wizardCanvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const [x, y] = pointerPos(e);
  recognizer.addPoint(x, y);
  currentStrokePoints.push([x, y]);
  ctx.lineTo(x, y);
  ctx.stroke();
});
function finishStroke() {
  if (!drawing) return;
  drawing = false;
  const seq = recognizer.sequence();
  const strokePoints = currentStrokePoints.slice();
  if (!seq || seq.length < 1) {
    setMsg("Tracé trop court, recommencez.", "error");
    scheduleFade();
    return;
  }
  // 1er tracé : on l'accepte tel quel.
  if (traces.length === 0) {
    traces.push(seq);
    acceptedStrokes.push(strokePoints);
    inconsistencyStreak = 0;
    wizardSeq.textContent = seq;
    wizardStep.textContent = "2";
    setMsg(`Tracé 1/${REQUIRED_TRACES} accepté. Reproduisez le même geste.`);
    scheduleFade();
    return;
  }
  const reference = traces[0];
  if (!isCloseEnough(seq, reference)) {
    inconsistencyStreak++;
    if (inconsistencyStreak >= MAX_INCONSISTENCIES) {
      traces = [];
      acceptedStrokes = [];
      inconsistencyStreak = 0;
      wizardStep.textContent = "1";
      wizardSeq.textContent = customGestures[currentGesture.id] || currentGesture.canonical;
      wizardSave.disabled = true;
      setMsg(`Trop d'incohérences (3). Procédure réinitialisée — recommencez depuis le début.`, "error");
    } else {
      setMsg(`Tracé incohérent (« ${seq} » ≠ « ${reference} »). Essai ${inconsistencyStreak}/3 — réessayez ce tracé.`, "error");
    }
    scheduleFade();
    return;
  }
  inconsistencyStreak = 0;
  traces.push(seq);
  acceptedStrokes.push(strokePoints);
  wizardSeq.textContent = reference;
  if (traces.length >= REQUIRED_TRACES) {
    wizardStep.textContent = String(REQUIRED_TRACES);
    setMsg(`Geste cohérent (${reference}). Vous pouvez sauvegarder.`, "success");
    wizardSave.disabled = false;
    // Le 5e tracé reste affiché ; on superpose les 4 autres par dessus.
    cancelFade();
    clearCanvas();
    drawStroke(acceptedStrokes[REQUIRED_TRACES - 1], { color: "#ff7900", width: 4, alpha: 1 });
    for (let i = 0; i < REQUIRED_TRACES - 1; i++) {
      drawStroke(acceptedStrokes[i], { color: "#1e3a8a", width: 2, alpha: 0.55 });
    }
  } else {
    wizardStep.textContent = String(traces.length + 1);
    setMsg(`Tracé ${traces.length}/${REQUIRED_TRACES} accepté. Recommencez le même geste.`);
    scheduleFade();
  }
}
wizardCanvas.addEventListener("pointerup", finishStroke);
wizardCanvas.addEventListener("pointercancel", finishStroke);
wizardCanvas.addEventListener("pointerleave", () => { if (drawing) finishStroke(); });

wizardReset.addEventListener("click", () => {
  if (!currentGesture) return;
  traces = [];
  acceptedStrokes = [];
  cancelFade();
  inconsistencyStreak = 0;
  wizardStep.textContent = "1";
  wizardSeq.textContent = customGestures[currentGesture.id] || currentGesture.canonical;
  wizardSave.disabled = true;
  setMsg("");
  clearCanvas();
});

wizardSave.addEventListener("click", async () => {
  if (!currentGesture || traces.length < REQUIRED_TRACES) return;
  const seq = traces[0];
  customGestures[currentGesture.id] = seq;
  await browser.storage.local.set({ customGestures });
  renderCustomList();
  closeWizard();
});

wizardClose.addEventListener("click", closeWizard);
wizardCancel.addEventListener("click", closeWizard);

/* ---------- init ---------- */

/* Tabs */
const tabButtons = document.querySelectorAll(".ogc-tab");
const tabPanels = document.querySelectorAll(".ogc-tab-panel");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-tab");
    tabButtons.forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    tabPanels.forEach((p) => {
      p.hidden = p.getAttribute("data-panel") !== target;
    });
  });
});

(async () => {
  await Promise.all([loadSettings(), loadGestures(), loadCustomGestures()]);
  renderCustomList();
  // canvas size after layout
  requestAnimationFrame(resizeCanvas);
  window.addEventListener("resize", () => { if (!wizard.hidden) resizeCanvas(); });
})();