/* Gesture capture — long press fires while still holding the button. */
(function () {
  const LONG_PRESS_MS = 480;

  const recognizer = new OGC_Recognizer();
  const points = [];
  let active = false;
  let suppressContext = false;
  let downTarget = null;
  let lastMoveAt = 0;
  let longPressTimer = null;
  let longPressFired = false;
  // Visible to the background: true tant que l'utilisateur maintient le
  // pointeur appuyé après le déclenchement initial du long-press.
  let longPressActive = false;
  // Premier hyperlien rencontré pendant le geste (au démarrage ou en cours).
  let firstLinkHref = null;
  let settings = { enabled: true, button: 2, trails: true, tooltips: true };

  browser.storage.local.get("settings").then((s) => {
    if (s.settings) settings = { ...settings, ...s.settings };
  });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.settings) settings = { ...settings, ...changes.settings.newValue };
  });

  // Le background interroge périodiquement l'onglet actif pour savoir si
  // l'appui long est toujours en cours avant de répéter l'action.
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "ogc.pingLongPress") {
      return Promise.resolve({ active: longPressActive });
    }
    if (msg?.type === "ogc.adoptLongPress") {
      active = true;
      longPressFired = true;
      longPressActive = true;
      return Promise.resolve({ active: true });
    }
    if (msg?.type === "ogc.toggleHelpPanel") {
      toggleHelpPanel();
      return Promise.resolve({ ok: true });
    }
  });

  function stopLongPressRepeat() {
    const shouldNotify = longPressActive || longPressFired;
    longPressActive = false;
    if (shouldNotify) {
      browser.runtime.sendMessage({ type: "ogc.repeatStop" }).catch(() => {});
    }
  }

  function toggleHelpPanel() {
    const id = "__ogc_help_panel__";
    const existing = document.getElementById(id);
    if (existing) { existing.remove(); return; }
    const panel = document.createElement("div");
    panel.id = id;
    panel.style.cssText = [
      "position:fixed", "top:0", "right:0", "width:min(340px,90vw)",
      "height:100vh", "z-index:2147483647", "background:#fff",
      "box-shadow:-8px 0 24px rgba(0,0,0,.22)", "border-left:1px solid #ddd"
    ].join(";");
    const frame = document.createElement("iframe");
    frame.src = browser.runtime.getURL("sidebar/sidebar.html");
    frame.title = "OGC — Aide gestes";
    frame.style.cssText = "width:100%;height:100%;border:0;display:block";
    panel.appendChild(frame);
    document.documentElement.appendChild(panel);
  }

  function buildContext() {
    const sel = window.getSelection?.()?.toString?.() ?? "";
    const link = downTarget?.closest?.("a[href]");
    const img  = downTarget?.closest?.("img[src]");
    const editable = !!downTarget?.closest?.(
      "input, textarea, [contenteditable=''], [contenteditable='true']"
    );
    return {
      selection: sel,
      // Priorité au 1er hyperlien franchi par le geste ; à défaut, celui
      // sous le point de départ.
      linkHref: firstLinkHref ?? link?.href ?? null,
      imageSrc: img?.src ?? null,
      inEditable: editable
    };
  }

  function captureLinkAt(x, y, fallbackTarget) {
    if (firstLinkHref) return;
    let el = null;
    try { el = document.elementFromPoint(x, y); } catch {}
    el = el || fallbackTarget;
    const a = el?.closest?.("a[href]");
    if (a?.href) firstLinkHref = a.href;
  }

  function clearTimers() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  function scheduleLongPress() {
    clearTimers();
    longPressTimer = setTimeout(() => {
      if (!active) return;
      if (performance.now() - lastMoveAt < LONG_PRESS_MS - 20) return;
      const seq = recognizer.sequence();
      if (seq.length === 0) return;
      longPressFired = true;
      longPressActive = true;
      if (settings.tooltips) window.OGC_Tooltips?.show("⏷ " + seq);
      browser.runtime.sendMessage({
        type: "ogc.stroke",
        points: points.slice(),
        actionHint: window.OGC_VOCABULARY?.[seq] || null,
        context: { ...buildContext(), longPress: true }
      });
    }, LONG_PRESS_MS);
  }

  function onDown(e) {
    if (!settings.enabled || e.button !== settings.button) return;
    active = true;
    suppressContext = false;
    longPressFired = false;
    longPressActive = false;
    downTarget = e.target;
    firstLinkHref = null;
    recognizer.reset();
    points.length = 0;
    points.push([e.clientX, e.clientY]);
    recognizer.addPoint(e.clientX, e.clientY);
    captureLinkAt(e.clientX, e.clientY, e.target);
    lastMoveAt = performance.now();
    if (settings.trails) window.OGC_Trails?.start(e.clientX, e.clientY);
    window.OGC_Tooltips?.show("");
  }

  function onMove(e) {
    if (!active) return;
    points.push([e.clientX, e.clientY]);
    recognizer.addPoint(e.clientX, e.clientY);
    captureLinkAt(e.clientX, e.clientY, e.target);
    lastMoveAt = performance.now();
    if (longPressFired) { clearTimers(); return; }
    scheduleLongPress();
    if (settings.trails) window.OGC_Trails?.lineTo(e.clientX, e.clientY);
    const seq = recognizer.sequence();
    if (settings.tooltips) window.OGC_Tooltips?.show(seq);
  }

  function onUp(e) {
    if (!active) { stopLongPressRepeat(); return; }
    active = false;
    clearTimers();
    const previewSeq = recognizer.sequence();
    if (settings.trails) window.OGC_Trails?.end();
    setTimeout(() => window.OGC_Tooltips?.hide(), 1500);
    if (longPressFired) stopLongPressRepeat();
    if (previewSeq.length > 0) {
      suppressContext = true;
      e.preventDefault();
      if (longPressFired) return;
      browser.runtime.sendMessage({
        type: "ogc.stroke",
        points: points.slice(),
        actionHint: window.OGC_VOCABULARY?.[previewSeq] || null,
        context: { ...buildContext(), longPress: false }
      });
    }
  }

  function onContext(e) {
    if (suppressContext) { e.preventDefault(); suppressContext = false; }
  }

  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", () => {
    if (!active) { stopLongPressRepeat(); return; }
    active = false; clearTimers(); stopLongPressRepeat();
  }, true);
  window.addEventListener("blur", () => {
    active = false;
    clearTimers();
  });
  window.addEventListener("contextmenu", onContext, true);
})();