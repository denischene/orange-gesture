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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
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
  setTimeout(() => { saveStatus.textContent = ""; }, 2500);
});

/* ---------- liste des gestes ---------- */

async function loadGestures() {
  const url = browser.runtime.getURL("data/gestures.json");
  const res = await fetch(url);
  const data = await res.json();
  GESTURES = data.gestures || [];
}

async function loadCustomGestures() {
  const { customGestures: cg = {} } = await browser.storage.local.get("customGestures");
  customGestures = cg || {};
}

function renderCustomList() {
  customList.innerHTML = "";
  for (const g of GESTURES) {
    const row = document.createElement("div");
    row.className = "ogc-gesture-row";
    const isCustom = !!customGestures[g.id];
    const seq = customGestures[g.id] || g.canonical;
    row.innerHTML = `
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
      await browser.storage.local.set({ customGestures });
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
let drawing = false;
let recognizer = null;
let lastPoint = null;
const ctx = wizardCanvas.getContext("2d");

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

function openWizard(gesture) {
  currentGesture = gesture;
  traces = [];
  wizardTitle.textContent = `Personnaliser : ${gesture.label}`;
  wizardSub.textContent = `Tracez votre geste ${REQUIRED_TRACES} fois. Les tracés doivent être cohérents.`;
  wizardStep.textContent = "1";
  wizardSeq.textContent = customGestures[gesture.id] || gesture.canonical;
  wizardSave.disabled = true;
  setMsg("");
  clearCanvas();
  wizard.hidden = false;
}

function closeWizard() {
  wizard.hidden = true;
  currentGesture = null;
  traces = [];
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

wizardCanvas.addEventListener("pointerdown", (e) => {
  if (!currentGesture) return;
  drawing = true;
  recognizer = new OGC_Recognizer();
  clearCanvas();
  const [x, y] = pointerPos(e);
  recognizer.addPoint(x, y);
  lastPoint = [x, y];
  ctx.beginPath();
  ctx.moveTo(x, y);
  wizardCanvas.setPointerCapture(e.pointerId);
});
wizardCanvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const [x, y] = pointerPos(e);
  recognizer.addPoint(x, y);
  ctx.lineTo(x, y);
  ctx.stroke();
});
wizardCanvas.addEventListener("pointerup", () => {
  if (!drawing) return;
  drawing = false;
  const seq = recognizer.sequence();
  if (!seq || seq.length < 1) {
    setMsg("Tracé trop court, recommencez.", "error");
    return;
  }
  traces.push(seq);
  // test de cohérence : tous les tracés doivent être identiques.
  const reference = traces[0];
  const consistent = traces.every((t) => t === reference);
  if (!consistent) {
    setMsg(`Tracé incohérent (« ${seq} » ≠ « ${reference} »). Veuillez recommencer.`, "error");
    traces = [];
    wizardStep.textContent = "1";
    wizardSeq.textContent = customGestures[currentGesture.id] || currentGesture.canonical;
    return;
  }
  wizardSeq.textContent = reference;
  if (traces.length >= REQUIRED_TRACES) {
    wizardStep.textContent = String(REQUIRED_TRACES);
    setMsg(`Geste cohérent (${reference}). Vous pouvez sauvegarder.`, "success");
    wizardSave.disabled = false;
  } else {
    wizardStep.textContent = String(traces.length + 1);
    setMsg(`Tracé ${traces.length}/${REQUIRED_TRACES} accepté. Recommencez le même geste.`);
  }
});

wizardReset.addEventListener("click", () => {
  if (!currentGesture) return;
  traces = [];
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
(async () => {
  await Promise.all([loadSettings(), loadGestures(), loadCustomGestures()]);
  renderCustomList();
  // canvas size after layout
  requestAnimationFrame(resizeCanvas);
  window.addEventListener("resize", () => { if (!wizard.hidden) resizeCanvas(); });
})();