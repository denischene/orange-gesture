/* Gesture capture — replaces OGC_Functions.js + OGC_Overlay.js.
 * Right-button drag captures pointer movement; on release, the recognized
 * sequence is sent to the background service worker for action dispatch.
 */
(function () {
  const recognizer = new OGC_Recognizer();
  const points = [];
  let active = false;
  let suppressContext = false;
  let settings = { enabled: true, button: 2, trails: true, tooltips: true };

  browser.storage.local.get("settings").then((s) => {
    if (s.settings) settings = { ...settings, ...s.settings };
  });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.settings) settings = { ...settings, ...changes.settings.newValue };
  });

  function onDown(e) {
    if (!settings.enabled || e.button !== settings.button) return;
    active = true;
    suppressContext = false;
    recognizer.reset();
    points.length = 0;
    points.push([e.clientX, e.clientY]);
    recognizer.addPoint(e.clientX, e.clientY);
    if (settings.trails) window.OGC_Trails?.start(e.clientX, e.clientY);
    window.OGC_Tooltips?.show("");
  }

  function onMove(e) {
    if (!active) return;
    points.push([e.clientX, e.clientY]);
    recognizer.addPoint(e.clientX, e.clientY);
    if (settings.trails) window.OGC_Trails?.lineTo(e.clientX, e.clientY);
    const seq = recognizer.sequence();
    const action = OGC_VOCABULARY[seq];
    if (settings.tooltips) window.OGC_Tooltips?.show(seq + (action ? "  →  " + action : ""));
  }

  function onUp(e) {
    if (!active) return;
    active = false;
    const previewSeq = recognizer.sequence();
    if (settings.trails) window.OGC_Trails?.end();
    window.OGC_Tooltips?.hide();
    if (previewSeq.length > 0) {
      suppressContext = true;
      // Authoritative recognition runs in the background via the WASM engine.
      browser.runtime.sendMessage({ type: "ogc.stroke", points: points.slice() });
      e.preventDefault();
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