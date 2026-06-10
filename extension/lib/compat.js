/* Cross-browser compatibility shim.
 * Firefox exposes the promise-based `browser.*` namespace; Chrome / Edge /
 * Opera / Brave expose `chrome.*`. In Chrome MV3 most APIs already return
 * promises natively, so simply aliasing is enough for our use cases. */
(function () {
  if (typeof globalThis.browser === "undefined" && typeof globalThis.chrome !== "undefined") {
    globalThis.browser = globalThis.chrome;
  }
  // Détection plateforme — utilisée par les modules pour adapter le
  // comportement (entrées tactiles, UI alternative) sur Firefox Android.
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const isAndroid = /Android/i.test(ua);
  globalThis.OGC = globalThis.OGC || {};
  globalThis.OGC.isAndroid = isAndroid;
  globalThis.OGC.isFenix = isAndroid && /Firefox/i.test(ua);
})();
