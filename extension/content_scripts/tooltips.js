/* Floating French label that mirrors the recognized sequence + final action.
 * Receives "ogc.feedback" from the background to display the action label.
 */
(function () {
  let el;
  let hideTimer = null;
  function ensure() {
    if (el) return;
    el = document.createElement("div");
    el.id = "ogc-tooltip";
    document.documentElement.appendChild(el);
  }
  function clearHide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }
  window.OGC_Tooltips = {
    show(text) {
      ensure();
      clearHide();
      el.textContent = text || "";
      el.classList.remove("ogc-long");
      el.style.display = "block";
    },
    showAction(text, isLong) {
      ensure();
      clearHide();
      el.textContent = text || "";
      el.classList.toggle("ogc-long", !!isLong);
      el.style.display = "block";
      // Long-press feedback stays visible 2s; short stays 1.2s.
      hideTimer = setTimeout(() => { el.style.display = "none"; },
                             isLong ? 2000 : 1200);
    },
    hide() {
      if (!el) return;
      clearHide();
      el.style.display = "none";
    }
  };
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "ogc.feedback") {
      window.OGC_Tooltips.showAction(msg.label, msg.long);
    }
  });
})();