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
  // Premier hyperlien rencontré pendant le geste (au démarrage ou en cours).
  let firstLinkHref = null;
  let settings = { enabled: true, button: 2, trails: true, tooltips: true };

  browser.storage.local.get("settings").then((s) => {
    if (s.settings) settings = { ...settings, ...s.settings };
  });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.settings) settings = { ...settings, ...changes.settings.newValue };
  });

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
      if (settings.tooltips) window.OGC_Tooltips?.show("⏷ " + seq);
      browser.runtime.sendMessage({
        type: "ogc.stroke",
        points: points.slice(),
        context: { ...buildContext(), longPress: true }
      });
    }, LONG_PRESS_MS);
  }

  function onDown(e) {
    if (!settings.enabled || e.button !== settings.button) return;
    active = true;
    suppressContext = false;
    longPressFired = false;
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
    if (!active) return;
    active = false;
    clearTimers();
    const previewSeq = recognizer.sequence();
    if (settings.trails) window.OGC_Trails?.end();
    setTimeout(() => window.OGC_Tooltips?.hide(), 1500);
    if (longPressFired) {
      // Stop background-driven repetition.
      browser.runtime.sendMessage({ type: "ogc.repeatStop" }).catch(() => {});
    }
    if (previewSeq.length > 0) {
      suppressContext = true;
      e.preventDefault();
      if (longPressFired) return;
      browser.runtime.sendMessage({
        type: "ogc.stroke",
        points: points.slice(),
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
  window.addEventListener("contextmenu", onContext, true);
})();