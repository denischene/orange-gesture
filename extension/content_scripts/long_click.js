/* Long-click detector — replaces OGC_LongClick.js. Emits a custom event after
 * the configured delay if the pointer is still pressed without movement. */
(function () {
  const DELAY = 500;
  let timer = null, startX = 0, startY = 0;
  window.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("ogc:longclick", { detail: { x: startX, y: startY } }));
    }, DELAY);
  }, true);
  ["pointerup", "pointermove", "pointercancel"].forEach((ev) =>
    window.addEventListener(ev, (e) => {
      if (timer && (ev !== "pointermove" || Math.hypot(e.clientX - startX, e.clientY - startY) > 6)) {
        clearTimeout(timer); timer = null;
      }
    }, true)
  );
})();