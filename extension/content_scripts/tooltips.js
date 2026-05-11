/* Floating label that mirrors the recognized sequence — replaces OGC_Tooltips.js. */
(function () {
  let el;
  function ensure() {
    if (el) return;
    el = document.createElement("div");
    el.id = "ogc-tooltip";
    document.documentElement.appendChild(el);
  }
  window.OGC_Tooltips = {
    show(text) { ensure(); el.textContent = text; el.style.display = "block"; },
    hide() { if (el) el.style.display = "none"; }
  };
})();