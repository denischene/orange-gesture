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
  function speak(text) {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !text) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";
      u.rate = 1;
      u.pitch = 1;
      synth.speak(u);
    } catch (e) { /* ignore */ }
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
      if (msg.voice) speak(msg.label);
    }
  });
})();