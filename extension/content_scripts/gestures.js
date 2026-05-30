/* Gesture capture — long press fires while still holding the button. */
(function () {
  const LONG_PRESS_MS = 480;
  // Délai d'inactivité après l'appui : si l'utilisateur n'a pas commencé
  // de geste après ce délai, on annule le mode «capture de geste» pour
  // laisser le navigateur faire son travail standard (menu contextuel en
  // clic-droit, sélection texte en clic-gauche).
  const IDLE_RELEASE_MS = 1500;

  const recognizer = new OGC_Recognizer();
  const points = [];
  let active = false;
  let suppressContext = false;
  let downTarget = null;
  let lastMoveAt = 0;
  let longPressTimer = null;
  let longPressFired = false;
  // Position du pointerdown ; sert à détecter si un véritable mouvement a
  // eu lieu pendant l'appui (et donc si on doit inhiber le menu contextuel).
  let downX = 0;
  let downY = 0;
  let movedDuringPress = false;
  const MOVE_THRESHOLD_PX = 5;
  let idleReleaseTimer = null;
  let idleReleased = false;
  const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
  // Visible to the background: true tant que l'utilisateur maintient le
  // pointeur appuyé après le déclenchement initial du long-press.
  let longPressActive = false;
  // Premier hyperlien rencontré pendant le geste (au démarrage ou en cours).
  let firstLinkHref = null;
  // Sélection au moment du pointerdown : sur Chromium le clic droit peut
  // l'effacer immédiatement, on la fige donc dès le début du geste pour
  // que «Copier» et «Rechercher avec présélection» fonctionnent.
  let initialSelection = "";
  let initialEditable = false;
  let settings = { enabled: true, button: 2, trails: true, tooltips: true };

  browser.storage.local.get("settings").then((s) => {
    if (s.settings) settings = { ...settings, ...s.settings };
  });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.settings) settings = { ...settings, ...changes.settings.newValue };
  });

  // Le background interroge périodiquement l'onglet actif pour savoir si
  // l'appui long est toujours en cours avant de répéter l'action.
  // On utilise sendResponse + `return true` plutôt que de renvoyer une
  // Promise : c'est le seul motif fiable sur Chromium (Chrome, Edge, Opera,
  // Brave) — sur Edge en particulier, renvoyer une Promise depuis le
  // listener ne déclenche pas la réponse côté background.
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "ogc.pingLongPress") {
      sendResponse({ active: longPressActive });
      return true;
    }
    if (msg?.type === "ogc.adoptLongPress") {
      active = true;
      longPressFired = true;
      longPressActive = true;
      sendResponse({ active: true });
      return true;
    }
    if (msg?.type === "ogc.toggleHelpPanel") {
      toggleHelpPanel();
      sendResponse({ ok: true });
      return true;
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
    const liveSel = window.getSelection?.()?.toString?.() ?? "";
    const sel = liveSel || initialSelection || "";
    const link = downTarget?.closest?.("a[href]");
    const img  = downTarget?.closest?.("img[src]");
    const editable = initialEditable || !!downTarget?.closest?.(
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
    if (idleReleaseTimer) { clearTimeout(idleReleaseTimer); idleReleaseTimer = null; }
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

  function scheduleIdleRelease(button) {
    if (idleReleaseTimer) clearTimeout(idleReleaseTimer);
    idleReleaseTimer = setTimeout(() => {
      if (!active || movedDuringPress) return;
      // L'utilisateur a marqué un temps d'arrêt sans déclencher de geste :
      // on sort du mode capture pour rendre la main au navigateur.
      idleReleased = true;
      active = false;
      clearTimers();
      restoreUserSelect();
      if (settings.trails) window.OGC_Trails?.end();
      window.OGC_Tooltips?.hide();
      if (button === 2) {
        // Clic-droit maintenu sans geste : on autorise / on rejoue le
        // menu contextuel.
        suppressContext = false;
        if (IS_MAC) {
          try {
            const evt = new MouseEvent("contextmenu", {
              bubbles: true, cancelable: true, view: window,
              clientX: downX, clientY: downY,
              button: 2, buttons: 0,
            });
            (downTarget || document.documentElement).dispatchEvent(evt);
          } catch {}
        }
      }
      // En clic-gauche, restaurer user-select suffit : tout déplacement
      // ultérieur produira une sélection texte native.
    }, IDLE_RELEASE_MS);
  }

  function onDown(e) {
    if (!settings.enabled || e.button !== settings.button) return;
    // (1) En mode clic-gauche on bloque tout de suite la sélection / drag.
    // (2) En mode clic-droit on ne suppose PAS encore qu'il y aura un
    //     geste : on n'inhibe le menu contextuel qu'au premier déplacement
    //     significatif (voir onMove). Exception : sur Firefox macOS le
    //     contextmenu est délivré synchroniquement sur pointerdown, donc on
    //     preventDefault le pointerdown pour le suspendre — si aucun
    //     mouvement n'arrive, on rejouera un contextmenu synthétique sur
    //     pointerup pour que le clic droit nu ouvre quand même le menu.
    suppressContext = false;
    movedDuringPress = false;
    idleReleased = false;
    if (e.button === 0 || IS_MAC) {
      try { e.preventDefault(); } catch {}
    }
    // Sur Firefox macOS, preventDefault sur pointerdown/mousedown ne
    // suffit pas à inhiber la sélection texte qui se construit pendant
    // le glissement. On force user-select:none sur tout le document le
    // temps du geste, puis on rétablit à pointerup/cancel.
    try {
      const de = document.documentElement;
      if (de && !de.hasAttribute("data-ogc-prev-userselect")) {
        de.setAttribute("data-ogc-prev-userselect", de.style.userSelect || "");
        de.style.userSelect = "none";
        de.style.webkitUserSelect = "none";
        de.style.MozUserSelect = "none";
      }
    } catch {}
    try {
      // Vide toute sélection déjà présente sous le pointeur (sinon Firefox
      // l'étend au fur et à mesure que la souris bouge sur du texte).
      const s = window.getSelection?.();
      if (s && s.rangeCount && !initialEditable) s.removeAllRanges();
    } catch {}
    active = true;
    longPressFired = false;
    longPressActive = false;
    downTarget = e.target;
    downX = e.clientX;
    downY = e.clientY;
    firstLinkHref = null;
    try { initialSelection = window.getSelection?.()?.toString?.() ?? ""; }
    catch { initialSelection = ""; }
    initialEditable = !!e.target?.closest?.(
      "input, textarea, [contenteditable=''], [contenteditable='true']"
    );
    recognizer.reset();
    points.length = 0;
    points.push([e.clientX, e.clientY]);
    recognizer.addPoint(e.clientX, e.clientY);
    captureLinkAt(e.clientX, e.clientY, e.target);
    lastMoveAt = performance.now();
    if (settings.trails) window.OGC_Trails?.start(e.clientX, e.clientY);
    window.OGC_Tooltips?.show("");
    scheduleIdleRelease(e.button);
  }

  function onMove(e) {
    if (!active) return;
    if (idleReleaseTimer && !movedDuringPress) {
      // Tant qu'il n'y a pas eu de déplacement significatif, on garde
      // la fenêtre d'inactivité ouverte.
    }
    if (!movedDuringPress) {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx*dx + dy*dy >= MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
        movedDuringPress = true;
        if (idleReleaseTimer) { clearTimeout(idleReleaseTimer); idleReleaseTimer = null; }
        // Mouvement réel → on bloque l'éventuel menu contextuel qui
        // arriverait sur pointerup (Windows / Linux), et on inhibe la
        // sélection / le drag pour la suite du geste.
        suppressContext = true;
      }
    }
    // Sur clic-gauche, le navigateur tente d'étendre la sélection / de
    // démarrer un drag pendant qu'on dessine. On annule les deux.
    try { e.preventDefault(); } catch {}
    try {
      const s = window.getSelection?.();
      if (s && s.rangeCount && !initialEditable) s.removeAllRanges();
    } catch {}
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
    if (idleReleased) {
      idleReleased = false;
      stopLongPressRepeat();
      return;
    }
    if (!active) { stopLongPressRepeat(); return; }
    active = false;
    clearTimers();
    restoreUserSelect();
    const previewSeq = recognizer.sequence();
    if (settings.trails) window.OGC_Trails?.end();
    setTimeout(() => window.OGC_Tooltips?.hide(), 1500);
    if (longPressFired) stopLongPressRepeat();
    // Clic droit nu (aucun déplacement) → on laisse / on rejoue le menu
    // contextuel système.
    if (e.button === 2 && !movedDuringPress && previewSeq.length === 0) {
      suppressContext = false;
      if (IS_MAC) {
        // Sur Firefox macOS le contextmenu d'origine a été inhibé par le
        // preventDefault du pointerdown ; on en rejoue un sur la cible.
        try {
          const evt = new MouseEvent("contextmenu", {
            bubbles: true, cancelable: true, view: window,
            clientX: e.clientX, clientY: e.clientY,
            screenX: e.screenX, screenY: e.screenY,
            button: 2, buttons: 0,
          });
          (e.target || downTarget || document.documentElement).dispatchEvent(evt);
        } catch {}
      }
      return;
    }
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

  function restoreUserSelect() {
    try {
      const de = document.documentElement;
      if (de && de.hasAttribute("data-ogc-prev-userselect")) {
        const prev = de.getAttribute("data-ogc-prev-userselect") || "";
        de.style.userSelect = prev;
        de.style.webkitUserSelect = prev;
        de.style.MozUserSelect = prev;
        de.removeAttribute("data-ogc-prev-userselect");
      }
    } catch {}
  }

  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  // Bloque le drag natif d'images / liens / texte sélectionné pendant un
  // geste clic-gauche.
  window.addEventListener("dragstart", (e) => {
    if (active) { try { e.preventDefault(); } catch {} }
  }, true);
  // Bloque l'extension de sélection initiée par mousedown sur du texte.
  window.addEventListener("selectstart", (e) => {
    // En mode clic-gauche, selectstart peut être délivré avant que pointerdown
    // n'ait positionné `active` (notamment sur Firefox macOS). On bloque donc
    // dès qu'on est en mode clic-gauche, hors champs éditables.
    if ((active || (settings.enabled && settings.button === 0))
        && !initialEditable
        && !e.target?.closest?.("input, textarea, [contenteditable=''], [contenteditable='true']")) {
      try { e.preventDefault(); } catch {}
    }
  }, true);
  // Sur clic-gauche, mousedown peut donner le focus + démarrer un drag avant
  // pointerdown : on l'intercepte aussi.
  window.addEventListener("mousedown", (e) => {
    if (settings.enabled && e.button === settings.button && settings.button === 0) {
      try { e.preventDefault(); } catch {}
    }
  }, true);
  window.addEventListener("pointercancel", () => {
    if (!active) { stopLongPressRepeat(); return; }
    active = false; clearTimers(); restoreUserSelect(); stopLongPressRepeat();
  }, true);
  window.addEventListener("blur", () => {
    active = false;
    clearTimers();
    restoreUserSelect();
  });
  window.addEventListener("contextmenu", onContext, true);
})();