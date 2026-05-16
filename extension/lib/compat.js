/* Cross-browser compatibility shim.
 * Firefox exposes the promise-based `browser.*` namespace; Chrome / Edge /
 * Opera / Brave expose `chrome.*`. In Chrome MV3 most APIs already return
 * promises natively, so simply aliasing is enough for our use cases. */
(function () {
  if (typeof globalThis.browser === "undefined" && typeof globalThis.chrome !== "undefined") {
    globalThis.browser = globalThis.chrome;
  }
})();
