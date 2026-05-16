/* OGCStore — accès unifié au stockage des gestes personnalisés.
 * Stratégie : on lit prioritairement storage.sync (préservé par la
 * synchronisation du navigateur — Firefox Sync, profil Chrome/Edge,
 * compte Opera) ; sinon on retombe sur storage.local. Les écritures
 * vont systématiquement dans les deux, pour garantir la persistance
 * même quand la sync n'est pas active sur ce profil.
 * Conséquence pratique : si l'utilisateur réinstalle l'extension
 * sur un profil synchronisé, ses gestes personnalisés sont retrouvés.
 */
(function () {
  const KEY = "customGestures";
  const hasSync = !!(globalThis.browser?.storage?.sync || globalThis.chrome?.storage?.sync);

  async function getCustom() {
    if (hasSync) {
      try {
        const r = await browser.storage.sync.get(KEY);
        const cg = r?.[KEY];
        if (cg && Object.keys(cg).length) return cg;
      } catch {}
    }
    try {
      const r = await browser.storage.local.get(KEY);
      return r?.[KEY] || {};
    } catch { return {}; }
  }

  async function setCustom(cg) {
    const value = cg || {};
    try { await browser.storage.local.set({ [KEY]: value }); } catch {}
    if (hasSync) {
      try { await browser.storage.sync.set({ [KEY]: value }); } catch {}
    }
  }

  function onCustomChanged(cb) {
    try {
      browser.storage.onChanged.addListener((changes, area) => {
        if (changes[KEY]) cb(changes[KEY].newValue || {}, area);
      });
    } catch {}
  }

  globalThis.OGCStore = { getCustom, setCustom, onCustomChanged };
})();
